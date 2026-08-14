<script lang="ts">
	import { EllipsisVertical, HousePlus, Share2, X } from '@lucide/svelte';
	import { onMount } from 'svelte';

	type InstallPromptEvent = Event & {
		prompt: () => Promise<void>;
		userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
	};

	type NavigatorWithStandalone = Navigator & { standalone?: boolean };

	let installPrompt = $state<InstallPromptEvent | null>(null);
	let installed = $state(false);
	let showInstructions = $state(false);
	let platform = $state<'ios' | 'android' | 'other'>('other');
	let dialogElement = $state<HTMLElement | null>(null);

	$effect(() => {
		if (showInstructions) queueMicrotask(() => dialogElement?.focus());
	});

	onMount(() => {
		const navigatorWithStandalone = navigator as NavigatorWithStandalone;
		installed =
			window.matchMedia('(display-mode: standalone)').matches ||
			navigatorWithStandalone.standalone === true;

		const userAgent = navigator.userAgent.toLowerCase();
		platform = /iphone|ipad|ipod/.test(userAgent)
			? 'ios'
			: /android/.test(userAgent)
				? 'android'
				: 'other';

		function captureInstallPrompt(event: Event) {
			event.preventDefault();
			installPrompt = event as InstallPromptEvent;
		}

		function markAsInstalled() {
			installed = true;
			showInstructions = false;
			installPrompt = null;
		}

		function closeOnEscape(event: KeyboardEvent) {
			if (event.key === 'Escape') showInstructions = false;
		}

		window.addEventListener('beforeinstallprompt', captureInstallPrompt);
		window.addEventListener('appinstalled', markAsInstalled);
		window.addEventListener('keydown', closeOnEscape);

		return () => {
			window.removeEventListener('beforeinstallprompt', captureInstallPrompt);
			window.removeEventListener('appinstalled', markAsInstalled);
			window.removeEventListener('keydown', closeOnEscape);
		};
	});

	async function addToHomeScreen() {
		try {
			localStorage.setItem('master-shifter-install-url', window.location.href);
		} catch {
			// L'installation reste possible si le stockage local est désactivé.
		}

		if (!installPrompt) {
			showInstructions = true;
			return;
		}

		const currentPrompt = installPrompt;
		installPrompt = null;
		await currentPrompt.prompt();
		const choice = await currentPrompt.userChoice;

		if (choice.outcome === 'dismissed') showInstructions = true;
	}

	function closeFromBackdrop(event: MouseEvent) {
		if (event.target === event.currentTarget) showInstructions = false;
	}
</script>

{#if !installed}
	<button
		type="button"
		class="share-link install-button"
		aria-label="Ajouter cette page à l’écran d’accueil"
		title="Ajouter cette page à l’écran d’accueil"
		onclick={addToHomeScreen}
	>
		<HousePlus size={18} aria-hidden="true" />
		<span class="install-button__label">Ajouter à l’accueil</span>
	</button>
{/if}

{#if showInstructions}
	<div
		class="install-help__backdrop"
		role="presentation"
		onclick={closeFromBackdrop}
	>
		<div
			class="install-help"
			role="dialog"
			aria-modal="true"
			aria-labelledby="install-help-title"
			tabindex="-1"
			bind:this={dialogElement}
		>
			<header class="install-help__header">
				<div class="install-help__icon"><HousePlus size={24} aria-hidden="true" /></div>
				<div>
					<p class="eyebrow">Accès rapide</p>
					<h2 id="install-help-title">Ajouter cette page à l’écran d’accueil</h2>
				</div>
				<button
					type="button"
					class="icon-button"
					aria-label="Fermer"
					onclick={() => (showInstructions = false)}
				>
					<X size={20} aria-hidden="true" />
				</button>
			</header>

			{#if platform === 'ios'}
				<ol class="install-help__steps">
					<li><Share2 size={20} aria-hidden="true" /><span>Dans Safari, touchez <strong>Partager</strong>.</span></li>
					<li><HousePlus size={20} aria-hidden="true" /><span>Choisissez <strong>Sur l’écran d’accueil</strong>.</span></li>
					<li><span class="install-help__number">3</span><span>Confirmez avec <strong>Ajouter</strong>.</span></li>
				</ol>
			{:else if platform === 'android'}
				<ol class="install-help__steps">
					<li><EllipsisVertical size={20} aria-hidden="true" /><span>Ouvrez le menu de votre navigateur.</span></li>
					<li><HousePlus size={20} aria-hidden="true" /><span>Choisissez <strong>Ajouter à l’écran d’accueil</strong> ou <strong>Installer l’application</strong>.</span></li>
					<li><span class="install-help__number">3</span><span>Confirmez l’ajout.</span></li>
				</ol>
			{:else}
				<p class="install-help__desktop">
					Ouvrez cette page sur votre smartphone, puis utilisez le menu du navigateur pour
					l’ajouter à l’écran d’accueil.
				</p>
			{/if}

			<p class="install-help__note">Le raccourci rouvrira la vue actuellement affichée.</p>
		</div>
	</div>
{/if}
