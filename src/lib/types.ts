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
