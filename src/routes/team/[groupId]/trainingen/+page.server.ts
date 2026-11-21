import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { loadTrainingData } from '$lib/server/team-data';
import { fetchGroup } from '$lib/server/twizzit-api';
import { getSeasonRange } from '$lib/server/season';

export const load: PageServerLoad = async ({ params, url }) => {
	const groupId = Number(params.groupId);
	if (isNaN(groupId)) throw error(400, 'Invalid group ID');

	const indoor = (await fetchGroup(groupId))?.indoor ?? false;
	const fromParam = url.searchParams.get('from') === 'season' ? 'season' : 'recent';
	const { columns, rows } = await loadTrainingData(
		groupId,
		fromParam === 'season' ? getSeasonRange(indoor) : undefined
	);
	return { columns, rows, groupId, from: fromParam };
};
