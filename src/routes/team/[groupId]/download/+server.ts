import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { loadTeamData } from '$lib/server/team-data';
import { buildTeamSheet } from '$lib/server/xlsx-builder';
import XLSX from 'xlsx-js-style';

const SEASON_START = '2026-01-01';

export const GET: RequestHandler = async ({ params, url }) => {
	const groupId = Number(params.groupId);
	if (isNaN(groupId)) throw error(400, 'Invalid group ID');

	const from = url.searchParams.get('from') === 'season' ? SEASON_START : undefined;
	const { columns, rows } = await loadTeamData(groupId, from);

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
