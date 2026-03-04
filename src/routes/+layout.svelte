<script lang="ts">
	import '../app.css';
	import type { Snippet } from 'svelte';

	interface Props {
		children: Snippet;
	}

	let { children }: Props = $props();
</script>

<header>
	<a href="/" class="brand">D-Mon Hockey</a>
</header>

<main>
	{@render children()}
</main>

<style>
	header {
		background: #133B63;
		padding: 0.75rem 1.5rem;
	}

	.brand {
		color: #ffffff;
		font-size: 1.1rem;
		font-weight: 700;
		letter-spacing: 0.02em;
		text-decoration: none;
	}

	.brand:hover {
		text-decoration: none;
		opacity: 0.85;
	}

	main {
		padding: 1.5rem;
	}
</style>
