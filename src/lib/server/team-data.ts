import { fetchCompetitionTeamId, fetchActivityFeed, fetchGroupRoster } from './twizzit-api';
import { fetchActivityDetails } from './twizzit-scrape';
import { getHalfSeasonRange, getRecentRange, brusselsNow } from './season';
import type {
	ActivityKind,
	MatchColumn,
	TrainingColumn,
	PlayerRow,
	Attendance,
	DateRange,
	FeedEvent,
	ActivityDetails
} from '../types';

/**
 * eventType on the activity page: 2 = Training, 3 = Wedstrijd (covering both
 * Competitiewedstrijd and Oefenwedstrijd)
 */
const EVENT_TYPE: Record<ActivityKind, number> = { match: 3, training: 2 };

/** The training tab's default view looks back this many days from today */
export const RECENT_TRAINING_DAYS = 28;

function extractOpponent(eventName: string, isHome: boolean): string {
	const sep = ' - ';
	const idx = eventName.indexOf(sep);
	if (idx === -1) return eventName;
	return isHome ? eventName.slice(idx + sep.length) : eventName.slice(0, idx);
}

/** "2026-09-24 20:30" → "do 24 sep 20:30" */
function formatColumnDate(eventDate: string): string {
	const d = new Date(eventDate.replace(' ', 'T'));
	const datePart = d.toLocaleDateString('nl-BE', { weekday: 'short', day: 'numeric', month: 'short' });
	const timePart = d.toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' });
	return `${datePart} ${timePart}`;
}

interface ResolvedActivity {
	event: FeedEvent;
	details: ActivityDetails | null;
}

/**
 * Fetch each feed event's activity page and keep the ones of the given kind.
 * eventType is the authority; the feed's colour only narrowed down which pages
 * were worth fetching. When a page could not be fetched, fall back to what the
 * colour already proved.
 */
async function resolveActivities(
	feedEvents: FeedEvent[],
	kind: ActivityKind
): Promise<ResolvedActivity[]> {
	const results = await Promise.allSettled(feedEvents.map((e) => fetchActivityDetails(e.id)));

	const resolved: ResolvedActivity[] = [];
	for (let i = 0; i < feedEvents.length; i++) {
		const result = results[i];
		if (result.status === 'rejected') {
			console.error(`Activity fetch failed for event ${feedEvents[i].id}:`, result.reason);
			if (feedEvents[i].definite) resolved.push({ event: feedEvents[i], details: null });
			continue;
		}
		if (result.value.eventType !== EVENT_TYPE[kind]) continue;
		resolved.push({ event: feedEvents[i], details: result.value });
	}
	return resolved;
}

/** Authoritative player list from the group roster — filters to Speler only */
async function loadPlayers(groupId: number): Promise<Map<number, string>> {
	const roster = await fetchGroupRoster(groupId);
	return new Map(roster.filter((m) => m.role === 'Speler').map((m) => [m.id, m.fullName]));
}

/**
 * One row per player, sorted by name, with their attendance for each activity.
 * Gastspelers invited to one of the activities are added to `players`.
 */
function buildRows(
	players: Map<number, string>,
	resolved: ResolvedActivity[]
): PlayerRow[] {
	const attendanceMap = new Map<string, Attendance>();
	for (const { details } of resolved) {
		if (!details) continue;
		const { eventId, contacts, attendances } = details;

		// Add gastspelers to the player map (not in roster, only for this activity)
		for (const contact of contacts) {
			if (contact.contactFunctions.includes('Gastspeler') && !players.has(contact.id)) {
				players.set(contact.id, contact.fullName);
			}
		}

		// Store attendance for all known players (roster + gastspelers)
		for (const att of attendances) {
			if (players.has(att.contactId)) {
				attendanceMap.set(`${att.contactId}-${eventId}`, att);
			}
		}
	}

	return Array.from(players.entries())
		.sort(([, a], [, b]) => a.localeCompare(b, 'nl'))
		.map(([contactId, fullName]) => {
			const attendances: Record<number, Attendance | undefined> = {};
			for (const { event } of resolved) {
				attendances[event.id] = attendanceMap.get(`${contactId}-${event.id}`);
			}
			return { contactId, fullName, attendances };
		});
}

// ─── Matches ──────────────────────────────────────────────────────────────────

export interface TeamData {
	columns: MatchColumn[];
	rows: PlayerRow[];
}

export async function loadTeamData(groupId: number, range?: DateRange): Promise<TeamData> {
	// Default view starts today but keeps the current half-season's end bound
	const { from, to } = range ?? {
		...getHalfSeasonRange(),
		from: new Date().toISOString().slice(0, 10)
	};

	const [competitionTeamId, feedEvents, players] = await Promise.all([
		fetchCompetitionTeamId(groupId),
		fetchActivityFeed(groupId, 'match', from, to),
		loadPlayers(groupId)
	]);

	const resolved = await resolveActivities(feedEvents, 'match');

	const columns: MatchColumn[] = resolved.map(({ event, details }) => {
		const homeTeamId = details ? details.homeTeamId : null;
		const isHome =
			competitionTeamId !== null && homeTeamId !== null
				? homeTeamId === competitionTeamId
				: true;
		return {
			eventId: event.id,
			date: formatColumnDate(event.date),
			opponent: extractOpponent(event.name, isHome),
			isHome
		};
	});

	return { columns, rows: buildRows(players, resolved) };
}

// ─── Trainings ────────────────────────────────────────────────────────────────

export interface TrainingData {
	columns: TrainingColumn[];
	rows: PlayerRow[];
}

/** Defaults to the last four weeks up to today: the coach looks back at who came */
export async function loadTrainingData(groupId: number, range?: DateRange): Promise<TrainingData> {
	const { from, to } = range ?? getRecentRange(RECENT_TRAINING_DAYS);

	const [feedEvents, players] = await Promise.all([
		fetchActivityFeed(groupId, 'training', from, to),
		loadPlayers(groupId)
	]);

	const resolved = await resolveActivities(feedEvents, 'training');

	const now = brusselsNow();
	const columns: TrainingColumn[] = resolved.map(({ event }) => ({
		eventId: event.id,
		start: event.date,
		date: formatColumnDate(event.date),
		name: event.name,
		isPast: event.date <= now
	}));

	return { columns, rows: buildRows(players, resolved) };
}
