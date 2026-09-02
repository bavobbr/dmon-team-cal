import { fetchCompetitionTeamId, fetchMatchFeed, fetchGroupRoster } from './twizzit-api';
import { fetchActivityDetails } from './twizzit-scrape';
import { getHalfSeasonRange } from './season';
import type { MatchColumn, PlayerRow, Attendance, DateRange } from '../types';

function extractOpponent(eventName: string, isHome: boolean): string {
	const sep = ' - ';
	const idx = eventName.indexOf(sep);
	if (idx === -1) return eventName;
	return isHome ? eventName.slice(idx + sep.length) : eventName.slice(0, idx);
}

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
		fetchMatchFeed(groupId, from, to),
		fetchGroupRoster(groupId)
	]);

	// Authoritative player list from the group roster — filters to Speler only
	const playerMap = new Map<number, string>(
		roster
			.filter((m) => m.role === 'Speler')
			.map((m) => [m.id, m.fullName])
	);

	if (feedEvents.length === 0) {
		const rows: PlayerRow[] = Array.from(playerMap.entries())
			.sort(([, a], [, b]) => a.localeCompare(b, 'nl'))
			.map(([contactId, fullName]) => ({ contactId, fullName, attendances: {} }));
		return { columns: [], rows };
	}

	const activityResults = await Promise.allSettled(
		feedEvents.map((e) => fetchActivityDetails(e.id))
	);

	const columns: MatchColumn[] = feedEvents.map((event, i) => {
		const result = activityResults[i];
		const homeTeamId = result.status === 'fulfilled' ? result.value.homeTeamId : null;
		const isHome =
			competitionTeamId !== null && homeTeamId !== null
				? homeTeamId === competitionTeamId
				: true;
		return {
			eventId: event.id,
			date: (() => {
				const d = new Date(event.date.replace(' ', 'T'));
				const datePart = d.toLocaleDateString('nl-BE', { weekday: 'short', day: 'numeric', month: 'short' });
				const timePart = d.toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' });
				return `${datePart} ${timePart}`;
			})(),
			opponent: extractOpponent(event.name, isHome),
			isHome
		};
	});

	// Collect attendance data; also pick up gastspelers from activity contacts
	const attendanceMap = new Map<string, Attendance>();
	for (let i = 0; i < activityResults.length; i++) {
		const result = activityResults[i];
		if (result.status === 'rejected') {
			console.error(`Activity fetch failed for event ${feedEvents[i].id}:`, result.reason);
			continue;
		}
		const { eventId, contacts, attendances } = result.value;

		// Add gastspelers to the player map (not in roster, only for this match)
		for (const contact of contacts) {
			if (contact.contactFunctions.includes('Gastspeler') && !playerMap.has(contact.id)) {
				playerMap.set(contact.id, contact.fullName);
			}
		}

		// Store attendance for all known players (roster + gastspelers)
		for (const att of attendances) {
			if (playerMap.has(att.contactId)) {
				attendanceMap.set(`${att.contactId}-${eventId}`, att);
			}
		}
	}

	const rows: PlayerRow[] = Array.from(playerMap.entries())
		.sort(([, a], [, b]) => a.localeCompare(b, 'nl'))
		.map(([contactId, fullName]) => {
			const attendances: Record<number, Attendance | undefined> = {};
			for (const col of columns) {
				attendances[col.eventId] = attendanceMap.get(`${contactId}-${col.eventId}`);
			}
			return { contactId, fullName, attendances };
		});

	return { columns, rows };
}
