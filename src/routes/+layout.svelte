<script lang="ts">
	import { base } from '$app/paths';
	import '$lib/styles.css';
	import {
		INSTALL_URL_STORAGE_KEY,
		isAppRoot,
		resolveInstallTarget
	} from '$lib/installTarget';
	import { onMount } from 'svelte';

	let { children } = $props();

	onMount(() => {
		const params = new URLSearchParams(window.location.search);
		const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
		const isStandalone =
			window.matchMedia('(display-mode: standalone)').matches ||
			navigatorWithStandalone.standalone === true;
		const hasLaunchMarker = params.get('source') === 'installed-app';

		// Les anciennes installations n'ont pas toujours le marqueur du manifeste.
		// Leur raccourci ouvre tout de même la racine de l'application en mode standalone.
		if (!hasLaunchMarker && !(isStandalone && isAppRoot(window.location.pathname, base))) return;

		let target = '';
		try {
			target = localStorage.getItem(INSTALL_URL_STORAGE_KEY) ?? '';
		} catch {
			// Le stockage local peut être indisponible en navigation privée.
		}

		const installTarget = resolveInstallTarget(target, window.location.origin, base);
		if (installTarget && installTarget.toString() !== window.location.href) {
			window.location.replace(installTarget.toString());
			return;
		}

		params.delete('source');
		const cleanUrl = `${window.location.pathname}${params.size ? `?${params}` : ''}${window.location.hash}`;
		window.history.replaceState({}, '', cleanUrl);
	});
</script>

{@render children()}
