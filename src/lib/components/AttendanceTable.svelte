<script lang="ts" generics="C extends { eventId: number }">
	import type { Snippet } from 'svelte';
	import type { Attendance, PlayerRow } from '$lib/types';

	let {
		columns,
		rows,
		header,
		emptyText,
		counts = () => true,
		dimmed = () => false,
		showRate = false
	}: {
		columns: C[];
		rows: PlayerRow[];
		/** Content of one activity's column header */
		header: Snippet<[C]>;
		/** Shown instead of the table when there are no columns */
		emptyText: string;
		/** Whether a column counts towards the per-player totals and rate */
		counts?: (col: C) => boolean;
		/** Whether a column is shown greyed out (e.g. a planned training) */
		dimmed?: (col: C) => boolean;
		/** Adds a "% aanwezig" column computed from the counted columns */
		showRate?: boolean;
	} = $props();

	const YES = 42028, UNDECIDED = 42033, NO = 42038;

	const DOT_COLOR: Record<number, string> = {
		[YES]: '#3DAE7E',
		[NO]:  '#F04825'
	};

	// Afwezig with a stated reason ("Ziek", "Werk", ...) is shown amber instead of red
	const EXCUSED_COLOR = '#F5A623';

	/** The reason the player typed in Twizzit, or null when there is none. */
	function reason(att: Attendance | undefined): string | null {
		const text = att?.comment?.trim();
		return text ? text : null;
	}

	function dotColor(att: Attendance | undefined): string | null {
		if (!att) return null;
		if (att.attendanceTypeId === NO && reason(att)) return EXCUSED_COLOR;
		return DOT_COLOR[att.attendanceTypeId] ?? null;
	}

	function tooltip(att: Attendance | undefined): string {
		if (!att) return 'Geen gegevens';
		const text = reason(att);
		return text ? `${att.attendanceTypeName}: ${text}` : att.attendanceTypeName;
	}

	// Cells with a reason get an instant custom tooltip; the rest keep the native
	// title attribute. A fixed-position bubble avoids being clipped by the
	// horizontally scrolling table wrapper.
	let tip = $state<{ text: string; x: number; y: number; below: boolean } | null>(null);

	function showTip(event: MouseEvent | FocusEvent, att: Attendance) {
		const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
		// Flip under the dot when there is no room for the bubble above it
		const below = rect.top < 60;
		tip = {
			text: tooltip(att),
			x: rect.left + rect.width / 2,
			y: below ? rect.bottom : rect.top,
			below
		};
	}

	function hideTip() {
		tip = null;
	}

	// Per-player totals (across the counted columns)
	function playerTotals(row: PlayerRow) {
		let yes = 0, no = 0, undecided = 0;
		for (const col of columns) {
			if (!counts(col)) continue;
			const id = row.attendances[col.eventId]?.attendanceTypeId;
			if (id === YES) yes++;
			else if (id === NO) no++;
			else if (id === UNDECIDED) undecided++;
		}
		return { yes, no, undecided };
	}

	// Per-activity totals (across all rows)
	function columnTotals(eventId: number) {
		let yes = 0, no = 0, undecided = 0;
		for (const row of rows) {
			const id = row.attendances[eventId]?.attendanceTypeId;
			if (id === YES) yes++;
			else if (id === NO) no++;
			else if (id === UNDECIDED) undecided++;
		}
		return { yes, no, undecided };
	}

	function rate(t: { yes: number; no: number; undecided: number }): string {
		const total = t.yes + t.no + t.undecided;
		return total === 0 ? '—' : `${Math.round((t.yes / total) * 100)}%`;
	}
</script>

