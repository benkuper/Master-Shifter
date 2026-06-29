<script lang="ts">
	import { base } from '$app/paths';
	import { ArrowUpRight, RefreshCw } from '@lucide/svelte';
	import { onMount } from 'svelte';
	import type { ProjectRegistry } from './types';

	let registry = $state<ProjectRegistry | null>(null);
	let status = $state<'loading' | 'ready' | 'error'>('loading');
	let errorMessage = $state('');

	onMount(() => {
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
						</div>
					</article>
				{/each}
			</div>
		{/if}
	</section>
</main>
