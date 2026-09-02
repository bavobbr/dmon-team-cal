import { siteFetch, SITE_BASE, decodeHtml } from './site-fetch';
import { getCurrentSeasonId } from './season';
import { ORG_ID } from './constants';
import type { Group } from '../types';

const ALLOWED_CATEGORIES = new Set(['Onderbouw', 'Middenbouw', 'Bovenbouw']);

// ─── fetchGroups ──────────────────────────────────────────────────────────────

export async function fetchGroups(): Promise<Group[]> {
	const seasonId = await getCurrentSeasonId();
	const url =
		`${SITE_BASE}/v2/ajax/group/search` +
		`?seasonId=${seasonId}&organizationId=${ORG_ID}&active=1` +
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
//
// The feed has no end-date parameter (endDate/end-date are silently ignored),
// so the upper bound is applied here. `limit` is capped at 50 server-side —
// anything larger silently falls back to 10 — so longer ranges are paged with
// `offset`. Trainings are dropped after paging, since they count towards the
// page size.

const FEED_PAGE_SIZE = 50;
const FEED_MAX_PAGES = 20;

interface FeedEvent {
	id: number;
	date: string;
	name: string;
}

function parseFeedPage(html: string): FeedEvent[] {
	const events: FeedEvent[] = [];

	// Split by data-id attribute to find each activity block
	const parts = html.split(/data-id="(\d+)"/);
	for (let i = 1; i < parts.length; i += 2) {
		const id = Number(parts[i]);
		const block = parts[i + 1] ?? '';

		const dateMatch = block.match(/data-date="([^"]+)"/);
		if (!dateMatch) continue;

		const nameMatch = block.match(/<strong>([^<]+)<\/strong>/);
		if (!nameMatch) continue;

		events.push({ id, date: dateMatch[1], name: nameMatch[1].trim() });
	}

	return events;
}

export async function fetchMatchFeed(
	groupId: number,
	startDate: string,
	endDate?: string
): Promise<FeedEvent[]> {
	const matches: FeedEvent[] = [];

	for (let page = 0; page < FEED_MAX_PAGES; page++) {
		const url =
			`${SITE_BASE}/v2/ajax/feed` +
			`?favoriteId=${groupId}&favoriteType=group&startDate=${startDate}` +
			`&direction=future&limit=${FEED_PAGE_SIZE}&offset=${page * FEED_PAGE_SIZE}`;
		const events = parseFeedPage(await siteFetch(url));

		let pastEnd = false;
		for (const event of events) {
			// data-date is "YYYY-MM-DD HH:MM"; ISO dates compare correctly as strings
			if (endDate && event.date.slice(0, 10) > endDate) {
				pastEnd = true;
				break;
			}
			if (event.name.endsWith('Training')) continue;
			matches.push(event);
		}

		// A short page means the feed is exhausted
		if (pastEnd || events.length < FEED_PAGE_SIZE) break;
	}

	return matches;
}
