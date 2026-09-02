export interface Group {
	id: number;
	name: string;
	shortName: string;
	categoryName: string;
}

export interface AttendanceContact {
	id: number;
	fullName: string;
	contactFunctions: string[];
}

export interface Attendance {
	contactId: number;
	attendanceTypeId: number;
	attendanceTypeName: string;
	comment: string | null;
}

export interface ActivityDetails {
	eventId: number;
	/** 1 = event, 2 = training, 3 = match (Wedstrijd), 4 = shift */
	eventType: number | null;
	homeTeamId: number | null;
	contacts: AttendanceContact[];
	attendances: Attendance[];
}

export interface MatchColumn {
	eventId: number;
	date: string;
	opponent: string;
	isHome: boolean;
}

export interface PlayerRow {
	contactId: number;
	fullName: string;
	attendances: Record<number, Attendance | undefined>;
}

export interface Season {
	id: number;
	name: string;
	startDate: string | null;
	endDate: string | null;
}

export interface DateRange {
	from: string;
	to: string;
}

export interface FeedEvent {
	id: number;
	date: string;
	name: string;
	/** False when the feed's activity-type colour cannot prove this is a match */
	definiteMatch: boolean;
}
