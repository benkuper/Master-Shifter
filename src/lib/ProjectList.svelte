<script lang="ts">
	import { base } from '$app/paths';
	import { ArrowUpRight, CheckCircle2, Database, ExternalLink, Plus, RefreshCw, Trash2 } from '@lucide/svelte';
	import { onMount } from 'svelte';
	import { getPreviewSolutionId, setPreviewSolutionId, solutionById } from './solutionPreview';
	import type { ProjectRegistry, ProjectSummary } from './types';

	const REPOSITORY = 'benkuper/Master-Shifter';
	const WORKFLOW = 'deploy.yml';
	const TOKEN_STORAGE_KEY = 'master-shifter-github-token';
	const RUN_DISCOVERY_TIMEOUT = 60_000;
	const RUN_COMPLETION_TIMEOUT = 10 * 60_000;
	const POLL_INTERVAL = 2_500;

	type WorkflowRun = {
		id: number;
		status: 'queued' | 'in_progress' | 'completed';
		conclusion: string | null;
		html_url: string;
	};

	let registry = $state<ProjectRegistry | null>(null);
	let status = $state<'loading' | 'ready' | 'error'>('loading');
	let errorMessage = $state('');
	let token = $state('');
	let rememberToken = $state(false);
	let documentId = $state('');
	let managementStatus = $state<'ready' | 'submitting' | 'success' | 'error'>('ready');
	let managementMessage = $state('');
	let deletingSlug = $state('');
	let updatingSolutionSlug = $state('');
	let selectedSolutions = $state<Record<string, string>>({});
	let managementRunUrl = $state('');

	onMount(() => {
		token = window.localStorage.getItem(TOKEN_STORAGE_KEY) ?? '';
		rememberToken = Boolean(token);
		void loadProjects();
	});

	async function loadProjects(fresh = false) {
		if (!fresh) status = 'loading';
		try {
			const response = await fetch(`${base}/data/projects.json?v=${Date.now()}`, { cache: 'no-store' });
			if (!response.ok) throw new Error(`Impossible de charger les projets (${response.status})`);

			registry = (await response.json()) as ProjectRegistry;
			selectedSolutions = Object.fromEntries(
				registry.projects.map((project) => [
					project.slug,
					getPreviewSolutionId(project) || String(project.solutionId ?? project.solutions?.at(-1)?.id ?? '')
				])
			);
			status = 'ready';
		} catch (error) {
			status = 'error';
			errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
			if (fresh) throw error;
		}
	}

	function projectHref(slug: string) {
		return `${base}/${slug}`.replace(/\/+/g, '/');
	}

	function editHref(slug: string) {
		return `${base}/${slug}/edit`.replace(/\/+/g, '/');
	}

	function previewSolution(project: ProjectSummary, solutionId: string) {
		selectedSolutions[project.slug] = solutionId;
		setPreviewSolutionId(project, solutionId);
	}

	function solutionName(project: ProjectSummary, solutionId: string) {
		return solutionById(project, solutionId)?.name ?? `Solution ${solutionId}`;
	}

	async function addProject() {
		if (!documentId.trim()) {
			managementStatus = 'error';
			managementMessage = 'Document ID Grist manquant.';
			return;
		}

		managementStatus = 'submitting';
		managementMessage = 'Envoi de la demande à GitHub…';
		deletingSlug = '';
		managementRunUrl = '';

		try {
			await dispatchWorkflow({
				project_action: 'add',
				document_id: documentId.trim(),
				force_sync: 'true'
			});
			managementMessage = 'Déploiement terminé. Actualisation de la liste…';
			await loadProjects(true);
			documentId = '';
			managementStatus = 'success';
			managementMessage = 'Projet ajouté et liste actualisée.';
		} catch (error) {
			managementStatus = 'error';
			managementMessage = error instanceof Error ? error.message : 'Erreur inconnue';
		}
	}

	async function removeProject(project: ProjectSummary) {
		if (!window.confirm(`Supprimer « ${project.name} » et ses données publiées ?`)) return;

		managementStatus = 'submitting';
		managementMessage = 'Envoi de la demande à GitHub…';
		deletingSlug = project.slug;
		managementRunUrl = '';

		try {
			await dispatchWorkflow({
				project_action: 'remove',
				project: project.slug,
				force_sync: 'true'
			});
			managementMessage = 'Déploiement terminé. Actualisation de la liste…';
			await loadProjects(true);
			managementStatus = 'success';
			managementMessage = `« ${project.name} » a été supprimé et la liste est à jour.`;
		} catch (error) {
			managementStatus = 'error';
			managementMessage = error instanceof Error ? error.message : 'Erreur inconnue';
		} finally {
			deletingSlug = '';
		}
	}

	async function setSolution(project: ProjectSummary) {
		const solutionId = selectedSolutions[project.slug];
		if (!solutionId) {
			managementStatus = 'error';
			managementMessage = `Choisis une solution pour « ${project.name} ».`;
			return;
		}
		if (String(project.solutionId ?? '') === solutionId) return;

		managementStatus = 'submitting';
		managementMessage = `Enregistrement de la solution ${solutionId} pour « ${project.name} »…`;
		deletingSlug = '';
		updatingSolutionSlug = project.slug;
		managementRunUrl = '';

		try {
			await dispatchWorkflow({
				project_action: 'set-solution',
				project: project.slug,
				solution_id: solutionId,
				force_sync: 'true'
			});
			managementMessage = 'Déploiement terminé. Actualisation de la liste…';
			await loadProjects(true);
			managementStatus = 'success';
			managementMessage = `La solution ${solutionId} est maintenant publiée pour « ${project.name} ».`;
		} catch (error) {
			managementStatus = 'error';
			managementMessage = error instanceof Error ? error.message : 'Erreur inconnue';
		} finally {
			updatingSolutionSlug = '';
		}
	}

	async function dispatchWorkflow(inputs: Record<string, string>) {
		if (!token.trim()) throw new Error('Token GitHub manquant.');
		const knownRunIds = new Set((await workflowRuns()).map((run) => run.id));

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

		if (!response.ok) throw new Error(await githubErrorMessage(response));

		if (rememberToken) window.localStorage.setItem(TOKEN_STORAGE_KEY, token.trim());
		else window.localStorage.removeItem(TOKEN_STORAGE_KEY);

		managementMessage = 'Demande reçue. Démarrage de GitHub Actions…';
		const run = await waitForNewRun(knownRunIds);
		managementRunUrl = run.html_url;
		const completedRun = await waitForRunCompletion(run);

		if (completedRun.conclusion !== 'success') {
			throw new Error(`Le workflow GitHub s’est terminé avec le statut « ${completedRun.conclusion ?? 'inconnu'} ».`);
		}
	}

	async function workflowRuns() {
		const response = await githubFetch(
			`/actions/workflows/${WORKFLOW}/runs?event=workflow_dispatch&branch=main&per_page=10`
		);
		const payload = (await response.json()) as { workflow_runs?: WorkflowRun[] };
		return payload.workflow_runs ?? [];
	}

	async function waitForNewRun(knownRunIds: Set<number>) {
		const deadline = Date.now() + RUN_DISCOVERY_TIMEOUT;
		while (Date.now() < deadline) {
			const run = (await workflowRuns()).find((candidate) => !knownRunIds.has(candidate.id));
			if (run) return run;
			await delay(POLL_INTERVAL);
		}
		throw new Error('GitHub a accepté la demande, mais le nouveau workflow reste introuvable. Consulte Actions.');
	}

	async function waitForRunCompletion(initialRun: WorkflowRun) {
		const deadline = Date.now() + RUN_COMPLETION_TIMEOUT;
		let run = initialRun;

		while (Date.now() < deadline) {
			if (run.status === 'completed') return run;
			managementMessage = run.status === 'queued' ? 'Workflow en attente…' : 'Synchronisation et déploiement en cours…';
			await delay(POLL_INTERVAL);
			const response = await githubFetch(`/actions/runs/${run.id}`);
			run = (await response.json()) as WorkflowRun;
		}

		throw new Error('Le workflow prend plus de dix minutes. Consulte Actions pour connaître son état.');
	}

	async function githubFetch(path: string) {
		const response = await fetch(`https://api.github.com/repos/${REPOSITORY}${path}`, {
			cache: 'no-store',
			headers: {
				Accept: 'application/vnd.github+json',
				Authorization: `Bearer ${token.trim()}`,
				'X-GitHub-Api-Version': '2022-11-28'
			}
		});
		if (!response.ok) throw new Error(await githubErrorMessage(response));
		return response;
	}

	function delay(milliseconds: number) {
		return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
	}

	async function githubErrorMessage(response: Response) {
		const body = await response.text();
		if (response.status === 422 && body.includes('Unexpected inputs')) {
			return 'Le workflow GitHub sur main n’est pas encore à jour. Commit et push les changements avant de réessayer.';
		}

		try {
			const payload = JSON.parse(body) as { message?: string };
			return payload.message ? `GitHub: ${payload.message}` : `GitHub: erreur ${response.status}`;
		} catch {
			return body || `GitHub: erreur ${response.status}`;
		}
	}
