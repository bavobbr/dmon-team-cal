import { siteFetch, SITE_BASE } from './site-fetch';
import type { ActivityKind } from '../types';

// ─── Activity-type colours ────────────────────────────────────────────────────
//
// Settings → Activiteiten subtypes groups every activity subtype under a family
// heading (Event / Training / Wedstrijd / Shift types) and gives each one a
// colour. The activity feed exposes only that colour, so reading a family here
// lets us skip everything outside it without fetching those activity pages —
// and without hardcoding hex values that the club can change.
//
// #FFFFFF means "no colour chosen" and is shared across families, so it can
// never identify a family on its own. Such events are treated as UNCERTAIN and
// resolved by eventType on the activity page instead.

export const NO_COLOUR = '#FFFFFF';

const FAMILY_HEADING: Record<ActivityKind, string> = {
	match: 'Wedstrijd types',
	training: 'Training types'
};

const TYPES_TTL_MS = 6 * 60 * 60 * 1000;

type FamilyColours = Map<ActivityKind, Set<string>>;

let colourCache: { colours: FamilyColours | null; expiresAt: number } | null = null;
let colourInFlight: Promise<FamilyColours | null> | null = null;

function parseFamilyColours(html: string): FamilyColours {
	// Sections are introduced by <div class="basic-container-title">Wedstrijd types</div>
	const sections = html.split(/<div class="basic-container-title">/);
	const result: FamilyColours = new Map();

	for (const [kind, heading] of Object.entries(FAMILY_HEADING) as [ActivityKind, string][]) {
		const section = sections.find((s) => s.trimStart().startsWith(heading));
		if (!section) {
			console.error(`[activity-types] no "${heading}" section on the activity subtypes page`);
			continue;
		}

		const colours = new Set<string>();
		for (const row of section.split(/class="row body[^"]*activity-subtype"/).slice(1)) {
			const colour = row.match(/background-color:\s*(#[0-9A-Fa-f]{6})/);
			if (colour) colours.add(colour[1].toUpperCase());
		}

		// A subtype with no colour is indistinguishable from other families
		colours.delete(NO_COLOUR);

		if (colours.size === 0) {
			console.error(`[activity-types] no usable colours under "${heading}"`);
			continue;
		}
		result.set(kind, colours);
	}

	if (result.size === 0) throw new Error('No usable activity-type colours on the subtypes page');
	return result;
}

async function getAllFamilyColours(): Promise<FamilyColours | null> {
	if (colourCache && colourCache.expiresAt > Date.now()) return colourCache.colours;
	if (colourInFlight) return colourInFlight;

	colourInFlight = siteFetch(`${SITE_BASE}/v2/ajax/settings/page/activity-subtypes`)
		.then((html) => {
			const colours = parseFamilyColours(html);
			for (const [kind, set] of colours) {
				console.log(`[activity-types] ${kind} colours: ${[...set].join(', ')}`);
			}
			colourCache = { colours, expiresAt: Date.now() + TYPES_TTL_MS };
			return colours;
		})
		.catch((err) => {
			console.error('[activity-types] could not read colours, treating all events as uncertain:', err);
			colourCache = { colours: null, expiresAt: Date.now() + 10 * 60 * 1000 };
			return null;
		})
		.finally(() => {
			colourInFlight = null;
		});

	return colourInFlight;
}

/**
 * Colours that positively identify an activity of this kind in the feed, or
 * null when they could not be determined — in which case callers must treat
 * every event as uncertain and fall back to eventType. That is slower but never
 * silently drops an activity.
 */
export async function getFamilyColours(kind: ActivityKind): Promise<Set<string> | null> {
	return (await getAllFamilyColours())?.get(kind) ?? null;
}
