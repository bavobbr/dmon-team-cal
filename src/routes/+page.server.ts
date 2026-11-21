import type { PageServerLoad } from './$types';
import { fetchGroups } from '$lib/server/twizzit-api';
import type { Group } from '$lib/types';

type Category = { categoryName: string; groups: Group[] };

function groupByCategory(groups: Group[]): Category[] {
	const grouped = new Map<string, Category>();
	for (const group of groups) {
		if (!grouped.has(group.categoryName)) {
			grouped.set(group.categoryName, { categoryName: group.categoryName, groups: [] });
		}
		grouped.get(group.categoryName)!.groups.push(group);
	}

	for (const entry of grouped.values()) {
		entry.groups.sort((a, b) => a.name.localeCompare(b.name, 'nl'));
	}

	return Array.from(grouped.values()).sort((a, b) =>
		a.categoryName.localeCompare(b.categoryName, 'nl')
	);
}

export const load: PageServerLoad = async () => {
	const groups = await fetchGroups();

	const sections = [
		{ key: 'outdoor' as const, title: null, categories: groupByCategory(groups.filter((g) => !g.indoor)) },
		{ key: 'indoor' as const, title: 'Indoor', categories: groupByCategory(groups.filter((g) => g.indoor)) }
	];

	// A section without teams (e.g. indoor in summer) is left out entirely
	return { sections: sections.filter((s) => s.categories.length > 0) };
};
