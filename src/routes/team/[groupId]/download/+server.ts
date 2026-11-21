import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { loadTeamData } from '$lib/server/team-data';
import { fetchGroup } from '$lib/server/twizzit-api';
import { buildTeamSheet, buildMatchDataSheet } from '$lib/server/xlsx-builder';
import { getSeasonRange } from '$lib/server/season';
import XLSX from 'xlsx-js-style';

export const GET: RequestHandler = async ({ params, url }) => {
	const groupId = Number(params.groupId);
	if (isNaN(groupId)) throw error(400, 'Invalid group ID');

	const group = await fetchGroup(groupId);
	const indoor = group?.indoor ?? false;
	const range = url.searchParams.get('from') === 'season' ? getSeasonRange(indoor) : undefined;
	const { columns, rows } = await loadTeamData(groupId, range, indoor);
	const teamName = group?.name ?? String(groupId);

	const wb = XLSX.utils.book_new();
	XLSX.utils.book_append_sheet(wb, buildTeamSheet(columns, rows), 'Aanwezigheid');
	XLSX.utils.book_append_sheet(
		wb,
		buildMatchDataSheet([{ teamId: groupId, teamName, columns, rows }]),
		'Data'
	);

	const buffer: Buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

	return new Response(buffer, {
		headers: {
			'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'Content-Disposition': `attachment; filename="aanwezigheid-${groupId}.xlsx"`
		}
	});
};