</script>

<svelte:head>
	<title>Tous les projets - Master Shifter</title>
	<meta name="description" content="Liste des projets Master Shifter disponibles." />
</svelte:head>

<main class="app-shell">
	<section class="simple-page">
		<header class="simple-page__header">
			<div>
				<p class="eyebrow">Master Shifter</p>
				<h1>Tous les projets</h1>
			</div>
			<a class="primary-action" href={`${base}/update`.replace(/\/+/g, '/')}>
				<RefreshCw size={18} aria-hidden="true" />
				<span>Update</span>
			</a>
		</header>



		{#if status === 'error'}
			<div class="empty-card">
				<h3>Chargement impossible</h3>
				<p>{errorMessage}</p>
			</div>
		{:else if status === 'loading' || !registry}
			<div class="empty-card">
				<h3>Chargement</h3>
			</div>
		{:else}
			<div class="project-grid">
				{#each registry.projects as project}
					<article class="project-card">
						<div>
							<p class="eyebrow">{project.period ?? 'Planning'}</p>
							<h2>{project.name}</h2>
							{#if project.description}
								<p>{project.description}</p>
							{/if}
						</div>
						{#if project.solutions?.length}
							<div class="solution-picker">
								<label class="selector-field">
									<span>Solution à prévisualiser</span>
									<select
										value={selectedSolutions[project.slug]}
										disabled={managementStatus === 'submitting'}
										onchange={(event) => previewSolution(project, event.currentTarget.value)}
									>
										{#each project.solutions as solution}
											<option value={String(solution.id)}>{solution.name}</option>
										{/each}
									</select>
								</label>
								<button
									type="button"
									class="share-link"
									disabled={managementStatus === 'submitting' || String(project.solutionId ?? '') === selectedSolutions[project.slug]}
									onclick={() => void setSolution(project)}
								>
									<RefreshCw size={17} aria-hidden="true" />
									<span>{updatingSolutionSlug === project.slug ? 'Publication…' : 'Publier'}</span>
								</button>
							</div>
							{#if selectedSolutions[project.slug] !== String(project.solutionId ?? '')}
								<p class="preview-notice">
									Previewing {solutionName(project, selectedSolutions[project.slug])}
									(public solution: {solutionName(project, String(project.solutionId ?? ''))}).
								</p>
							{/if}
						{/if}
						<div class="project-card__actions">
							<a class="primary-action" href={projectHref(project.slug)}>
								<ArrowUpRight size={18} aria-hidden="true" />
								<span>Ouvrir</span>
							</a>
							<a class="share-link" href={editHref(project.slug)}>
								<RefreshCw size={17} aria-hidden="true" />
								<span>Éditer</span>
							</a>
							<button
								type="button"
								class="danger-action"
								disabled={managementStatus === 'submitting'}
								onclick={() => void removeProject(project)}
							>
								<Trash2 size={17} aria-hidden="true" />
								<span>{deletingSlug === project.slug ? 'Suppression...' : 'Supprimer'}</span>
							</button>
						</div>
					</article>
				{/each}
			</div>
		{/if}

		<form class="update-card" onsubmit={(event) => { event.preventDefault(); void addProject(); }}>
			<div class="update-card__scope">
				<Database size={22} aria-hidden="true" />
				<div>
					<p class="eyebrow">Configuration automatique</p>
					<h2>Ajouter un projet</h2>
				</div>
			</div>

			<div class="project-manager__fields">
				<label class="selector-field">
					<span>Document ID Grist</span>
					<input
						type="text"
						autocomplete="off"
						bind:value={documentId}
						placeholder="ID ou URL complète du document"
					/>
				</label>

				<label class="selector-field">
					<span>Token GitHub</span>
					<input
						type="password"
						autocomplete="off"
						bind:value={token}
						placeholder="Token avec permission Actions: write"
					/>
				</label>
			</div>

			<label class="check-row">
				<input type="checkbox" bind:checked={rememberToken} />
				<span>Garder le token sur cet appareil</span>
			</label>

			<p class="field-help">
				Le nom, le slug, les tables et les solutions sont détectés automatiquement depuis Grist.
			</p>

			<div class="update-card__actions">
				<button type="submit" class="primary-action" disabled={managementStatus === 'submitting'}>
					<Plus size={18} aria-hidden="true" />
					<span>{managementStatus === 'submitting' && !deletingSlug ? 'Ajout...' : 'Ajouter le projet'}</span>
				</button>
			</div>

			{#if managementStatus === 'submitting'}
				<p class="status-message" aria-live="polite">
					<RefreshCw class="spinning" size={18} aria-hidden="true" />
					<span>{managementMessage}</span>
					{#if managementRunUrl}
						<a class="text-link" href={managementRunUrl} target="_blank" rel="noreferrer">
							<ExternalLink size={15} aria-hidden="true" />
							<span>Voir le run</span>
						</a>
					{/if}
				</p>
			{:else if managementStatus === 'success'}
				<p class="status-message status-message--success">
					<CheckCircle2 size={18} aria-hidden="true" />
					<span>{managementMessage}</span>
					{#if managementRunUrl}
						<a class="text-link" href={managementRunUrl} target="_blank" rel="noreferrer">Voir le run</a>
					{/if}
				</p>
			{:else if managementStatus === 'error'}
				<p class="status-message status-message--error">
					<span>{managementMessage}</span>
					{#if managementRunUrl}
						<a class="text-link" href={managementRunUrl} target="_blank" rel="noreferrer">Voir le run</a>
					{/if}
				</p>
			{/if}
		</form>
	</section>
</main>
