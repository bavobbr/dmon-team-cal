import type { RequestHandler } from './$types';
import { fetchGroups, fetchGroupRoster } from '$lib/server/twizzit-api';
import XLSX from 'xlsx-js-style';


export const GET: RequestHandler = async () => {
	const groups = await fetchGroups();

	const rows: Array<{ id: number; name: string; team: string }> = [];

	await Promise.allSettled(
		groups.map(async (group) => {
			const roster = await fetchGroupRoster(group.id);
			for (const member of roster) {
				if (member.role === 'Speler') {
					rows.push({ id: member.id, name: member.fullName, team: group.name });
				}
			}
		})
	);

	rows.sort((a, b) => {
		const teamCmp = a.team.localeCompare(b.team, 'nl');
		return teamCmp !== 0 ? teamCmp : a.name.localeCompare(b.name, 'nl');
	});

	const BOLD = { font: { bold: true } };

	const aoa: (string | number)[][] = [
		['ID', 'Speler', 'Ploeg'],
		...rows.map((r) => [r.id, r.name, r.team])
	];

	const ws = XLSX.utils.aoa_to_sheet(aoa);

	ws['A1'].s = BOLD;
	ws['B1'].s = BOLD;
	ws['C1'].s = BOLD;
	ws['!cols'] = [{ wch: 12 }, { wch: 30 }, { wch: 30 }];
	ws['!freeze'] = { xSplit: 0, ySplit: 1 };

	const wb = XLSX.utils.book_new();
	XLSX.utils.book_append_sheet(wb, ws, 'Spelers');

	const buf: Buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

	return new Response(buf, {
		headers: {
			'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'Content-Disposition': 'attachment; filename="spelerslijst.xlsx"'
		}
	});
};
