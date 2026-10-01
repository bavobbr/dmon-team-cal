import { siteFetch, SITE_BASE } from './site-fetch';
import { ORG_ID, FALLBACK_SEASON_ID } from './constants';
import type { Season, DateRange } from '../types';

// ─── Current season discovery ─────────────────────────────────────────────────
//
// Twizzit stores the season list under Settings → Seizoenen. The season edit
// form carries a `current[<orgId>]` checkbox that is checked for exactly one
// season, which is the one Twizzit itself defaults to. Reading it here means a
// season rollover needs no code change.

const SEASON_TTL_MS = 6 * 60 * 60 * 1000;

let seasonCache: { season: Season; expiresAt: number } | null = null;
let seasonInFlight: Promise<Season> | null = null;

function parseSeasonIds(html: string): number[] {
	// Rows are rendered newest-first: <div class="... season" data-id="65068">
	const ids = [...html.matchAll(/class="[^"]*\bseason\b[^"]*"[^>]*data-id="(\d+)"/g)].map((m) =>
		Number(m[1])
	);
	return [...new Set(ids)];
}

function inputValue(html: string, name: string): string | null {
	const re = new RegExp(`<input[^>]*name="${name.replace(/[[\]]/g, '\\$&')}"[^>]*>`, 'g');
	for (const m of html.matchAll(re)) {
		const value = m[0].match(/value="([^"]*)"/);
		if (value && value[1] !== '') return value[1];
	}
	return null;
}

function isCurrentForOrg(html: string): boolean {
	const re = new RegExp(`<input[^>]*name="current\\[${ORG_ID}\\]"[^>]*>`, 'g');
	for (const m of html.matchAll(re)) {
		if (/type="checkbox"/.test(m[0]) && /\bchecked\b/.test(m[0])) return true;
	}
	return false;
}

async function fetchSeasonDetails(seasonId: number): Promise<Season | null> {
	const raw = await siteFetch(`${SITE_BASE}/v2/ajax/settings/page/season/edit?seasonId=${seasonId}`);

	// The endpoint answers with either bare HTML or { status, html }
	let html = raw;
	try {
		const parsed = JSON.parse(raw) as { html?: string };
		if (typeof parsed.html === 'string') html = parsed.html;
	} catch {
		/* already HTML */
	}

	if (!isCurrentForOrg(html)) return null;

	return {
		id: seasonId,
		name: inputValue(html, 'name') ?? String(seasonId),
		startDate: inputValue(html, 'start-date'),
		endDate: inputValue(html, 'end-date')
	};
}

async function discoverCurrentSeason(): Promise<Season> {
	const listHtml = await siteFetch(`${SITE_BASE}/v2/ajax/settings/page/seasons`);
	const ids = parseSeasonIds(listHtml);
	if (ids.length === 0) throw new Error('No seasons found on the settings page');

	// Newest first, so the current season is normally the very first lookup
	for (const id of ids) {
		const season = await fetchSeasonDetails(id);
		if (season) return season;
	}

	throw new Error(`No season marked current for organization ${ORG_ID}`);
}

export async function getCurrentSeason(): Promise<Season> {
	if (seasonCache && seasonCache.expiresAt > Date.now()) return seasonCache.season;
	if (seasonInFlight) return seasonInFlight;

	seasonInFlight = discoverCurrentSeason()
		.then((season) => {
			console.log(`[season] current season: ${season.name} (id=${season.id})`);
			seasonCache = { season, expiresAt: Date.now() + SEASON_TTL_MS };
			return season;
		})
		.catch((err) => {
			console.error('[season] discovery failed, using fallback:', err);
			const season: Season = {
				id: FALLBACK_SEASON_ID,
				name: `fallback ${FALLBACK_SEASON_ID}`,
				startDate: null,
				endDate: null
			};
			// Cache the fallback briefly so a broken settings page does not
			// re-trigger discovery on every single request.
			seasonCache = { season, expiresAt: Date.now() + 10 * 60 * 1000 };
			return season;
		})
		.finally(() => {
			seasonInFlight = null;
		});

	return seasonInFlight;
}

export async function getCurrentSeasonId(): Promise<number> {
	return (await getCurrentSeason()).id;
}

// ─── Half-season date ranges ──────────────────────────────────────────────────
//
// The club splits the year in two: 1 August – 31 December (autumn) and
// 1 January – 31 July (spring). Together they tile the calendar year with no
// gap or overlap, so today's date always falls in exactly one of them.

function iso(year: number, month: number, day: number): string {
	return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function getHalfSeasonRange(now: Date = new Date()): DateRange {
	const year = now.getFullYear();
	const isAutumn = now.getMonth() >= 7; // 0-indexed: 7 = August
	return isAutumn
		? { from: iso(year, 8, 1), to: iso(year, 12, 31) }
		: { from: iso(year, 1, 1), to: iso(year, 7, 31) };
}

// ─── Relative ranges ──────────────────────────────────────────────────────────
//
// Twizzit's dates are Belgian wall-clock time ("YYYY-MM-DD HH:MM"), while the
// server may run in UTC (Cloud Run). Compare against Brussels time so a
// training at 20:30 does not count as "already happened" at 19:00 local.

const BRUSSELS = new Intl.DateTimeFormat('sv-SE', {
	timeZone: 'Europe/Brussels',
	year: 'numeric',
	month: '2-digit',
	day: '2-digit',
	hour: '2-digit',
	minute: '2-digit',
	hour12: false
});

/** Current Brussels time as "YYYY-MM-DD HH:MM", comparable with Twizzit's dates */
export function brusselsNow(now: Date = new Date()): string {
	return BRUSSELS.format(now);
}

/** The last `days` days up to and including today (Brussels) */
export function getRecentRange(days: number, now: Date = new Date()): DateRange {
	const to = brusselsNow(now).slice(0, 10);
	const from = new Date(`${to}T00:00:00Z`);
	from.setUTCDate(from.getUTCDate() - days);
	return { from: from.toISOString().slice(0, 10), to };
}
