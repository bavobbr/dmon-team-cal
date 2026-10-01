import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { loadTrainingData } from '$lib/server/team-data';
import { fetchGroups } from '$lib/server/twizzit-api';
import { buildTrainingSheet, buildTrainingDataSheet } from '$lib/server/xlsx-builder';
import { getHalfSeasonRange } from '$lib/server/season';
import XLSX from 'xlsx-js-style';

export const GET: RequestHandler = async ({ params, url }) => {
	const groupId = Number(params.groupId);
	if (isNaN(groupId)) throw error(400, 'Invalid group ID');

	const range = url.searchParams.get('from') === 'season' ? getHalfSeasonRange() : undefined;
	const [{ columns, rows }, groups] = await Promise.all([
		loadTrainingData(groupId, range),
		fetchGroups()
	]);
	const teamName = groups.find((g) => g.id === groupId)?.name ?? String(groupId);

	const wb = XLSX.utils.book_new();
	XLSX.utils.book_append_sheet(wb, buildTrainingSheet(columns, rows), 'Trainingen');
	XLSX.utils.book_append_sheet(
		wb,
		buildTrainingDataSheet([{ teamId: groupId, teamName, columns, rows }]),
		'Data'
	);

	const buffer: Buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

	return new Response(buffer, {
		headers: {
			'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'Content-Disposition': `attachment; filename="trainingen-${groupId}.xlsx"`
		}
	});
};
