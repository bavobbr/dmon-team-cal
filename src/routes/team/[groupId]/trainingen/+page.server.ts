import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { loadTrainingData } from '$lib/server/team-data';
import { getHalfSeasonRange } from '$lib/server/season';

export const load: PageServerLoad = async ({ params, url }) => {
	const groupId = Number(params.groupId);
	if (isNaN(groupId)) throw error(400, 'Invalid group ID');

	const fromParam = url.searchParams.get('from') === 'season' ? 'season' : 'recent';
	const { columns, rows } = await loadTrainingData(
		groupId,
		fromParam === 'season' ? getHalfSeasonRange() : undefined
	);
	return { columns, rows, groupId, from: fromParam };
};
