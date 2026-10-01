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

/** Which family of activities a report covers */
export type ActivityKind = 'match' | 'training';

export interface MatchColumn {
	eventId: number;
	date: string;
	opponent: string;
	isHome: boolean;
}

export interface TrainingColumn {
	eventId: number;
	/** Twizzit's local start time, "YYYY-MM-DD HH:MM" */
	start: string;
	/** Display label, e.g. "do 24 sep 20:30" */
	date: string;
	/** Activity name, e.g. "U19B1, H1 - Training" */
	name: string;
	/** Already started — only these count towards totals and attendance rate */
	isPast: boolean;
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
	/** False when the feed's activity-type colour cannot prove the activity's kind */
	definite: boolean;
}
