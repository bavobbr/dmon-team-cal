<script lang="ts">
	import type { PageData } from './$types';
	import type { Attendance } from '$lib/types';

	let { data }: { data: PageData } = $props();

	const YES = 42028, UNDECIDED = 42033, NO = 42038;

	const DOT_COLOR: Record<number, string> = {
		[YES]: '#3DAE7E',
		[NO]:  '#F04825'
	};

	function dotColor(att: Attendance | undefined): string | null {
		if (!att) return null;
		return DOT_COLOR[att.attendanceTypeId] ?? null;
	}

	function tooltip(att: Attendance | undefined): string {
		if (!att) return 'Geen gegevens';
		return att.comment ? `${att.attendanceTypeName}: ${att.comment}` : att.attendanceTypeName;
	}

	// Per-player totals (across all columns)
	function playerTotals(row: typeof data.rows[0]) {
		let yes = 0, no = 0, undecided = 0;
		for (const col of data.columns) {
			const id = row.attendances[col.eventId]?.attendanceTypeId;
			if (id === YES) yes++;
			else if (id === NO) no++;
			else if (id === UNDECIDED) undecided++;
		}
		return { yes, no, undecided };
	}

	// Per-match totals (across all rows)
	function matchTotals(eventId: number) {
		let yes = 0, no = 0, undecided = 0;
		for (const row of data.rows) {
			const id = row.attendances[eventId]?.attendanceTypeId;
			if (id === YES) yes++;
			else if (id === NO) no++;
			else if (id === UNDECIDED) undecided++;
		}
		return { yes, no, undecided };
	}
</script>

<svelte:head>
	<title>D-Mon Hockey — Aanwezigheid</title>
</svelte:head>

