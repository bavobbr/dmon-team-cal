import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { loadTeamData } from '$lib/server/team-data';
import { buildTeamSheet } from '$lib/server/xlsx-builder';
import { getHalfSeasonRange } from '$lib/server/season';
import XLSX from 'xlsx-js-style';

export const GET: RequestHandler = async ({ params, url }) => {
	const groupId = Number(params.groupId);
	if (isNaN(groupId)) throw error(400, 'Invalid group ID');

	const range = url.searchParams.get('from') === 'season' ? getHalfSeasonRange() : undefined;
	const { columns, rows } = await loadTeamData(groupId, range);

	const ws = buildTeamSheet(columns, rows);

	const wb = XLSX.utils.book_new();
	XLSX.utils.book_append_sheet(wb, ws, 'Aanwezigheid');

	const buffer: Buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

	return new Response(buffer, {
		headers: {
			'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'Content-Disposition': `attachment; filename="aanwezigheid-${groupId}.xlsx"`
		}
	});
};
