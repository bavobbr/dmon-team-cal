import { getSiteCookie, clearCookieCache } from './auth';
import type { ActivityDetails, AttendanceContact, Attendance } from '../types';

const SITE_BASE = 'https://app.twizzit.com';

export async function fetchActivityDetails(eventId: number): Promise<ActivityDetails> {
	const cookie = await getSiteCookie();
	return doFetch(eventId, cookie);
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

function parseActivityDetails(eventId: number, html: string): ActivityDetails {
	if (!html.includes('initActivityDetails')) {
		throw new Error(`initActivityDetails not found in event ${eventId} — may not be logged in`);
	}

	// Extract homeTeamId — used to determine home/away for the match
	const homeTeamMatch = html.match(/homeTeamId:\s*"(\d+)"/);
	const homeTeamId = homeTeamMatch ? Number(homeTeamMatch[1]) : null;

	// Extract attendanceContacts — confirmed shape:
	// { "contactId": { id: "str", fullName: "Lastname Firstname", contactFunctions: ["Speler", ...] } }
	const contactsRaw = extractJsonSection(html, 'attendanceContacts:') ?? {};
	const contacts: AttendanceContact[] = Object.entries(contactsRaw).map(([, c]) => {
		const contact = c as Record<string, unknown>;
		return {
			id: Number(contact['id']),
			fullName: contact['fullName'] as string,
			// contactFunctions is string[] e.g. ["Speler"] or ["Coach", "Speler"]
			contactFunctions: (contact['contactFunctions'] ?? []) as string[]
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

	return { eventId, homeTeamId, contacts, attendances };
}