<div class="toolbar">
	<a href="/" class="back">← Ploegen</a>
	<div class="toggle">
		<a href="/team/{data.groupId}" class:active={data.from === 'today'}>Vandaag</a>
		<a href="/team/{data.groupId}?from=season" class:active={data.from === 'season'}>Seizoen</a>
	</div>
	{#if data.columns.length > 0}
		<a href="/team/{data.groupId}/download?from={data.from}" class="download">⬇ Download Excel</a>
	{/if}
</div>

{#if data.columns.length === 0}
	<p class="empty">Geen komende wedstrijden gevonden voor deze ploeg.</p>
{:else}
	<div class="table-wrapper">
		<table>
			<thead>
				<tr>
					<th class="player-col">Speler</th>
					{#each data.columns as col}
						<th class="match-col">
							<span class="match-date">{col.date}</span>
							<span class="match-opp">{col.opponent}</span>
							<span class="match-venue" class:home={col.isHome} class:away={!col.isHome}>
								{col.isHome ? 'T' : 'U'}
							</span>
						</th>
					{/each}
					<th class="total-col">Totaal</th>
				</tr>
			</thead>
			<tbody>
				{#each data.rows as row}
					{@const t = playerTotals(row)}
					<tr>
						<td class="player-name">
						{row.fullName}{#if t.undecided === 0}<span class="all-decided">✓</span>{/if}
					</td>
						{#each data.columns as col}
							{@const att = row.attendances[col.eventId]}
							{@const color = dotColor(att)}
							<td class="att-cell" title={tooltip(att)}>
								{#if color}
									<span class="dot" style="background-color: {color}"></span>
								{/if}
							</td>
						{/each}
						<td class="total-cell">
							<span class="sum yes">{t.yes}</span>
							<span class="sum-sep">/</span>
							<span class="sum no">{t.no}</span>
							<span class="sum-sep">/</span>
							<span class="sum undecided">{t.undecided}</span>
						</td>
					</tr>
				{/each}
			</tbody>
			<tfoot>
				<tr>
					<td class="player-name footer-label">Totaal</td>
					{#each data.columns as col}
						{@const t = matchTotals(col.eventId)}
						<td class="total-cell">
							<span class="sum yes">{t.yes}</span>
							<span class="sum-sep">/</span>
							<span class="sum no">{t.no}</span>
							<span class="sum-sep">/</span>
							<span class="sum undecided">{t.undecided}</span>
						</td>
					{/each}
					<td></td>
				</tr>
			</tfoot>
		</table>
	</div>
{/if}

<style>
	.toolbar {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin-bottom: 1.25rem;
	}

	.back {
		font-size: 0.875rem;
	}

	.toggle {
		display: flex;
		gap: 0;
		border: 1px solid var(--color-border);
		border-radius: var(--radius);
		overflow: hidden;
		font-size: 0.875rem;
	}

	.toggle a {
		padding: 0.3rem 0.75rem;
		background: var(--color-surface);
		text-decoration: none;
		color: inherit;
		transition: background 0.1s;
	}

	.toggle a:not(:last-child) {
		border-right: 1px solid var(--color-border);
	}

	.toggle a:hover:not(.active) {
		background: #eff6ff;
	}

	.toggle a.active {
		background: #133B63;
		color: #fff;
	}

	.download {
		margin-left: auto;
		font-size: 0.875rem;
		padding: 0.35rem 0.75rem;
		background: #133B63;
		color: #fff;
		border-radius: var(--radius);
		text-decoration: none;
	}

	.download:hover {
		background: #0A79B2;
		text-decoration: none;
	}

	.empty {
		color: var(--color-text-muted);
	}

	.table-wrapper {
		overflow-x: auto;
		border: 1px solid var(--color-border);
		border-radius: var(--radius);
		background: var(--color-surface);
	}

	table {
		border-collapse: collapse;
		min-width: 100%;
	}

	th,
	td {
		padding: 0.4rem 0.5rem;
		border-bottom: 1px solid var(--color-border);
		border-right: 1px solid var(--color-border);
		text-align: center;
		white-space: nowrap;
	}

	th:last-child,
	td:last-child {
		border-right: none;
	}

	tr:last-child td {
		border-bottom: none;
	}

	.player-col {
		text-align: left;
		min-width: 170px;
		background: var(--color-surface);
		position: sticky;
		left: 0;
		z-index: 1;
		border-right: 2px solid var(--color-border);
	}

	.player-name {
		text-align: left;
		background: var(--color-surface);
		position: sticky;
		left: 0;
		z-index: 1;
		border-right: 2px solid var(--color-border);
	}

	.match-col {
		min-width: 110px;
		font-size: 0.7rem;
		vertical-align: top;
	}

	.match-date {
		display: block;
		font-weight: 600;
		font-size: 0.72rem;
		white-space: nowrap;
	}

	.match-opp {
		display: block;
		font-size: 0.68rem;
		color: var(--color-text-muted);
	}

	.match-venue {
		display: inline-block;
		margin-top: 2px;
		font-size: 0.65rem;
		font-weight: 700;
		padding: 0 3px;
		border-radius: 3px;
	}

	.home {
		background: #d0edf9;
		color: #0A79B2;
	}

	.away {
		background: #fde8e2;
		color: #F04825;
	}

	.att-cell {
		vertical-align: middle;
	}

	.dot {
		display: inline-block;
		width: 14px;
		height: 14px;
		border-radius: 50%;
	}

	thead th {
		background: #f3f4f6;
	}

	tbody tr:hover td {
		background: #f9fafb;
	}

	tbody tr:hover .player-name {
		background: #f9fafb;
	}

	tfoot td {
		background: #f3f4f6;
		font-weight: 600;
		border-top: 2px solid var(--color-border);
	}

	tfoot .player-name {
		background: #f3f4f6;
	}

	.footer-label {
		color: var(--color-text-muted);
		font-size: 0.8rem;
	}

	.total-col {
		min-width: 80px;
		font-size: 0.75rem;
		border-left: 2px solid var(--color-border);
	}

	.total-cell {
		border-left: 2px solid var(--color-border);
		font-size: 0.75rem;
		font-variant-numeric: tabular-nums;
	}

	.sum {
		font-weight: 600;
	}

	.sum.yes       { color: #3DAE7E; }
	.sum.no        { color: #F04825; }
	.sum.undecided { color: #6B7280; }

	.sum-sep {
		color: var(--color-text-muted);
		margin: 0 1px;
	}

	.all-decided {
		margin-left: 4px;
		color: #3DAE7E;
		font-size: 0.75rem;
	}
</style>
