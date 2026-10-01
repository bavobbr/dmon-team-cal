<script lang="ts">
	import type { PageData } from './$types';
	import AttendanceTable from '$lib/components/AttendanceTable.svelte';
	import TeamToolbar from '$lib/components/TeamToolbar.svelte';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>D-Mon Hockey — Aanwezigheid</title>
</svelte:head>

<TeamToolbar
	groupId={data.groupId}
	tab="matches"
	ranges={[
		{ label: 'Vandaag', href: `/team/${data.groupId}`, active: data.from === 'today' },
		{ label: 'Seizoen', href: `/team/${data.groupId}?from=season`, active: data.from === 'season' }
	]}
	downloadHref={data.columns.length > 0 ? `/team/${data.groupId}/download?from=${data.from}` : null}
/>

<AttendanceTable
	columns={data.columns}
	rows={data.rows}
	emptyText="Geen komende wedstrijden gevonden voor deze ploeg."
>
	{#snippet header(col)}
		<span class="match-date">{col.date}</span>
		<span class="match-opp">{col.opponent}</span>
		<span class="match-venue" class:home={col.isHome} class:away={!col.isHome}>
			{col.isHome ? 'T' : 'U'}
		</span>
	{/snippet}
</AttendanceTable>
