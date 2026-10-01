<script lang="ts">
	import type { PageData } from './$types';
	import AttendanceTable from '$lib/components/AttendanceTable.svelte';
	import TeamToolbar from '$lib/components/TeamToolbar.svelte';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>D-Mon Hockey — Trainingen</title>
</svelte:head>

<TeamToolbar
	groupId={data.groupId}
	tab="trainings"
	ranges={[
		{ label: 'Recent', href: `/team/${data.groupId}/trainingen`, active: data.from === 'recent' },
		{ label: 'Seizoen', href: `/team/${data.groupId}/trainingen?from=season`, active: data.from === 'season' }
	]}
	downloadHref={data.columns.length > 0
		? `/team/${data.groupId}/trainingen/download?from=${data.from}`
		: null}
/>

<AttendanceTable
	columns={data.columns}
	rows={data.rows}
	emptyText={data.from === 'recent'
		? 'Geen trainingen in de afgelopen 4 weken voor deze ploeg.'
		: 'Geen trainingen gevonden in dit halve seizoen voor deze ploeg.'}
	counts={(col) => col.isPast}
	dimmed={(col) => !col.isPast}
	showRate
>
	{#snippet header(col)}
		<span class="match-date">{col.date}</span>
		<span class="match-opp">{col.name}</span>
	{/snippet}
</AttendanceTable>

{#if data.columns.some((c) => !c.isPast)}
	<p class="note">Geplande trainingen zijn grijs en tellen nog niet mee in het totaal en het percentage.</p>
{/if}

<style>
	.note {
		margin-top: 0.75rem;
		font-size: 0.8rem;
		color: var(--color-text-muted);
	}
</style>
