<script lang="ts">
	import { base } from '$app/paths';
	import '$lib/styles.css';
	import { onMount } from 'svelte';

	let { children } = $props();

	onMount(() => {
		const params = new URLSearchParams(window.location.search);
		if (params.get('source') !== 'installed-app') return;

		let target = '';
		try {
			target = localStorage.getItem('master-shifter-install-url') ?? '';
		} catch {
			// Le stockage local peut être indisponible en navigation privée.
		}

		if (target) {
			try {
				const url = new URL(target);
				const basePath = `${base}/`.replace(/\/+/g, '/');
				if (url.origin === window.location.origin && url.pathname.startsWith(basePath)) {
					window.location.replace(url.toString());
					return;
				}
			} catch {
				// Ignore une ancienne URL invalide et revient à l'accueil.
			}
		}

		params.delete('source');
		const cleanUrl = `${window.location.pathname}${params.size ? `?${params}` : ''}${window.location.hash}`;
		window.history.replaceState({}, '', cleanUrl);
	});
</script>

{@render children()}
