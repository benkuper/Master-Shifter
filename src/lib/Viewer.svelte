<script lang="ts">
	import { base } from '$app/paths';
	import { onMount } from 'svelte';
	import {
		CalendarClock,
		History,
		MapPin,
		Printer,
		QrCode,
		RefreshCw,
		Sparkles,
		Tag,
		UserRound,
		UsersRound
	} from '@lucide/svelte';
	import {
		byName,
		enrichTasks,
		filterTasks,
		findByQuery,
		getNextTask,
		groupByDay,
		normalizeForSearch
	} from './schedule';
	import TaskCard from './TaskCard.svelte';
	import type { EnrichedTask, ProjectRegistry, ScheduleData, ViewMode } from './types';
	import QRCode from 'qrcode';

	let { projectSlug = '' } = $props<{ projectSlug?: string }>();

	const modes: Array<{ id: ViewMode; label: string; allLabel: string; icon: typeof UserRound }> = [
		{ id: 'volunteer', label: 'Bénévole', allLabel: 'Tous les bénévoles', icon: UserRound },
		{ id: 'spot', label: 'Lieu', allLabel: 'Tous les lieux', icon: MapPin },
		{ id: 'questType', label: 'Type de quête', allLabel: 'Tous les types', icon: Tag },
		{ id: 'all', label: 'Tout', allLabel: 'Tout le planning', icon: UsersRound }
	];

	const THEME_PALETTE = [
		{ primary: 166, secondary: 28, surface: 172 },
		{ primary: 322, secondary: 190, surface: 318 },
		{ primary: 38, secondary: 214, surface: 32 },
		{ primary: 214, secondary: 54, surface: 220 },
		{ primary: 286, secondary: 96, surface: 280 },
		{ primary: 96, secondary: 344, surface: 104 },
		{ primary: 18, secondary: 188, surface: 12 },
		{ primary: 252, secondary: 54, surface: 248 },
		{ primary: 190, secondary: 322, surface: 190 },
		{ primary: 344, secondary: 166, surface: 350 },
		{ primary: 54, secondary: 252, surface: 48 },
		{ primary: 132, secondary: 286, surface: 136 }
	] as const;

	let registry = $state<ProjectRegistry | null>(null);
	let project = $state<ScheduleData | null>(null);
	let loadedSlug = $state('');
	let lastRouteSlug = $state<string | null>(null);
	let status = $state<'loading' | 'ready' | 'error'>('loading');
	let errorMessage = $state('');
	let mode = $state<ViewMode>('volunteer');
	let selectedId = $state('');
	let showPast = $state(false);
	let showProjectSelector = $state(false);
	let now = $state(new Date());
	let currentUrl = $state('');
	let qrSvg = $state('');

	let allTasks = $derived(project ? enrichTasks(project, now) : []);
	let volunteers = $derived(project ? byName(project.volunteers) : []);
	let spots = $derived(project ? byName(project.spots) : []);
	let questTypes = $derived(project ? byName(project.questTypes ?? []) : []);
	let selectedVolunteer = $derived(volunteers.find((volunteer) => volunteer.id === selectedId));
	let selectedSpot = $derived(spots.find((spot) => spot.id === selectedId));
	let selectedQuestType = $derived(questTypes.find((questType) => questType.id === selectedId));
	let contextTasks = $derived(filterTasks(allTasks, mode, selectedId, showPast));
	let nextTask = $derived(getNextTask(contextTasks));
	let listTasks = $derived(nextTask ? contextTasks.filter((task) => task.id !== nextTask.id) : contextTasks);
	let projectTimezone = $derived(project?.timezone ?? 'Europe/Paris');
	let dayStartHour = $derived(normalizeDayStartHour(project?.dayStartHour));
	let dayGroups = $derived(groupByDay(listTasks, projectTimezone, dayStartHour));
	let shouldShowBreaks = $derived(mode === 'volunteer' && Boolean(selectedId));
	let pastCount = $derived(allTasks.filter((task) => task.state === 'past').length);
	let theme = $derived(projectTheme(loadedSlug || project?.slug || projectSlug || 'master-shifter', registry));
	let themeStyle = $derived(
		`--accent-h:${theme.primary};--accent-2-h:${theme.secondary};--surface-h:${theme.surface};`
	);

	onMount(() => {
		const timer = window.setInterval(() => {
			now = new Date();
		}, 60000);

		void boot();

		return () => window.clearInterval(timer);
	});

	$effect(() => {
		if (registry) {
			const nextSlug = projectSlug || registry.defaultProject;
			if (nextSlug && nextSlug !== lastRouteSlug) {
				lastRouteSlug = nextSlug;
				void loadProject(nextSlug, true);
			}
		}
	});

	$effect(() => {
		if (typeof document === 'undefined') return;

		document.documentElement.style.setProperty('--accent-h', `${theme.primary}`);
		document.documentElement.style.setProperty('--accent-2-h', `${theme.secondary}`);
		document.documentElement.style.setProperty('--surface-h', `${theme.surface}`);
	});

	$effect(() => {
		const shareState = `${project?.slug ?? ''}|${mode}|${selectedId}|${showPast}|${showProjectSelector}`;
		if (shareState) void updateShareArtifacts();
	});

	async function boot() {
		status = 'loading';
		try {
			showProjectSelector = new URLSearchParams(window.location.search).has('showProjectSelector');

			const response = await fetch(`${base}/data/projects.json`);
			if (!response.ok) throw new Error(`Impossible de charger la liste des projets (${response.status})`);

			registry = (await response.json()) as ProjectRegistry;
			const initialSlug = projectSlug || registry.defaultProject;
			lastRouteSlug = initialSlug;
			await loadProject(initialSlug, true);
		} catch (error) {
			status = 'error';
			errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
		}
	}

	async function loadProject(slug: string, hydrate = false) {
		if (!registry) return;

		const summary = registry.projects.find((item) => item.slug === slug);
		if (!summary) throw new Error(`Projet "${slug}" introuvable dans la configuration locale`);

		status = 'loading';
		errorMessage = '';

		try {
			const response = await fetch(`${base}/${summary.dataPath}`);
			if (!response.ok) throw new Error(`Impossible de charger ${summary.name} (${response.status})`);

			project = (await response.json()) as ScheduleData;
			loadedSlug = summary.slug;
			status = 'ready';

			if (hydrate) hydrateFromUrl();
			if (!hydrate) replaceProjectUrl(summary.slug);
		} catch (error) {
			status = 'error';
			errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
		}
	}

	function hydrateFromUrl() {
		if (!project) return;

		const params = new URLSearchParams(window.location.search);
		showProjectSelector = params.has('showProjectSelector');
		const viewParam = params.get('vue') as ViewMode | null;
		const volunteerParam = params.get('benevole') ?? params.get('nom');
		const spotParam = params.get('lieu') ?? params.get('place');
		const typeParam = params.get('type') ?? params.get('questType');

		if (volunteerParam) {
			const volunteer = findParamMatch(project.volunteers, volunteerParam);
			if (volunteer) selectEntity('volunteer', volunteer.id, false);
		} else if (spotParam) {
			const spot = findParamMatch(project.spots, spotParam);
			if (spot) selectEntity('spot', spot.id, false);
		} else if (typeParam) {
			const questType = findParamMatch(project.questTypes ?? [], typeParam);
			if (questType) selectEntity('questType', questType.id, false);
		} else if (viewParam && modes.some((item) => item.id === viewParam)) {
			mode = viewParam;
			selectedId = '';
		} else {
			mode = 'volunteer';
			selectedId = '';
		}

		showPast = params.get('archives') === '1' || params.get('past') === '1';
	}

	function findParamMatch<T extends { id: string; name: string; fullName?: string; shortName?: string }>(
		items: T[],
		value: string
	): T | undefined {
		const normalized = normalizeForSearch(value);
		return items.find((item) => {
			return (
				item.id === value ||
				normalizeForSearch(item.name) === normalized ||
				normalizeForSearch(item.fullName ?? '') === normalized ||
				normalizeForSearch(item.shortName ?? '') === normalized
			);
		});
	}

	function replaceProjectUrl(slug: string) {
		const path = `${base}/${slug}`.replace(/\/+/g, '/');
		const params = baseParams();
		window.history.pushState({}, '', `${path}${params.size ? `?${params}` : ''}`);
	}

	function updateUrl() {
		if (!project) return;

		const params = baseParams();

		if (mode === 'volunteer' && selectedVolunteer) params.set('benevole', selectedVolunteer.name);
		else if (mode === 'spot' && selectedSpot) params.set('lieu', selectedSpot.name);
		else if (mode === 'questType' && selectedQuestType) params.set('type', selectedQuestType.shortName ?? selectedQuestType.name);
		else if (mode !== 'all') params.set('vue', mode);

		if (showPast) params.set('archives', '1');

		const path = `${base}/${project.slug}`.replace(/\/+/g, '/');
		window.history.replaceState({}, '', `${path}${params.size ? `?${params}` : ''}`);
	}

	function buildCurrentUrl() {
		if (!project || typeof window === 'undefined') return '';

		const params = baseParams();

		if (mode === 'volunteer' && selectedVolunteer) params.set('benevole', selectedVolunteer.name);
		else if (mode === 'spot' && selectedSpot) params.set('lieu', selectedSpot.name);
		else if (mode === 'questType' && selectedQuestType) params.set('type', selectedQuestType.shortName ?? selectedQuestType.name);
		else if (mode !== 'all') params.set('vue', mode);

		if (showPast) params.set('archives', '1');

		const path = `${base}/${project.slug}`.replace(/\/+/g, '/');
		return new URL(`${path}${params.size ? `?${params}` : ''}`, window.location.origin).toString();
	}

	async function updateShareArtifacts() {
		const nextUrl = buildCurrentUrl();
		if (!nextUrl) return;

		currentUrl = nextUrl;
		qrSvg = await QRCode.toString(nextUrl, {
			type: 'svg',
			margin: 1,
			width: 180,
			color: {
				dark: '#121414',
				light: '#ffffff'
			}
		});
	}

	function baseParams() {
		const params = new URLSearchParams();
		if (showProjectSelector) params.set('showProjectSelector', '');
		return params;
	}

	function selectMode(nextMode: ViewMode) {
		mode = nextMode;
		selectedId = '';
		updateUrl();
	}

	function selectEntity(nextMode: ViewMode, id: string, shouldUpdateUrl = true) {
		mode = nextMode;
		selectedId = id;
		if (shouldUpdateUrl) updateUrl();
	}

	function selectCurrentEntity(id: string) {
		selectedId = id;
		updateUrl();
	}

	function togglePast() {
		showPast = !showPast;
		updateUrl();
	}

	function selectProject(slug: string) {
		mode = 'all';
		selectedId = '';
		showPast = false;
		void loadProject(slug);
	}

	function printPage() {
		window.print();
	}

	function scrollToSharePanel() {
		document.getElementById('share-panel')?.scrollIntoView({
			behavior: 'smooth',
			block: 'start'
		});
	}

	function breakMinutes(previousTask: EnrichedTask, nextTask: EnrichedTask) {
		return Math.round((new Date(nextTask.start).getTime() - new Date(previousTask.end).getTime()) / 60000);
	}

	function breakLabel(minutes: number) {
		if (minutes === 0) return 'Pause 0 min';
		if (minutes < 0) return `Chevauchement ${formatDuration(Math.abs(minutes))}`;
		return `Pause ${formatDuration(minutes)}`;
	}

	function formatDuration(totalMinutes: number) {
		if (totalMinutes < 60) return `${totalMinutes} min`;

		const hours = Math.floor(totalMinutes / 60);
		const minutes = totalMinutes % 60;
		return minutes ? `${hours} h ${minutes.toString().padStart(2, '0')}` : `${hours} h`;
	}

	function taskDurationMinutes(task: EnrichedTask) {
		return Math.max(0, Math.round((new Date(task.end).getTime() - new Date(task.start).getTime()) / 60000));
	}

	function dayWorkMinutes(tasks: EnrichedTask[]) {
		return tasks.reduce((total, task) => total + taskDurationMinutes(task), 0);
	}

	function daySummary(tasks: EnrichedTask[]) {
		return `${tasks.length} quête${tasks.length > 1 ? 's' : ''} · ${formatDuration(dayWorkMinutes(tasks))}`;
	}

	function normalizeDayStartHour(value: number | undefined) {
		if (value === undefined) return 0;

		const hour = Number(value);
		return Number.isFinite(hour) ? hour : 0;
	}

	function projectTheme(seed: string, projectRegistry: ProjectRegistry | null) {
		return THEME_PALETTE[resolveThemeIndex(seed, projectRegistry)];
	}

	function resolveThemeIndex(seed: string, projectRegistry: ProjectRegistry | null) {
		const sortedSlugs = [...(projectRegistry?.projects.map((item) => item.slug).filter(Boolean) ?? [])].sort(
			(a, b) => a.localeCompare(b)
		);
		const usedIndexes = new Set<number>();

		for (const slug of sortedSlugs) {
			const preferredIndex = hashString(slug) % THEME_PALETTE.length;
			const index = findAvailableThemeIndex(preferredIndex, usedIndexes);

			if (slug === seed) return index;
			usedIndexes.add(index);
		}

		return hashString(seed) % THEME_PALETTE.length;
	}

	function findAvailableThemeIndex(preferredIndex: number, usedIndexes: Set<number>) {
		for (let offset = 0; offset < THEME_PALETTE.length; offset += 1) {
			const index = (preferredIndex + offset * 5) % THEME_PALETTE.length;
			if (!usedIndexes.has(index)) return index;
		}

		return preferredIndex;
	}

	function hashString(value: string) {
		let hash = 2166136261;
		for (const char of value) {
			hash ^= char.charCodeAt(0);
			hash = Math.imul(hash, 16777619);
		}
		return Math.abs(hash);
	}
