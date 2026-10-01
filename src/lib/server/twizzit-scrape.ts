import { getSiteCookie, clearCookieCache } from './auth';
import type { ActivityDetails, AttendanceContact, Attendance } from '../types';

const SITE_BASE = 'https://app.twizzit.com';

// ─── Cache + concurrency limit ────────────────────────────────────────────────
//
// A half-season of trainings across all teams is ~1000 activity pages, and a
// training shared by two teams (e.g. "U19B1, H1") is requested by both. Cache
// parsed results for 10 minutes like siteFetch does, share in-flight requests,
// and cap how many pages are fetched from Twizzit at the same time.

const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_CONCURRENT = 8;

const detailsCache = new Map<number, { details: ActivityDetails; expiresAt: number }>();
const detailsInFlight = new Map<number, Promise<ActivityDetails>>();

let active = 0;
const waiting: Array<() => void> = [];

async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
	if (active >= MAX_CONCURRENT) await new Promise<void>((resolve) => waiting.push(resolve));
	active++;
	try {
		return await fn();
	} finally {
		active--;
		waiting.shift()?.();
	}
}

export async function fetchActivityDetails(eventId: number): Promise<ActivityDetails> {
	const cached = detailsCache.get(eventId);
	if (cached && cached.expiresAt > Date.now()) return cached.details;

	const pending = detailsInFlight.get(eventId);
	if (pending) return pending;

	const request = withSlot(async () => doFetch(eventId, await getSiteCookie()))
		.then((details) => {
			detailsCache.set(eventId, { details, expiresAt: Date.now() + CACHE_TTL_MS });
			return details;
		})
		.finally(() => {
			detailsInFlight.delete(eventId);
		});

	detailsInFlight.set(eventId, request);
	return request;
}

async function doFetch(eventId: number, cookie: string, isRetry = false): Promise<ActivityDetails> {
	const url = `${SITE_BASE}/v2/activity/details?activity=${eventId}&view=info`;

	const res = await fetch(url, {
		headers: { Cookie: cookie },
		redirect: 'manual'
	});

	// 302 = session expired — retry once with fresh cookie
	if ((res.status === 302 || res.status === 403) && !isRetry) {
		clearCookieCache();
		const freshCookie = await getSiteCookie();
		return doFetch(eventId, freshCookie, true);
	}

	if (res.status === 302 || res.status === 403) {
		throw new Error(`Activity fetch for ${eventId} failed after cookie refresh: ${res.status}`);
	}

	if (!res.ok) throw new Error(`Activity fetch failed for ${eventId}: ${res.status}`);

	const html = await res.text();
	return parseActivityDetails(eventId, html);
}

/**
 * Extract a JSON object value that follows a given keyword in the JS source.
 * The outer initActivityDetails() argument is a JS object literal (unquoted keys, comments),
 * not valid JSON. But the values of attendanceContacts and attendances ARE valid JSON.
 * We locate each key by name and walk the { } to extract its JSON value.
 */
function extractJsonSection(html: string, keyword: string): Record<string, unknown> | null {
	const keyIdx = html.indexOf(keyword);
	if (keyIdx === -1) return null;

	// Find the opening { or [ immediately after the keyword (skip whitespace/colon)
	let start = keyIdx + keyword.length;
	while (start < html.length && /[\s:]/.test(html[start])) start++;

	// If the value is an empty array [] or non-object, return empty object
	if (html[start] === '[') return {};

	if (html[start] !== '{') return null;

	let depth = 0;
	let i = start;
	let inString = false;
	let escape = false;
	let stringChar = '';

	while (i < html.length) {
		const ch = html[i];

		if (escape) {
			escape = false;
			i++;
			continue;
		}
		if (inString) {
			if (ch === '\\') escape = true;
			else if (ch === stringChar) inString = false;
			i++;
			continue;
		}
		if (ch === '"' || ch === "'") {
			inString = true;
			stringChar = ch;
			i++;
			continue;
		}
		if (ch === '{') depth++;
		else if (ch === '}') {
			depth--;
			if (depth === 0) {
				i++;
				break;
			}
		}
		i++;
	}

	try {
		return JSON.parse(html.slice(start, i)) as Record<string, unknown>;
	} catch {
		return null;
	}
}

/**
 * PHP's json_encode turns a list into an object as soon as its keys are not a
 * contiguous 0..n range, so contactFunctions arrives as ["Speler"] for most
 * contacts but as {"0":"Trainer","1":"Coach","3":"Speler"} for anyone whose
 * function indices have a gap. Normalise both shapes to a plain string[].
 */
function toStringArray(value: unknown): string[] {
	if (Array.isArray(value)) return value as string[];
	if (value && typeof value === 'object') return Object.values(value as Record<string, string>);
	return [];
}

function parseActivityDetails(eventId: number, html: string): ActivityDetails {
	if (!html.includes('initActivityDetails')) {
		throw new Error(`initActivityDetails not found in event ${eventId} — may not be logged in`);
	}

	// eventType mirrors the activity subtype's family in Twizzit's settings:
	// 1 = event, 2 = training, 3 = Wedstrijd (match), 4 = shift. This is the
	// authoritative answer to "is this a real match?".
	const eventTypeMatch = html.match(/eventType:\s*(\d+)/);
	const eventType = eventTypeMatch ? Number(eventTypeMatch[1]) : null;

	// Extract homeTeamId — used to determine home/away for the match
	const homeTeamMatch = html.match(/homeTeamId:\s*"(\d+)"/);
	const homeTeamId = homeTeamMatch ? Number(homeTeamMatch[1]) : null;

	// Extract attendanceContacts — confirmed shape:
	// { "contactId": { id: "str", fullName: "Lastname Firstname", contactFunctions: ["Speler", ...] } }
	// contactFunctions is usually a string[] but can be an index-keyed object — see toStringArray
	const contactsRaw = extractJsonSection(html, 'attendanceContacts:') ?? {};
	const contacts: AttendanceContact[] = Object.entries(contactsRaw).map(([, c]) => {
		const contact = c as Record<string, unknown>;
		return {
			id: Number(contact['id']),
			fullName: contact['fullName'] as string,
			contactFunctions: toStringArray(contact['contactFunctions'])
		};
	});

	// Extract attendances — confirmed shape:
	// { "contactId": { attendanceTypeId: "42033" (string!), attendanceTypeName: "...", comment: null } }
	const attendancesRaw = extractJsonSection(html, 'attendances:') ?? {};
	const attendances: Attendance[] = Object.entries(attendancesRaw).map(([contactId, a]) => {
		const att = a as Record<string, unknown>;
		return {
			contactId: Number(contactId),
			// attendanceTypeId is a string in the API ("42028" / "42033" / "42038")
			attendanceTypeId: Number(att['attendanceTypeId']),
			attendanceTypeName: att['attendanceTypeName'] as string,
			comment: (att['comment'] ?? null) as string | null
		};
	});

	return { eventId, eventType, homeTeamId, contacts, attendances };
}
