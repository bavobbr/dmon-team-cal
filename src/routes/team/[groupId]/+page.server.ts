import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { loadTeamData } from '$lib/server/team-data';

const SEASON_START = '2026-01-01';

export const load: PageServerLoad = async ({ params, url }) => {
	const groupId = Number(params.groupId);
	if (isNaN(groupId)) throw error(400, 'Invalid group ID');

	const fromParam = url.searchParams.get('from') === 'season' ? 'season' : 'today';
	const { columns, rows } = await loadTeamData(groupId, fromParam === 'season' ? SEASON_START : undefined);
	return { columns, rows, groupId, from: fromParam };
};
