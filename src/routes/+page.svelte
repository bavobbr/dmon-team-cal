<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let downloading = $state(false);
	let progressDone = $state(0);
	let progressTotal = $state(0);
	let progressCurrent = $state('');

	type Section = 'outdoor' | 'indoor';

	const DOWNLOAD_FILE = {
		outdoor: {
			match: 'aanwezigheid-alle-ploegen.xlsx',
			training: 'trainingen-alle-ploegen.xlsx',
			roster: 'spelerslijst.xlsx'
		},
		indoor: {
			match: 'aanwezigheid-indoor.xlsx',
			training: 'trainingen-indoor.xlsx',
			roster: 'spelerslijst-indoor.xlsx'
		}
	};

	function downloadAll(kind: 'match' | 'training', section: Section) {
		downloading = true;
		progressDone = 0;
		progressTotal = 0;
		progressCurrent = '';

		const es = new EventSource(`/download/all?kind=${kind}&section=${section}`);

		es.onmessage = (e) => {
			const msg = JSON.parse(e.data);
			if (msg.type === 'start') {
				progressTotal = msg.total;
			} else if (msg.type === 'progress') {
				progressDone = msg.done;
				progressTotal = msg.total;
				progressCurrent = msg.current;
			} else if (msg.type === 'done') {
				es.close();
				const bytes = Uint8Array.from(atob(msg.file), (c) => c.charCodeAt(0));
				const blob = new Blob([bytes], {
					type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
				});
				const url = URL.createObjectURL(blob);
				const a = document.createElement('a');
				a.href = url;
				a.download = DOWNLOAD_FILE[section][kind];
				a.click();
				URL.revokeObjectURL(url);
				downloading = false;
			} else if (msg.type === 'error') {
				es.close();
				downloading = false;
			}
		};

		es.onerror = () => {
			es.close();
			downloading = false;
		};
	}
</script>

<svelte:head>
	<title>D-Mon Hockey — Ploegen</title>
</svelte:head>

<h1>Ploegen</h1>

{#if data.sections.length === 0}
	<p>Geen ploegen gevonden.</p>
{:else}
	{#each data.sections as { key, title, categories }}
		<div class="block">
			{#if title}
				<h1 class="section-title">{title}</h1>
			{/if}
			{#each categories as { categoryName, groups }}
				<section>
					<h2>{categoryName}</h2>
					<ul>
						{#each groups as group}
							<li>
								<a href="/team/{group.id}">{group.name}</a>
							</li>
						{/each}
					</ul>
				</section>
			{/each}

			<div class="actions">
				<button onclick={() => downloadAll('match', key)} disabled={downloading}>Download alle wedstrijden</button>
				<button onclick={() => downloadAll('training', key)} disabled={downloading}>Download alle trainingen</button>
				<a href="/download/roster?section={key}" download={DOWNLOAD_FILE[key].roster}>
					<button>Download spelerslijst</button>
				</a>
			</div>
		</div>
	{/each}
{/if}

{#if downloading}
	<div class="overlay">
		<div class="card">
			<p class="title">Export genereren…</p>
			<progress value={progressDone} max={progressTotal || 1}></progress>
			<p class="count">{progressDone} / {progressTotal} ploegen</p>
			{#if progressCurrent}
				<p class="current">{progressCurrent}</p>
			{/if}
		</div>
	</div>
{/if}

<style>
	h1 {
		margin-bottom: 1.5rem;
	}

	section {
		margin-bottom: 2rem;
	}

	h2 {
		font-size: 1rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-bottom: 0.5rem;
	}

	ul {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	li a {
		display: inline-block;
		padding: 0.35rem 0.75rem;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius);
		font-size: 0.9rem;
		transition: background 0.1s;
	}

	li a:hover {
		background: #eff6ff;
		text-decoration: none;
	}

	.actions {
		margin-top: 2rem;
	}

	.block + .block {
		margin-top: 3rem;
		padding-top: 2rem;
		border-top: 1px solid var(--color-border);
	}

	button {
		padding: 0.5rem 1.25rem;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius);
		font-size: 0.9rem;
		cursor: pointer;
		transition: background 0.1s;
	}

	button:hover:not(:disabled) {
		background: #eff6ff;
	}

	button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.45);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 100;
	}

	.card {
		background: #fff;
		border-radius: var(--radius);
		padding: 2rem 2.5rem;
		min-width: 280px;
		text-align: center;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.title {
		font-weight: 600;
		margin: 0;
	}

	progress {
		width: 100%;
	}

	.count {
		margin: 0;
		font-size: 0.9rem;
		color: #555;
	}

	.current {
		margin: 0;
		font-size: 0.85rem;
		color: #888;
	}
</style>