{#if columns.length === 0}
	<p class="empty">{emptyText}</p>
{:else}
	<div class="table-wrapper">
		<table>
			<thead>
				<tr>
					<th class="player-col">Speler</th>
					{#each columns as col}
						<th class="match-col" class:dimmed={dimmed(col)}>
							{@render header(col)}
						</th>
					{/each}
					<th class="total-col">Totaal</th>
					{#if showRate}
						<th class="rate-col">%</th>
					{/if}
				</tr>
			</thead>
			<tbody>
				{#each rows as row}
					{@const t = playerTotals(row)}
					<tr>
						<td class="player-name">
						{row.fullName}{#if t.undecided === 0}<span class="all-decided">✓</span>{/if}
					</td>
						{#each columns as col}
							{@const att = row.attendances[col.eventId]}
							{@const color = dotColor(att)}
							{@const why = reason(att)}
							{#if att && why}
								<td
									class="att-cell"
									class:dimmed={dimmed(col)}
									aria-label="{row.fullName} — {tooltip(att)}"
									onmouseenter={(e) => showTip(e, att)}
									onmouseleave={hideTip}
									onfocusin={(e) => showTip(e, att)}
									onfocusout={hideTip}
									tabindex="0"
								>
									<span class="dot" style="background-color: {color}"></span>
								</td>
							{:else}
								<td class="att-cell" class:dimmed={dimmed(col)} title={tooltip(att)}>
									{#if color}
										<span class="dot" style="background-color: {color}"></span>
									{/if}
								</td>
							{/if}
						{/each}
						<td class="total-cell">
							<span class="sum yes">{t.yes}</span>
							<span class="sum-sep">/</span>
							<span class="sum no">{t.no}</span>
							<span class="sum-sep">/</span>
							<span class="sum undecided">{t.undecided}</span>
						</td>
						{#if showRate}
							<td class="rate-cell">{rate(t)}</td>
						{/if}
					</tr>
				{/each}
			</tbody>
			<tfoot>
				<tr>
					<td class="player-name footer-label">Totaal</td>
					{#each columns as col}
						{@const t = columnTotals(col.eventId)}
						<td class="total-cell" class:dimmed={dimmed(col)}>
							<span class="sum yes">{t.yes}</span>
							<span class="sum-sep">/</span>
							<span class="sum no">{t.no}</span>
							<span class="sum-sep">/</span>
							<span class="sum undecided">{t.undecided}</span>
						</td>
					{/each}
					<td></td>
					{#if showRate}
						<td></td>
					{/if}
				</tr>
			</tfoot>
		</table>
	</div>
{/if}

{#if tip}
	<div class="tip" class:below={tip.below} style="left: {tip.x}px; top: {tip.y}px" role="tooltip">
		{tip.text}
	</div>
{/if}

<style>
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

	.match-col :global(.match-date) {
		display: block;
		font-weight: 600;
		font-size: 0.72rem;
		white-space: nowrap;
	}

	.match-col :global(.match-opp) {
		display: block;
		font-size: 0.68rem;
		color: var(--color-text-muted);
	}

	.match-col :global(.match-venue) {
		display: inline-block;
		margin-top: 2px;
		font-size: 0.65rem;
		font-weight: 700;
		padding: 0 3px;
		border-radius: 3px;
	}

	.match-col :global(.home) {
		background: #d0edf9;
		color: #0A79B2;
	}

	.match-col :global(.away) {
		background: #fde8e2;
		color: #F04825;
	}

	.att-cell {
		vertical-align: middle;
	}

	.att-cell[tabindex]:focus-visible {
		outline: 2px solid #0A79B2;
		outline-offset: -2px;
	}

	.tip {
		position: fixed;
		z-index: 10;
		transform: translate(-50%, -100%);
		margin-top: -8px;
		max-width: 16rem;
		padding: 0.3rem 0.5rem;
		border-radius: var(--radius);
		background: #133B63;
		color: #fff;
		font-size: 0.75rem;
		line-height: 1.3;
		white-space: normal;
		pointer-events: none;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
	}

	.tip.below {
		transform: translate(-50%, 0);
		margin-top: 8px;
	}

	.tip::after {
		content: '';
		position: absolute;
		top: 100%;
		left: 50%;
		margin-left: -5px;
		border: 5px solid transparent;
		border-top-color: #133B63;
	}

	.tip.below::after {
		top: auto;
		bottom: 100%;
		border-top-color: transparent;
		border-bottom-color: #133B63;
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

	/* Planned activities: what players answered in advance, not yet counted */
	.dimmed {
		opacity: 0.45;
	}

	.rate-col {
		min-width: 56px;
		font-size: 0.75rem;
	}

	.rate-cell {
		font-size: 0.8rem;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}
</style>
