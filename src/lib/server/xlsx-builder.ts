import XLSX from 'xlsx-js-style';
import type { WorkSheet } from 'xlsx-js-style';
import type { MatchColumn, TrainingColumn, PlayerRow } from '../types';

export const YES = 42028, NO = 42038, UNDECIDED = 42033;

const BOLD       = { font: { bold: true } };
const BOLD_WRAP  = { font: { bold: true }, alignment: { wrapText: true, vertical: 'center', horizontal: 'center' } };
const GREEN_FILL = { fill: { patternType: 'solid', fgColor: { rgb: 'E8F5E9' } } };
// Afwezig with a stated reason — matches the amber dot in the web view
const EXCUSED_FILL = { fill: { patternType: 'solid', fgColor: { rgb: 'FDEBCF' } } };

/** The reason the player typed in Twizzit, or null when there is none. */
function reason(comment: string | null | undefined): string | null {
	const text = comment?.trim();
	return text ? text : null;
}

export function buildTeamSheet(columns: MatchColumn[], rows: PlayerRow[]): WorkSheet {
	const header = [
		'Speler',
		...columns.map((c) => `${c.date}\n${c.opponent} (${c.isHome ? 'T' : 'U'})`),
		'Aanwezig',
		'Afwezig',
		'Niet beslist'
	];

	const allDecided: boolean[] = [];
	// Absences with a reason, keyed by their position in the sheet (row 0 = header)
	const excused: { r: number; c: number; text: string }[] = [];
	const dataRows = rows.map((row, i) => {
		let yes = 0, no = 0, undecided = 0;
		const cells = columns.map((col, c) => {
			const att = row.attendances[col.eventId];
			if (!att) return '';
			if (att.attendanceTypeId === YES) { yes++; return 'Y'; }
			if (att.attendanceTypeId === NO)  {
				no++;
				const why = reason(att.comment);
				if (why) excused.push({ r: i + 1, c: c + 1, text: why });
				return 'N';
			}
			if (att.attendanceTypeId === UNDECIDED) { undecided++; return ''; }
			return '';
		});
		allDecided.push(undecided === 0 && columns.length > 0);
		return [row.fullName, ...cells, yes, no, undecided];
	});

	function matchCounts(typeId: number) {
		return columns.map((col) => {
			let count = 0;
			for (const row of rows) {
				if (row.attendances[col.eventId]?.attendanceTypeId === typeId) count++;
			}
			return count;
		});
	}

	const aoa = [
		header,
		...dataRows,
		[],  // blank separator row
		['Aanwezig',    ...matchCounts(YES),       '', '', ''],
		['Afwezig',      ...matchCounts(NO),        '', '', ''],
		['Niet beslist', ...matchCounts(UNDECIDED), '', '', '']
	];

	const ws = XLSX.utils.aoa_to_sheet(aoa);

	// Green background for fully-decided player rows (header = row 0, data starts at row 1)
	const totalCols = header.length;
	allDecided.forEach((decided, i) => {
		if (!decided) return;
		const r = i + 1;
		for (let c = 0; c < totalCols; c++) {
			const addr = XLSX.utils.encode_cell({ r, c });
			if (ws[addr]) {
				ws[addr].s = GREEN_FILL;
			} else {
				ws[addr] = { t: 'z', s: GREEN_FILL };
			}
		}
	});

	// Amber fill + the reason as a cell comment for excused absences. Applied after
	// the green row fill so it wins on fully-decided rows.
	for (const { r, c, text } of excused) {
		const addr = XLSX.utils.encode_cell({ r, c });
		if (!ws[addr]) ws[addr] = { t: 's', v: 'N' };
		ws[addr].s = { ...ws[addr].s, ...EXCUSED_FILL };
		ws[addr].c = [{ a: 'Twizzit', t: text }];
		ws[addr].c.hidden = true;
	}

	// Bold all header cells; match columns also get wrap + center
	for (let c = 0; c < totalCols; c++) {
		const addr = XLSX.utils.encode_cell({ r: 0, c });
		if (!ws[addr]) continue;
		const isMatchCol = c >= 1 && c <= columns.length;
		ws[addr].s = isMatchCol ? BOLD_WRAP : BOLD;
	}

	// Bold column A (player names + totals labels), merging with any existing fill
	for (let r = 1; r < aoa.length; r++) {
		const addr = XLSX.utils.encode_cell({ r, c: 0 });
		if (ws[addr]) ws[addr].s = { ...ws[addr].s, font: { bold: true } };
	}

	// Row height for header (points): enough for two lines of text
	ws['!rows'] = [{ hpt: 42 }];

	ws['!cols'] = [
		{ wch: 28 },
		...columns.map(() => ({ wch: 18 })),
		{ wch: 10 }, { wch: 10 }, { wch: 14 }
	];
	ws['!freeze'] = { xSplit: 1, ySplit: 1 };

	return ws;
}

// ─── Trainings ────────────────────────────────────────────────────────────────

const MUTED_HEADER = { font: { bold: true, color: { rgb: '9CA3AF' } }, alignment: BOLD_WRAP.alignment };

/** Attendance rate over trainings that already happened; null when there were none */
export function attendanceRate(yes: number, no: number, undecided: number): number | null {
	const total = yes + no + undecided;
	return total === 0 ? null : yes / total;
}

/**
 * Players × trainings grid. Totals and the attendance rate count only trainings
 * that already happened, so planned trainings in the Seizoen range (with
 * whatever players answered in advance) do not skew them.
 */
