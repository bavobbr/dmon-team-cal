export const ORG_ID = 32037;

// Only used when the current season cannot be discovered at runtime.
// See season.ts — Twizzit is the source of truth for which season is current.
export const FALLBACK_SEASON_ID = 65068; // 2026 - 2027

export const ATTENDANCE_TYPES = {
	YES: 42028,       // Aanwezig
	UNDECIDED: 42033, // Niet beslist
	NO: 42038         // Afwezig
} as const;
