<script lang="ts">
	let {
		groupId,
		tab,
		ranges,
		downloadHref = null
	}: {
		groupId: number;
		tab: 'matches' | 'trainings';
		/** Date range options for the current tab, e.g. Vandaag / Seizoen */
		ranges: Array<{ label: string; href: string; active: boolean }>;
		/** Excel download for the current view, or null to hide the button */
		downloadHref?: string | null;
	} = $props();
</script>

<div class="toolbar">
	<a href="/" class="back">← Ploegen</a>
	<div class="toggle tabs">
		<a href="/team/{groupId}" class:active={tab === 'matches'}>Wedstrijden</a>
		<a href="/team/{groupId}/trainingen" class:active={tab === 'trainings'}>Trainingen</a>
	</div>
	<div class="toggle">
		{#each ranges as range}
			<a href={range.href} class:active={range.active}>{range.label}</a>
		{/each}
	</div>
	{#if downloadHref}
		<a href={downloadHref} class="download">⬇ Download Excel</a>
	{/if}
</div>

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

	.toolbar {
		flex-wrap: wrap;
	}

	.tabs a {
		font-weight: 600;
	}
</style>
