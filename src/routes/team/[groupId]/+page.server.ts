import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { loadTeamData } from '$lib/server/team-data';
import { fetchGroup } from '$lib/server/twizzit-api';
import { getSeasonRange } from '$lib/server/season';

export const load: PageServerLoad = async ({ params, url }) => {
	const groupId = Number(params.groupId);
	if (isNaN(groupId)) throw error(400, 'Invalid group ID');

	// Unknown teams (e.g. an old bookmark) fall back to the outdoor season
	const indoor = (await fetchGroup(groupId))?.indoor ?? false;
	const fromParam = url.searchParams.get('from') === 'season' ? 'season' : 'today';
	const { columns, rows } = await loadTeamData(
		groupId,
		fromParam === 'season' ? getSeasonRange(indoor) : undefined,
		indoor
	);
	return { columns, rows, groupId, from: fromParam };
};
