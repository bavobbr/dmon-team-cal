import XLSX from 'xlsx-js-style';
import type { WorkSheet } from 'xlsx-js-style';
import type { MatchColumn, PlayerRow } from '../types';

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
