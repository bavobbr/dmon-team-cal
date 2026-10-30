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

/**
 * A "Vrije training" (said in the activity's DETAILS text) is an optional,
 * ad-hoc session: attendance there says nothing about commitment, so it is
 * left out of the training report and its totals.
 */
function isFreeTraining(details: ActivityDetails): boolean {
	return /vrije\s+training/i.test(details.description ?? '');
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
		if (kind === 'training' && isFreeTraining(result.value)) continue;
		resolved.push({ event: feedEvents[i], details: result.value });
	}
	return resolved;
}

interface Roster {
	/** Members listed as Speler, by contact ID */
	players: Map<number, string>;
	/** Members without any player role (Coach, Manager, Team scheidsrechter, ...) */
	staff: Set<number>;
}

/** Authoritative player list from the group roster — filters to Speler only */
async function loadRoster(groupId: number): Promise<Roster> {
	const roster = await fetchGroupRoster(groupId);
	// A member with several roles is listed once per role
	const players = new Map(roster.filter((m) => m.role === 'Speler').map((m) => [m.id, m.fullName]));
	// Tijdelijke spelers are no staff: they appear through their Gastspeler tag
	const playing = new Set(roster.filter((m) => /speler/i.test(m.role)).map((m) => m.id));
	const staff = new Set(roster.filter((m) => !playing.has(m.id)).map((m) => m.id));
	return { players, staff };
}

/**
 * One row per player, sorted by name, with their attendance for each activity.
 * Gastspelers are added only for the activities they were a Gastspeler in: an
 * activity shared with another team (e.g. "H1 - U19B1") can list this team's
 * coach as a Gastspeler for the other side, which must not turn them into a
 * player of this team.
 */
function buildRows({ players: rosterPlayers, staff }: Roster, resolved: ResolvedActivity[]): PlayerRow[] {
	const players = new Map(rosterPlayers);
	const attendanceMap = new Map<string, Attendance>();
	for (const { details } of resolved) {
		if (!details) continue;
		const { eventId, contacts, attendances } = details;

		const guests = new Set<number>();
		for (const contact of contacts) {
			if (
				contact.contactFunctions.includes('Gastspeler') &&
				!rosterPlayers.has(contact.id) &&
				!staff.has(contact.id)
			) {
				guests.add(contact.id);
				players.set(contact.id, contact.fullName);
			}
		}

		for (const att of attendances) {
			if (rosterPlayers.has(att.contactId) || guests.has(att.contactId)) {
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

	const [competitionTeamId, feedEvents, roster] = await Promise.all([
		fetchCompetitionTeamId(groupId),
		fetchActivityFeed(groupId, 'match', from, to),
		loadRoster(groupId)
	]);

	const resolved = await resolveActivities(feedEvents, 'match');

	const now = brusselsNow();
	const columns: MatchColumn[] = resolved.map(({ event, details }) => {
		const homeTeamId = details ? details.homeTeamId : null;
		const isHome =
			competitionTeamId !== null && homeTeamId !== null
				? homeTeamId === competitionTeamId
				: true;
		return {
			eventId: event.id,
			start: event.date,
			date: formatColumnDate(event.date),
			name: event.name,
			opponent: extractOpponent(event.name, isHome),
			isHome,
			isPast: event.date <= now
		};
	});

	return { columns, rows: buildRows(roster, resolved) };
}

// ─── Trainings ────────────────────────────────────────────────────────────────

export interface TrainingData {
	columns: TrainingColumn[];
	rows: PlayerRow[];
}

/** Defaults to the last four weeks up to today: the coach looks back at who came */
export async function loadTrainingData(groupId: number, range?: DateRange): Promise<TrainingData> {
	const { from, to } = range ?? getRecentRange(RECENT_TRAINING_DAYS);

	const [feedEvents, roster] = await Promise.all([
		fetchActivityFeed(groupId, 'training', from, to),
		loadRoster(groupId)
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

	return { columns, rows: buildRows(roster, resolved) };
}
