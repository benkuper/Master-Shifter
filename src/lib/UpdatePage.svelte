<script lang="ts">
	import { base } from '$app/paths';
	import { CheckCircle2, ExternalLink, RefreshCw, ShieldCheck } from '@lucide/svelte';
	import { onMount } from 'svelte';
	import type { ProjectRegistry, ProjectSummary } from './types';

	const REPOSITORY = 'benkuper/Master-Shifter';
	const WORKFLOW = 'deploy.yml';
	const TOKEN_STORAGE_KEY = 'master-shifter-github-token';

	let { projectSlug = '' } = $props<{ projectSlug?: string }>();

	let registry = $state<ProjectRegistry | null>(null);
	let token = $state('');
	let rememberToken = $state(false);
	let forceSync = $state(false);
	let status = $state<'loading' | 'ready' | 'submitting' | 'success' | 'error'>('loading');
	let errorMessage = $state('');

	let project = $derived<ProjectSummary | undefined>(
		projectSlug ? registry?.projects.find((item) => item.slug === projectSlug) : undefined
	);
	let title = $derived(projectSlug ? `Update ${project?.name ?? projectSlug}` : 'Update tous les projets');
	let actionsUrl = `https://github.com/${REPOSITORY}/actions/workflows/${WORKFLOW}`;

	onMount(() => {
		token = window.localStorage.getItem(TOKEN_STORAGE_KEY) ?? '';
		rememberToken = Boolean(token);
		void loadProjects();
	});

	async function loadProjects() {
		try {
			const response = await fetch(`${base}/data/projects.json`);
			if (!response.ok) throw new Error(`Impossible de charger les projets (${response.status})`);

			registry = (await response.json()) as ProjectRegistry;
			status = 'ready';
		} catch (error) {
			status = 'error';
			errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
		}
	}

	async function triggerUpdate() {
		if (!token.trim()) {
			status = 'error';
			errorMessage = 'Token GitHub manquant.';
			return;
		}

		status = 'submitting';
		errorMessage = '';

		try {
			const response = await fetch(`https://api.github.com/repos/${REPOSITORY}/actions/workflows/${WORKFLOW}/dispatches`, {
				method: 'POST',
				headers: {
					Accept: 'application/vnd.github+json',
					Authorization: `Bearer ${token.trim()}`,
					'Content-Type': 'application/json',
					'X-GitHub-Api-Version': '2022-11-28'
				},
				body: JSON.stringify({
					ref: 'main',
					inputs: {
						force_sync: forceSync ? 'true' : 'false',
						project: projectSlug
					}
				})
			});

			if (!response.ok) throw new Error(await response.text());

			if (rememberToken) window.localStorage.setItem(TOKEN_STORAGE_KEY, token.trim());
			else window.localStorage.removeItem(TOKEN_STORAGE_KEY);

			status = 'success';
		} catch (error) {
			status = 'error';
			errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
		}
	}
</script>

<svelte:head>
	<title>{title} - Master Shifter</title>
	<meta name="description" content="Declenchement de synchronisation Master Shifter." />
</svelte:head>

<main class="app-shell">
	<section class="simple-page update-page">
		<header class="simple-page__header">
			<div>
				<p class="eyebrow">Master Shifter</p>
				<h1>{title}</h1>
			</div>
			<a class="share-link" href={`${base}/all`.replace(/\/+/g, '/')}>
				<span>Projets</span>
			</a>
		</header>

		<form class="update-card" onsubmit={(event) => { event.preventDefault(); void triggerUpdate(); }}>
			<div class="update-card__scope">
				<ShieldCheck size={22} aria-hidden="true" />
				<div>
					<p class="eyebrow">Cible</p>
					<h2>{projectSlug ? (project?.name ?? projectSlug) : 'Tous les projets'}</h2>
				</div>
			</div>

			<label class="selector-field">
				<span>Token GitHub</span>
				<input
					type="password"
					autocomplete="off"
					bind:value={token}
					placeholder="Token avec permission Actions: write"
				/>
			</label>

			<label class="check-row">
				<input type="checkbox" bind:checked={rememberToken} />
				<span>Garder sur cet appareil</span>
			</label>

			<label class="check-row">
				<input type="checkbox" bind:checked={forceSync} />
				<span>Forcer le redeploiement</span>
			</label>

			<div class="update-card__actions">
				<button type="submit" class="primary-action" disabled={status === 'submitting'}>
					<RefreshCw size={18} aria-hidden="true" />
					<span>{status === 'submitting' ? 'Update...' : 'Lancer update'}</span>
				</button>
				<a class="share-link" href={actionsUrl} target="_blank" rel="noreferrer">
					<ExternalLink size={17} aria-hidden="true" />
					<span>Actions</span>
				</a>
			</div>

			{#if status === 'success'}
				<p class="status-message status-message--success">
					<CheckCircle2 size={18} aria-hidden="true" />
					<span>Update lance. GitHub Actions va synchroniser Grist puis redeployer si besoin.</span>
				</p>
			{:else if status === 'error'}
				<p class="status-message status-message--error">{errorMessage}</p>
			{/if}
		</form>
	</section>
</main>
