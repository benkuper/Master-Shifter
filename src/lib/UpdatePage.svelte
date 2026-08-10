<script lang="ts">
	import { base } from '$app/paths';
	import { CheckCircle2, ExternalLink, RefreshCw, ShieldCheck } from '@lucide/svelte';
	import { onMount } from 'svelte';
	import { getPreviewSolutionId, setPreviewSolutionId, solutionById } from './solutionPreview';
	import type { ProjectRegistry, ProjectSummary } from './types';

	const REPOSITORY = 'benkuper/Master-Shifter';
	const WORKFLOW = 'deploy.yml';
	const TOKEN_STORAGE_KEY = 'master-shifter-github-token';

	let { projectSlug = '' } = $props<{ projectSlug?: string }>();

	let registry = $state<ProjectRegistry | null>(null);
	let token = $state('');
	let rememberToken = $state(false);
	let forceSync = $state(false);
	let selectedSolution = $state('');
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
			const loadedProject = projectSlug
				? registry.projects.find((item) => item.slug === projectSlug)
				: undefined;
			selectedSolution = loadedProject
				? getPreviewSolutionId(loadedProject) || String(loadedProject.solutionId ?? loadedProject.solutions?.at(-1)?.id ?? '')
				: '';
			status = 'ready';
		} catch (error) {
			status = 'error';
			errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
		}
	}

	function previewSolution(solutionId: string) {
		selectedSolution = solutionId;
		if (project) setPreviewSolutionId(project, solutionId);
	}

	function solutionName(solutionId: string) {
		return project ? (solutionById(project, solutionId)?.name ?? `Solution ${solutionId}`) : solutionId;
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
			const solutionChanged = Boolean(
				projectSlug && selectedSolution && String(project?.solutionId ?? '') !== selectedSolution
			);
			await dispatchWorkflow({
				force_sync: forceSync ? 'true' : 'false',
				project: projectSlug,
				...(solutionChanged
					? { project_action: 'set-solution', solution_id: selectedSolution }
					: {})
			});
			status = 'success';
		} catch (error) {
			status = 'error';
			errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
		}
	}

	async function dispatchWorkflow(inputs: Record<string, string>) {
		const response = await fetch(`https://api.github.com/repos/${REPOSITORY}/actions/workflows/${WORKFLOW}/dispatches`, {
			method: 'POST',
			headers: {
				Accept: 'application/vnd.github+json',
				Authorization: `Bearer ${token.trim()}`,
				'Content-Type': 'application/json',
				'X-GitHub-Api-Version': '2022-11-28'
			},
			body: JSON.stringify({ ref: 'main', inputs })
		});

		if (!response.ok) {
			const body = await response.text();
			try {
				const payload = JSON.parse(body) as { message?: string };
				throw new Error(payload.message ? `GitHub: ${payload.message}` : `GitHub: erreur ${response.status}`);
			} catch (error) {
				if (error instanceof SyntaxError) throw new Error(body || `GitHub: erreur ${response.status}`);
				throw error;
			}
		}

		if (rememberToken) window.localStorage.setItem(TOKEN_STORAGE_KEY, token.trim());
		else window.localStorage.removeItem(TOKEN_STORAGE_KEY);
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

			{#if projectSlug && project?.solutions?.length}
				<label class="selector-field">
					<span>Solution à prévisualiser</span>
					<select
						value={selectedSolution}
						disabled={status === 'submitting'}
						onchange={(event) => previewSolution(event.currentTarget.value)}
					>
						{#each project.solutions as solution}
							<option value={String(solution.id)}>{solution.name}</option>
						{/each}
					</select>
				</label>
				{#if selectedSolution !== String(project.solutionId ?? '')}
					<p class="preview-notice">
						Previewing {solutionName(selectedSolution)}
						(public solution: {solutionName(String(project.solutionId ?? ''))}).
						<a class="text-link" href={`${base}/${project.slug}`.replace(/\/+/g, '/')}>Open preview</a>
					</p>
				{:else}
					<p class="field-help">Le changement est enregistré pour tout le monde lors de la mise à jour.</p>
				{/if}
			{/if}

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
					<span>{status === 'submitting' ? 'Update...' : (projectSlug && selectedSolution !== String(project?.solutionId ?? '') ? 'Enregistrer et mettre à jour' : 'Lancer update')}</span>
				</button>
				<a class="share-link" href={actionsUrl} target="_blank" rel="noreferrer">
					<ExternalLink size={17} aria-hidden="true" />
					<span>Actions</span>
				</a>
			</div>

			{#if status === 'success'}
				<p class="status-message status-message--success">
					<CheckCircle2 size={18} aria-hidden="true" />
					<span>Mise à jour lancée. GitHub Actions va synchroniser Grist puis redéployer si besoin.</span>
				</p>
			{:else if status === 'error'}
				<p class="status-message status-message--error">{errorMessage}</p>
			{/if}
		</form>
	</section>
</main>
