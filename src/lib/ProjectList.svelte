<script lang="ts">
	import { base } from '$app/paths';
	import { ArrowUpRight, CheckCircle2, Database, Plus, RefreshCw, Trash2 } from '@lucide/svelte';
	import { onMount } from 'svelte';
	import type { ProjectRegistry, ProjectSummary } from './types';

	const REPOSITORY = 'benkuper/Master-Shifter';
	const WORKFLOW = 'deploy.yml';
	const TOKEN_STORAGE_KEY = 'master-shifter-github-token';

	let registry = $state<ProjectRegistry | null>(null);
	let status = $state<'loading' | 'ready' | 'error'>('loading');
	let errorMessage = $state('');
	let token = $state('');
	let rememberToken = $state(false);
	let documentId = $state('');
	let managementStatus = $state<'ready' | 'submitting' | 'success' | 'error'>('ready');
	let managementMessage = $state('');
	let deletingSlug = $state('');

	onMount(() => {
		token = window.localStorage.getItem(TOKEN_STORAGE_KEY) ?? '';
		rememberToken = Boolean(token);
		void loadProjects();
	});

	async function loadProjects() {
		status = 'loading';
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

	function projectHref(slug: string) {
		return `${base}/${slug}`.replace(/\/+/g, '/');
	}

	function updateHref(slug: string) {
		return `${base}/${slug}/update`.replace(/\/+/g, '/');
	}

	async function addProject() {
		if (!documentId.trim()) {
			managementStatus = 'error';
			managementMessage = 'Document ID Grist manquant.';
			return;
		}

		managementStatus = 'submitting';
		managementMessage = '';
		deletingSlug = '';

		try {
			await dispatchWorkflow({
				project_action: 'add',
				document_id: documentId.trim(),
				force_sync: 'true'
			});
			documentId = '';
			managementStatus = 'success';
			managementMessage = 'Ajout lancé. Le projet sera détecté, synchronisé et publié automatiquement.';
		} catch (error) {
			managementStatus = 'error';
			managementMessage = error instanceof Error ? error.message : 'Erreur inconnue';
		}
	}

	async function removeProject(project: ProjectSummary) {
		if (!window.confirm(`Supprimer « ${project.name} » et ses données publiées ?`)) return;

		managementStatus = 'submitting';
		managementMessage = '';
		deletingSlug = project.slug;

		try {
			await dispatchWorkflow({
				project_action: 'remove',
				project: project.slug,
				force_sync: 'true'
			});
			managementStatus = 'success';
			managementMessage = `Suppression de « ${project.name} » lancée. La liste sera actualisée après le déploiement.`;
		} catch (error) {
			managementStatus = 'error';
			managementMessage = error instanceof Error ? error.message : 'Erreur inconnue';
		} finally {
			deletingSlug = '';
		}
	}

	async function dispatchWorkflow(inputs: Record<string, string>) {
		if (!token.trim()) throw new Error('Token GitHub manquant.');

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
						<div class="project-card__actions">
							<a class="primary-action" href={projectHref(project.slug)}>
								<ArrowUpRight size={18} aria-hidden="true" />
								<span>Ouvrir</span>
							</a>
							<a class="share-link" href={updateHref(project.slug)}>
								<RefreshCw size={17} aria-hidden="true" />
								<span>Update</span>
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
				Le nom, le slug, les tables et la solution sont détectés automatiquement depuis Grist.
			</p>

			<div class="update-card__actions">
				<button type="submit" class="primary-action" disabled={managementStatus === 'submitting'}>
					<Plus size={18} aria-hidden="true" />
					<span>{managementStatus === 'submitting' && !deletingSlug ? 'Ajout...' : 'Ajouter le projet'}</span>
				</button>
			</div>

			{#if managementStatus === 'success'}
				<p class="status-message status-message--success">
					<CheckCircle2 size={18} aria-hidden="true" />
					<span>{managementMessage}</span>
				</p>
			{:else if managementStatus === 'error'}
				<p class="status-message status-message--error">{managementMessage}</p>
			{/if}
		</form>
	</section>
</main>