export function buildTrainingSheet(columns: TrainingColumn[], rows: PlayerRow[]): WorkSheet {
	const header = [
		'Speler',
		...columns.map((c) => `${c.date}\n${c.name}${c.isPast ? '' : ' (gepland)'}`),
		'Aanwezig',
		'Afwezig',
		'Niet beslist',
		'% aanwezig'
	];

	const excused: { r: number; c: number; text: string }[] = [];
	const dataRows = rows.map((row, i) => {
		let yes = 0, no = 0, undecided = 0;
		const cells = columns.map((col, c) => {
			const att = row.attendances[col.eventId];
			if (!att) return '';
			const counted = col.isPast;
			if (att.attendanceTypeId === YES) { if (counted) yes++; return 'Y'; }
			if (att.attendanceTypeId === NO) {
				if (counted) no++;
				const why = reason(att.comment);
				if (why) excused.push({ r: i + 1, c: c + 1, text: why });
				return 'N';
			}
			if (att.attendanceTypeId === UNDECIDED && counted) undecided++;
			return '';
		});
		const rate = attendanceRate(yes, no, undecided);
		return [row.fullName, ...cells, yes, no, undecided, rate ?? ''];
	});

	function trainingCounts(typeId: number) {
		return columns.map((col) => {
			let count = 0;
			for (const row of rows) {
				if (row.attendances[col.eventId]?.attendanceTypeId === typeId) count++;
			}
			return count;
		});
	}

	const aoa = [
		header,
		...dataRows,
		[],  // blank separator row
		['Aanwezig',     ...trainingCounts(YES),       '', '', '', ''],
		['Afwezig',      ...trainingCounts(NO),        '', '', '', ''],
		['Niet beslist', ...trainingCounts(UNDECIDED), '', '', '', '']
	];

	const ws = XLSX.utils.aoa_to_sheet(aoa);
	const totalCols = header.length;
	const rateCol = totalCols - 1;

	for (const { r, c, text } of excused) {
		const addr = XLSX.utils.encode_cell({ r, c });
		if (!ws[addr]) ws[addr] = { t: 's', v: 'N' };
		ws[addr].s = { ...ws[addr].s, ...EXCUSED_FILL };
		ws[addr].c = [{ a: 'Twizzit', t: text }];
		ws[addr].c.hidden = true;
	}

	// Header: training columns wrap + center, planned ones greyed out
	for (let c = 0; c < totalCols; c++) {
		const addr = XLSX.utils.encode_cell({ r: 0, c });
		if (!ws[addr]) continue;
		const col = c >= 1 && c <= columns.length ? columns[c - 1] : null;
		ws[addr].s = col ? (col.isPast ? BOLD_WRAP : MUTED_HEADER) : BOLD;
	}

	for (let r = 1; r < aoa.length; r++) {
		const addr = XLSX.utils.encode_cell({ r, c: 0 });
		if (ws[addr]) ws[addr].s = { ...ws[addr].s, font: { bold: true } };
	}

	// Rate as a real percentage so it sorts and charts as a number
	for (let r = 1; r <= rows.length; r++) {
		const addr = XLSX.utils.encode_cell({ r, c: rateCol });
		if (ws[addr]?.t === 'n') ws[addr].z = '0%';
	}

	ws['!rows'] = [{ hpt: 42 }];
	ws['!cols'] = [
		{ wch: 28 },
		...columns.map(() => ({ wch: 18 })),
		{ wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 12 }
	];
	ws['!freeze'] = { xSplit: 1, ySplit: 1 };

	return ws;
}

// ─── Flat data sheet ──────────────────────────────────────────────────────────
//
// One row per player per training, for analysis in other tools (Excel pivot,
// Power BI, pandas, ...). Datum is a real Excel date; the IDs make it safe to
// join or de-duplicate across exports.

export interface TrainingDataTeam {
	teamId: number;
	teamName: string;
	columns: TrainingColumn[];
	rows: PlayerRow[];
}

const DATA_HEADER = [
	'Ploeg', 'Ploeg ID', 'Datum', 'Tijd', 'Training', 'Training ID',
	'Speler', 'Speler ID', 'Status', 'Opmerking', 'Afgelopen'
];

/** "YYYY-MM-DD" → Excel serial date, independent of the server's time zone */
function excelDate(isoDate: string): number {
	const [y, m, d] = isoDate.split('-').map(Number);
	return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000;
}

export function buildTrainingDataSheet(teams: TrainingDataTeam[]): WorkSheet {
	const aoa: (string | number)[][] = [DATA_HEADER];

	for (const { teamId, teamName, columns, rows } of teams) {
		for (const col of columns) {
			for (const row of rows) {
				const att = row.attendances[col.eventId];
				// No attendance record means the player was not invited
				if (!att) continue;
				aoa.push([
					teamName,
					teamId,
					excelDate(col.start.slice(0, 10)),
					col.start.slice(11, 16),
					col.name,
					col.eventId,
					row.fullName,
					row.contactId,
					att.attendanceTypeName,
					reason(att.comment) ?? '',
					col.isPast ? 'Ja' : 'Nee'
				]);
			}
		}
	}

	const ws = XLSX.utils.aoa_to_sheet(aoa);

	for (let c = 0; c < DATA_HEADER.length; c++) {
		ws[XLSX.utils.encode_cell({ r: 0, c })].s = BOLD;
	}
	for (let r = 1; r < aoa.length; r++) {
		ws[XLSX.utils.encode_cell({ r, c: 2 })].z = 'yyyy-mm-dd';
	}

	ws['!cols'] = [
		{ wch: 16 }, { wch: 10 }, { wch: 12 }, { wch: 7 }, { wch: 28 }, { wch: 12 },
		{ wch: 28 }, { wch: 10 }, { wch: 12 }, { wch: 30 }, { wch: 10 }
	];
	ws['!freeze'] = { xSplit: 0, ySplit: 1 };
	ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: aoa.length - 1, c: DATA_HEADER.length - 1 } }) };

	return ws;
}