</script>

<svelte:head>
	<title>{project ? `${project.name} - Master Shifter` : 'Master Shifter'}</title>
	<meta name="description" content="Planning bénévoles, missions et lieux synchronisé depuis Grist." />
</svelte:head>

<main class="app-shell" style={themeStyle}>
	{#if status === 'error'}
		<section class="state-panel">
			<RefreshCw size={34} aria-hidden="true" />
			<h1>Chargement impossible</h1>
			<p>{errorMessage}</p>
			<button type="button" class="primary-action" onclick={boot}>Réessayer</button>
		</section>
	{:else if status === 'loading' || !project}
		<section class="state-panel">
			<Sparkles size={34} aria-hidden="true" />
			<h1>Chargement du planning</h1>
			<p>Préparation des bénévoles, lieux et types de quêtes.</p>
		</section>
	{:else}
		<section class="topbar" aria-label="Sélection du planning">
			<div class="brand-lockup">
				<p class="eyebrow">Master Shifter</p>
				<h1>{project.name}</h1>
			</div>

			<div class="topbar__actions">
				{#if showProjectSelector && registry && registry.projects.length > 1}
					<label class="project-select">
						<span>Projet</span>
						<select value={loadedSlug} onchange={(event) => selectProject(event.currentTarget.value)}>
							{#each registry.projects as summary}
								<option value={summary.slug}>{summary.name}</option>
							{/each}
						</select>
					</label>
				{/if}

				<button type="button" class="share-link" title="Afficher le QR code de partage" onclick={scrollToSharePanel}>
					<QrCode size={18} aria-hidden="true" />
					<span>Partager</span>
				</button>

				<button type="button" class="icon-button print-button" title="Imprimer" onclick={printPage}>
					<Printer size={19} aria-hidden="true" />
				</button>
			</div>

			<div class="selector-bar">
				<div class="mode-picker" aria-label="Vue">
					<span>Vue</span>
					<div class="mode-bar">
						{#each modes as item}
							{@const Icon = item.icon}
							<button type="button" class:active={mode === item.id} onclick={() => selectMode(item.id)}>
								<Icon size={16} aria-hidden="true" />
								{item.label}
							</button>
						{/each}
					</div>
				</div>

				{#if mode !== 'all'}
					<label class="selector-field selector-field--entity">
						<span>{modes.find((item) => item.id === mode)?.label}</span>
						<select value={selectedId} onchange={(event) => selectCurrentEntity(event.currentTarget.value)}>
							<option value="">{modes.find((item) => item.id === mode)?.allLabel}</option>

							{#if mode === 'volunteer'}
								{#each volunteers as volunteer}
									<option value={volunteer.id}>{volunteer.name}</option>
								{/each}
							{:else if mode === 'spot'}
								{#each spots as spot}
									<option value={spot.id}>{spot.name}</option>
								{/each}
							{:else if mode === 'questType'}
								{#each questTypes as questType}
									<option value={questType.id}>{questType.name}</option>
								{/each}
							{/if}
						</select>
					</label>
				{/if}
			</div>
		</section>

		<section class="workspace">
			<section class="focus-section" aria-label="Quête actuelle ou prochaine">
				<div class="focus-section__title">
					<CalendarClock size={22} aria-hidden="true" />
					<div>
						<p class="eyebrow">{nextTask?.state === 'now' ? 'À faire maintenant' : 'À faire ensuite'}</p>
						<h2>{nextTask ? 'La quête à repérer en premier' : 'Rien de prévu'}</h2>
					</div>
				</div>

				{#if nextTask}
					<TaskCard
						task={nextTask}
						featured
						timezone={projectTimezone}
						dayStartHour={dayStartHour}
						onSelectVolunteer={(id) => selectEntity('volunteer', id)}
						onSelectSpot={(id) => selectEntity('spot', id)}
						onSelectQuestType={(id) => selectEntity('questType', id)}
					/>
				{:else}
					<div class="empty-card">
						<h3>Aucune quête dans cette vue</h3>
						<p>Change de bénévole, de lieu ou de type pour vérifier le planning.</p>
					</div>
				{/if}
			</section>

			<section class="schedule-list" aria-label="Toutes les quêtes">
				<div class="list-heading">
					<div>
						<h2>{showPast ? 'Planning complet' : 'À venir'}</h2>
						<p>{listTasks.length} quête{listTasks.length > 1 ? 's' : ''}</p>
					</div>
					<button type="button" class:active={showPast} class="history-toggle" onclick={togglePast}>
						<History size={17} aria-hidden="true" />
						{showPast ? 'Masquer le passé' : `Passé (${pastCount})`}
					</button>
				</div>

				{#if dayGroups.length > 0}
					{#each dayGroups as [day, tasks]}
						<section class="day-group" aria-label={day}>
							<header>
								<span>{day}</span>
								<span class="day-group__summary" aria-label={`${tasks.length} quêtes, ${formatDuration(dayWorkMinutes(tasks))} travaillées`}>
									{daySummary(tasks)}
								</span>
							</header>
							<div class="day-group__tasks">
								{#each tasks as task, index}
									<TaskCard
										{task}
										showDate={false}
										timezone={projectTimezone}
										dayStartHour={dayStartHour}
										onSelectVolunteer={(id) => selectEntity('volunteer', id)}
										onSelectSpot={(id) => selectEntity('spot', id)}
										onSelectQuestType={(id) => selectEntity('questType', id)}
									/>
									{#if shouldShowBreaks && index < tasks.length - 1}
										{@const minutes = breakMinutes(task, tasks[index + 1])}
										<div class:overlap={minutes < 0} class:zero={minutes === 0} class="break-time">
											<span>{breakLabel(minutes)}</span>
										</div>
									{/if}
								{/each}
							</div>
						</section>
					{/each}
				{:else}
					<div class="empty-card">
						<h3>Aucune autre quête</h3>
						<p>La carte principale contient toute l'information disponible pour cette vue.</p>
					</div>
				{/if}
			</section>

			<section id="share-panel" class="share-panel" aria-label="QR code de la vue actuelle">
				<div>
					<p class="eyebrow">Accès rapide</p>
					<h2>QR code de cette vue</h2>
					<a href={currentUrl}>{currentUrl}</a>
				</div>
				<div class="qr-box" aria-hidden={!qrSvg}>
					{#if qrSvg}
						{@html qrSvg}
					{:else}
						<QrCode size={96} aria-hidden="true" />
					{/if}
				</div>
			</section>
		</section>
	{/if}
</main>
