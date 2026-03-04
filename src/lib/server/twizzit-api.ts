import { getSiteCookie, clearCookieCache } from './auth';
import { ORG_ID, SEASON_ID } from './constants';
import type { Group } from '../types';

const SITE_BASE = 'https://app.twizzit.com';

const ALLOWED_CATEGORIES = new Set(['Bovenbouw', 'Onderbouw', 'Trimmers']);

function decodeHtml(str: string): string {
	return str
		.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>');
}

// ─── URL-level response cache (10 min TTL) ────────────────────────────────────

const CACHE_TTL_MS = 10 * 60 * 1000;
const fetchCache = new Map<string, { body: string; expiresAt: number }>();

function makeCacheKey(method: string, url: string, options: RequestInit): string {
	const body = typeof options.body === 'string' ? options.body : '';
	return `${method}:${url}:${body}`;
}

// ─── Generic authenticated site fetch with cookie retry ───────────────────────

async function doSiteFetch(
	url: string,
	options: RequestInit,
	cookie: string,
	isRetry: boolean
): Promise<string> {
	const method = (options.method ?? 'GET').toUpperCase();
	const t0 = Date.now();
	const res = await fetch(url, {
		...options,
		headers: {
			...(options.headers as Record<string, string> | undefined),
			Cookie: cookie
		},
		redirect: 'manual'
	});
	console.log(`[twizzit] ${method} ${url} → ${res.status} (${Date.now() - t0}ms)${isRetry ? ' [retry]' : ''}`);

	if ((res.status === 302 || res.status === 403) && !isRetry) {
		clearCookieCache();
		const freshCookie = await getSiteCookie();
		return doSiteFetch(url, options, freshCookie, true);
	}

	if (res.status === 302 || res.status === 403) {
		throw new Error(`Fetch ${url} failed after cookie refresh: ${res.status}`);
	}

	if (!res.ok) throw new Error(`Fetch ${url} failed: ${res.status}`);
	return res.text();
}

async function siteFetch(url: string, options: RequestInit = {}): Promise<string> {
	const method = (options.method ?? 'GET').toUpperCase();
	const key = makeCacheKey(method, url, options);
	const cached = fetchCache.get(key);
	if (cached && cached.expiresAt > Date.now()) {
		console.log(`[twizzit] ${method} ${url} → (cached)`);
		return cached.body;
	}

	const cookie = await getSiteCookie();
	const body = await doSiteFetch(url, options, cookie, false);
	fetchCache.set(key, { body, expiresAt: Date.now() + CACHE_TTL_MS });
	return body;
}

// ─── fetchGroups ──────────────────────────────────────────────────────────────

export async function fetchGroups(): Promise<Group[]> {
	const url =
		`${SITE_BASE}/v2/ajax/group/search` +
		`?seasonId=${SEASON_ID}&organizationId=${ORG_ID}&active=1` +
		`&teamColumns[]=name&teamColumns[]=category`;
	const raw = await siteFetch(url);
	const json = JSON.parse(raw) as { teamResults: string };
	const html = json.teamResults;

	const groups: Group[] = [];

	// Each group row has an onclick="groupRelation(ID)" — split on that to find each block
	const parts = html.split(/onclick="groupRelation\((\d+)\)"/);
	console.log('[fetchGroups] parts count (groups*2+1):', parts.length);
	// parts[0] = prefix, then alternating [id, htmlBlock, id, htmlBlock, ...]
	for (let i = 1; i < parts.length; i += 2) {
		const id = Number(parts[i]);
		const block = parts[i + 1] ?? '';

		// Extract name: text content from the dl-cell div
		const nameMatch = block.match(/<div[^>]*class="[^"]*col py-2 d-flex dl-cell[^"]*"[^>]*>\s*([^<]+)/);
		if (!nameMatch) continue;
		const name = nameMatch[1].trim();

		// Skip inactive groups
		if (name.includes('Inactief')) continue;

		// Extract category name: text after the fa-circle icon
		const catMatch = block.match(/fa-circle[^>]*\/>\s*([^<\n]+)/);
		if (!catMatch) continue;
		const categoryName = catMatch[1].trim();

		if (!ALLOWED_CATEGORIES.has(categoryName)) continue;

		groups.push({ id, name, shortName: '', categoryName });
	}

	return groups;
}

// ─── fetchCompetitionTeamId ───────────────────────────────────────────────────

export async function fetchCompetitionTeamId(groupId: number): Promise<number | null> {
	const url = `${SITE_BASE}/v2/ajax/planning/group/ranking`;
	const html = await siteFetch(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: `group=${groupId}`
	});

	const match = html.match(/data-group="(\d+)"/);
	return match ? Number(match[1]) : null;
}

// ─── fetchGroupRoster ─────────────────────────────────────────────────────────

export async function fetchGroupRoster(
	groupId: number
): Promise<Array<{ id: number; fullName: string; role: string }>> {
	const url = `${SITE_BASE}/v2/ajax/group/profile?groupId=${groupId}`;
	const html = await siteFetch(url);

	const members: Array<{ id: number; fullName: string; role: string }> = [];

	// Split on contactRelation(ID) — one entry per member
	const parts = html.split(/onclick="contactRelation\((\d+)\)"/);
	for (let i = 1; i < parts.length; i += 2) {
		const id = Number(parts[i]);
		const block = parts[i + 1] ?? '';

		// Name text comes immediately after: >Name</a>
		const nameMatch = block.match(/^>([^<]+)<\/a>/);
		if (!nameMatch) continue;
		const fullName = decodeHtml(nameMatch[1].trim());

		// Role is in the next <div> after the name </div>
		const roleMatch = block.match(/<\/a>\s*<\/div>\s*<div>\s*([^<\n]+?)\s*<\/div>/);
		const role = roleMatch ? roleMatch[1].trim() : '';

		members.push({ id, fullName, role });
	}

	return members;
}

// ─── fetchMatchFeed ───────────────────────────────────────────────────────────

export async function fetchMatchFeed(
	groupId: number,
	startDate: string
): Promise<Array<{ id: number; date: string; name: string }>> {
	const url =
		`${SITE_BASE}/v2/ajax/feed` +
		`?favoriteId=${groupId}&favoriteType=group&startDate=${startDate}` +
		`&direction=future&limit=50`;
	const html = await siteFetch(url);

	const events: Array<{ id: number; date: string; name: string }> = [];

	// Split by data-id attribute to find each activity block
	const parts = html.split(/data-id="(\d+)"/);
	for (let i = 1; i < parts.length; i += 2) {
		const id = Number(parts[i]);
		const block = parts[i + 1] ?? '';

		// Extract date
		const dateMatch = block.match(/data-date="([^"]+)"/);
		if (!dateMatch) continue;
		const date = dateMatch[1];

		// Extract name from <strong>
		const nameMatch = block.match(/<strong>([^<]+)<\/strong>/);
		if (!nameMatch) continue;
		const name = nameMatch[1].trim();

		// Skip trainings
		if (name.endsWith('Training')) continue;

		events.push({ id, date, name });
	}

	return events;
}
