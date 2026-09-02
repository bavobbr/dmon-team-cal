import { siteFetch, SITE_BASE } from './site-fetch';

// ─── Match activity-type colours ──────────────────────────────────────────────
//
// Settings → Activiteiten subtypes groups every activity subtype under a family
// heading (Event / Training / Wedstrijd / Shift types) and gives each one a
// colour. The activity feed exposes only that colour, so reading the Wedstrijd
// family here lets us skip trainings and club events without fetching their
// activity pages — and without hardcoding hex values that the club can change.
//
// #FFFFFF means "no colour chosen" and is shared across families, so it can
// never identify a match on its own. Such events are treated as UNCERTAIN and
// resolved by eventType on the activity page instead.

export const NO_COLOUR = '#FFFFFF';

const TYPES_TTL_MS = 6 * 60 * 60 * 1000;

let colourCache: { colours: Set<string> | null; expiresAt: number } | null = null;
let colourInFlight: Promise<Set<string> | null> | null = null;

function parseMatchColours(html: string): Set<string> {
	// Sections are introduced by <div class="basic-container-title">Wedstrijd types</div>
	const sections = html.split(/<div class="basic-container-title">/);
	const matchSection = sections.find((s) => s.trimStart().startsWith('Wedstrijd types'));
	if (!matchSection) throw new Error('No "Wedstrijd types" section on the activity subtypes page');

	const colours = new Set<string>();
	for (const row of matchSection.split(/class="row body[^"]*activity-subtype"/).slice(1)) {
		const colour = row.match(/background-color:\s*(#[0-9A-Fa-f]{6})/);
		if (colour) colours.add(colour[1].toUpperCase());
	}

	// A match type with no colour is indistinguishable from other families
	colours.delete(NO_COLOUR);

	if (colours.size === 0) throw new Error('No usable colours under "Wedstrijd types"');
	return colours;
}

/**
 * Colours that positively identify a match in the feed, or null when they could
 * not be determined — in which case callers must treat every event as uncertain
 * and fall back to eventType. That is slower but never silently drops a match.
 */
export async function getMatchColours(): Promise<Set<string> | null> {
	if (colourCache && colourCache.expiresAt > Date.now()) return colourCache.colours;
	if (colourInFlight) return colourInFlight;

	colourInFlight = siteFetch(`${SITE_BASE}/v2/ajax/settings/page/activity-subtypes`)
		.then((html) => {
			const colours = parseMatchColours(html);
			console.log(`[activity-types] match colours: ${[...colours].join(', ')}`);
			colourCache = { colours, expiresAt: Date.now() + TYPES_TTL_MS };
			return colours;
		})
		.catch((err) => {
			console.error('[activity-types] could not read match colours, treating all events as uncertain:', err);
			colourCache = { colours: null, expiresAt: Date.now() + 10 * 60 * 1000 };
			return null;
		})
		.finally(() => {
			colourInFlight = null;
		});

	return colourInFlight;
}
