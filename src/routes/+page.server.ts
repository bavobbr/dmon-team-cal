import type { PageServerLoad } from './$types';
import { fetchGroups } from '$lib/server/twizzit-api';
import type { Group } from '$lib/types';

export const load: PageServerLoad = async () => {
	const groups = await fetchGroups();

	const grouped = new Map<string, { categoryName: string; groups: Group[] }>();
	for (const group of groups) {
		if (!grouped.has(group.categoryName)) {
			grouped.set(group.categoryName, { categoryName: group.categoryName, groups: [] });
		}
		grouped.get(group.categoryName)!.groups.push(group);
	}

	for (const entry of grouped.values()) {
		entry.groups.sort((a, b) => a.name.localeCompare(b.name, 'nl'));
	}

	return {
		grouped: Array.from(grouped.values()).sort((a, b) =>
			a.categoryName.localeCompare(b.categoryName, 'nl')
		)
	};
};
