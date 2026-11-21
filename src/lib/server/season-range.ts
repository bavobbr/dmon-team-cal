import type { DateRange } from '../types';

// Pure date-range helpers. No runtime imports, so the tests run on plain Node.

function iso(year: number, month: number, day: number): string {
	return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// ─── Half-season date ranges (outdoor) ────────────────────────────────────────
//
// The club splits the year in two: 1 August – 31 December (autumn) and
// 1 January – 31 July (spring). Together they tile the calendar year with no
// gap or overlap, so today's date always falls in exactly one of them.

export function getHalfSeasonRange(now: Date = new Date()): DateRange {
	const year = now.getFullYear();
	const isAutumn = now.getMonth() >= 7; // 0-indexed: 7 = August
	return isAutumn
		? { from: iso(year, 8, 1), to: iso(year, 12, 31) }
		: { from: iso(year, 1, 1), to: iso(year, 7, 31) };
}

// ─── Indoor season ────────────────────────────────────────────────────────────
//
// Indoor hockey runs 21 November – 21 March (both inclusive). Up to and
// including 21 March we show the season that started the previous November;
// from 22 March on we point at the coming one, which is empty until November.

export function getIndoorSeasonRange(now: Date = new Date()): DateRange {
	const year = now.getFullYear();
	const month = now.getMonth() + 1;
	const inRunningSeason = month < 3 || (month === 3 && now.getDate() <= 21);
	const startYear = inRunningSeason ? year - 1 : year;
	return { from: iso(startYear, 11, 21), to: iso(startYear + 1, 3, 21) };
}

export function getSeasonRange(indoor: boolean, now: Date = new Date()): DateRange {
	return indoor ? getIndoorSeasonRange(now) : getHalfSeasonRange(now);
}
