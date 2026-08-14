<script lang="ts">
	import { base } from '$app/paths';
	import { onMount } from 'svelte';
	import {
		ArrowLeft,
		CalendarDays,
		ChevronRight,
		Clock3,
		Filter,
		MapPin,
		RefreshCw,
		RotateCcw,
		Search,
		Sparkles,
		Tag,
		UserRound,
		UsersRound
	} from '@lucide/svelte';
	import MultiSelect from './MultiSelect.svelte';
	import {
		byName,
		calendarDayKey,
		describeRange,
		enrichTasks,
		normalizeForSearch
	} from './schedule';
	import { projectTheme, themeStyle as getThemeStyle } from './theme';
	import { getPreviewSolutionId, solutionById } from './solutionPreview';
	import type { EnrichedTask, ProjectRegistry, ScheduleData, SolutionPreviewData } from './types';

	let { projectSlug = '' } = $props<{ projectSlug?: string }>();

	type AssignmentFilter = 'all' | 'assigned' | 'unassigned';
	type EventWindow = {
		weekStart: string;
		firstDay: string;
		lastDay: string;
		days: string[];
		tasks: EnrichedTask[];
	};

	let registry = $state<ProjectRegistry | null>(null);
	let project = $state<ScheduleData | null>(null);
	let status = $state<'loading' | 'ready' | 'error'>('loading');
	let errorMessage = $state('');
	let searchQuery = $state('');
	let selectedVolunteers = $state<string[]>([]);
	let selectedSpots = $state<string[]>([]);
	let selectedQuestTypes = $state<string[]>([]);
	let assignmentFilter = $state<AssignmentFilter>('all');
	let previewSolutionName = $state('');
	let publicSolutionName = $state('');

	let timezone = $derived(project?.timezone ?? 'Europe/Paris');
	let dayStartHour = $derived(normalizeDayStartHour(project?.dayStartHour));
	let allTasks = $derived(project ? enrichTasks(project) : []);
	let eventWindow = $derived(findEventWindow(allTasks, timezone, dayStartHour));
	let theme = $derived(projectTheme(project?.slug || projectSlug || 'master-shifter', registry));
	let themeStyle = $derived(getThemeStyle(theme));

	let volunteerOptions = $derived.by(() => {
		if (!project) return [];
		return byName(project.volunteers)
			.map((volunteer) => ({
				id: volunteer.id,
				label: volunteer.name,
				count: eventWindow.tasks.filter((task) => task.volunteerIds.includes(volunteer.id)).length
			}))
			.filter((option) => option.count > 0);
	});
	let spotOptions = $derived.by(() => {
		if (!project) return [];
		return byName(project.spots)
			.map((spot) => ({
				id: spot.id,
				label: spot.name,
				count: eventWindow.tasks.filter((task) => task.spotId === spot.id).length
			}))
			.filter((option) => option.count > 0);
	});
	let questTypeOptions = $derived.by(() => {
		if (!project) return [];
		return byName(project.questTypes ?? [])
			.map((questType) => ({
				id: questType.id,
				label: questType.name,
				count: eventWindow.tasks.filter((task) => task.questTypeId === questType.id).length
			}))
			.filter((option) => option.count > 0);
	});

	let filteredTasks = $derived.by(() => {
		const needle = normalizeForSearch(searchQuery);

		return eventWindow.tasks.filter((task) => {
			const matchesVolunteer =
				selectedVolunteers.length === 0 ||
				selectedVolunteers.some((id) => task.volunteerIds.includes(id));
			const matchesSpot = selectedSpots.length === 0 || selectedSpots.includes(task.spotId ?? '');
			const matchesQuestType =
				selectedQuestTypes.length === 0 || selectedQuestTypes.includes(task.questTypeId ?? '');
			const matchesAssignment =
				assignmentFilter === 'all' ||
				(assignmentFilter === 'assigned' && task.volunteerIds.length > 0) ||
				(assignmentFilter === 'unassigned' && task.volunteerIds.length === 0);
			const haystack = normalizeForSearch(
				[
					task.title,
					task.notes,
					task.mission?.name,
					task.mission?.description,
					task.spot?.name,
					task.questType?.name,
					...task.volunteers.flatMap((volunteer) => [volunteer.name, volunteer.fullName])
				]
					.filter(Boolean)
					.join(' ')
			);

			return (
				matchesVolunteer &&
				matchesSpot &&
				matchesQuestType &&
				matchesAssignment &&
				(!needle || haystack.includes(needle))
			);
		});
	});

	let tasksByDay = $derived.by(() => {
		const groups = new Map<string, EnrichedTask[]>();
		for (const task of filteredTasks) {
			const key = calendarDayKey(task.start, timezone, dayStartHour);
			const tasks = groups.get(key) ?? [];
			tasks.push(task);
			groups.set(key, tasks);
		}
		return groups;
	});
	let eventRangeLabel = $derived(formatEventRange(eventWindow.firstDay, eventWindow.lastDay));
	let activeFilterCount = $derived(
		selectedVolunteers.length +
			selectedSpots.length +
			selectedQuestTypes.length +
			(searchQuery.trim() ? 1 : 0) +
			(assignmentFilter === 'all' ? 0 : 1)
	);

	onMount(() => {
		void boot();
	});

	$effect(() => {
		if (typeof document === 'undefined') return;
		document.documentElement.style.setProperty('--accent-h', `${theme.primary}`);
		document.documentElement.style.setProperty('--accent-2-h', `${theme.secondary}`);
		document.documentElement.style.setProperty('--surface-h', `${theme.surface}`);
	});

	async function boot() {
		status = 'loading';
		errorMessage = '';

		try {
			const registryResponse = await fetch(`${base}/data/projects.json`);
			if (!registryResponse.ok) {
				throw new Error(`Impossible de charger la liste des projets (${registryResponse.status})`);
			}

			registry = (await registryResponse.json()) as ProjectRegistry;
			const slug = projectSlug || registry.defaultProject;
			const summary = registry.projects.find((item) => item.slug === slug);
			if (!summary) throw new Error(`Projet "${slug}" introuvable`);

			const projectResponse = await fetch(`${base}/${summary.dataPath}`);
			if (!projectResponse.ok) {
				throw new Error(`Impossible de charger ${summary.name} (${projectResponse.status})`);
			}

			const publicProject = (await projectResponse.json()) as ScheduleData;
			const previewId = getPreviewSolutionId(summary);
			const previewSolution = previewId ? solutionById(summary, previewId) : undefined;
			publicSolutionName = solutionById(summary, String(summary.solutionId ?? ''))?.name ?? '';

			if (previewSolution?.dataPath && previewId !== String(summary.solutionId ?? '')) {
				const previewResponse = await fetch(`${base}/${previewSolution.dataPath}`);
				if (!previewResponse.ok) {
					throw new Error(`Impossible de prévisualiser ${previewSolution.name} (${previewResponse.status})`);
				}
				const preview = (await previewResponse.json()) as SolutionPreviewData;
				project = { ...publicProject, solutionId: preview.solutionId, tasks: preview.tasks };
				previewSolutionName = previewSolution.name;
			} else {
				project = publicProject;
				previewSolutionName = '';
			}
			status = 'ready';
		} catch (error) {
			status = 'error';
			errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
		}
	}

	function findEventWindow(
		tasks: EnrichedTask[],
		projectTimezone: string,
		projectDayStartHour: number
	): EventWindow {
		const currentDay = calendarDayKey(new Date(), projectTimezone, projectDayStartHour);
		if (tasks.length === 0) {
			return {
				weekStart: startOfWeek(currentDay),
				firstDay: currentDay,
				lastDay: currentDay,
				days: [currentDay],
				tasks: []
			};
		}

		const weeks = new Map<string, EnrichedTask[]>();
		for (const task of tasks) {
			const day = calendarDayKey(task.start, projectTimezone, projectDayStartHour);
			const weekStart = startOfWeek(day);
			const weekTasks = weeks.get(weekStart) ?? [];
			weekTasks.push(task);
			weeks.set(weekStart, weekTasks);
		}

		const [weekStart, weekTasks] = [...weeks.entries()].sort(
			([weekA, tasksA], [weekB, tasksB]) => tasksB.length - tasksA.length || weekB.localeCompare(weekA)
		)[0];
		const taskDays = weekTasks
			.map((task) => calendarDayKey(task.start, projectTimezone, projectDayStartHour))
			.sort();
		const firstDay = taskDays[0];
		const lastDay = taskDays.at(-1) ?? firstDay;

		return {
			weekStart,
			firstDay,
			lastDay,
			days: dayRange(firstDay, lastDay),
			tasks: weekTasks
		};
	}

	function startOfWeek(key: string) {
		const date = dateFromKey(key);
		const mondayOffset = (date.getUTCDay() + 6) % 7;
		date.setUTCDate(date.getUTCDate() - mondayOffset);
		return utcDayKey(date);
	}

	function dayRange(firstDay: string, lastDay: string) {
		const days: string[] = [];
		const current = dateFromKey(firstDay);
		const last = dateFromKey(lastDay);

		while (current <= last) {
			days.push(utcDayKey(current));
			current.setUTCDate(current.getUTCDate() + 1);
		}
		return days;
	}

	function dateFromKey(key: string) {
		const [year, month, day] = key.split('-').map(Number);
		return new Date(Date.UTC(year, month - 1, day));
	}

	function utcDayKey(date: Date) {
		return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(
			date.getUTCDate()
		).padStart(2, '0')}`;
	}

	function formatEventRange(firstDay: string, lastDay: string) {
		if (!firstDay || !lastDay) return '';
		const first = formatBoundary(firstDay);
		const last = formatBoundary(lastDay);
		return firstDay === lastDay ? first : `${first} → ${last}`;
	}

	function formatBoundary(key: string) {
		const label = new Intl.DateTimeFormat('fr-FR', {
			weekday: 'long',
			day: 'numeric',
			month: 'long',
			year: 'numeric',
			timeZone: 'UTC'
		}).format(dateFromKey(key));
		return label.charAt(0).toUpperCase() + label.slice(1);
	}

	function formatDayName(key: string) {
		const label = new Intl.DateTimeFormat('fr-FR', {
			weekday: 'long',
			timeZone: 'UTC'
		}).format(dateFromKey(key));
		return label.charAt(0).toUpperCase() + label.slice(1);
	}

	function formatDayDate(key: string) {
		return new Intl.DateTimeFormat('fr-FR', {
			day: 'numeric',
			month: 'short',
			timeZone: 'UTC'
		}).format(dateFromKey(key));
	}

	function resetFilters() {
		searchQuery = '';
		selectedVolunteers = [];
		selectedSpots = [];
		selectedQuestTypes = [];
		assignmentFilter = 'all';
	}

	function normalizeDayStartHour(value: number | undefined) {
		const hour = Number(value ?? 0);
		return Number.isFinite(hour) ? hour : 0;
	}

	function taskTone(task: EnrichedTask) {
		const seed = task.questTypeId || task.spotId || task.id;
		let hash = 0;
		for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) % 360;
		return `--event-h:${hash};`;
	}
</script>

<svelte:head>
	<title>{project ? `Calendrier · ${project.name}` : 'Calendrier · Master Shifter'}</title>
	<meta
		name="description"
		content="Vue calendrier filtrable des quêtes, bénévoles, lieux et types de quêtes."
	/>
</svelte:head>

<main class="app-shell calendar-page" style={themeStyle}>
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
			<h1>Chargement du calendrier</h1>
			<p>Préparation des quêtes et des filtres.</p>
		</section>
	{:else}
		<header class="calendar-header">
			<a class="back-link" href={`${base}/${project.slug}`.replace(/\/+/g, '/')}>
				<ArrowLeft size={18} aria-hidden="true" />
				Planning
			</a>

			<div class="calendar-title">
				<div class="calendar-title__icon"><CalendarDays size={24} aria-hidden="true" /></div>
				<div>
					<p class="eyebrow">Master Shifter · {project.name}</p>
					<h1>Calendrier des quêtes</h1>
					<p>{eventRangeLabel}</p>
				</div>
			</div>

			<div class="calendar-header__stats">
				<strong>{filteredTasks.length}</strong>
				<span>sur {eventWindow.tasks.length} quête{eventWindow.tasks.length > 1 ? 's' : ''}</span>
			</div>
		</header>

		{#if previewSolutionName}
			<p class="preview-notice calendar-preview-notice">
				Previewing {previewSolutionName} (public solution: {publicSolutionName}).
			</p>
		{/if}

		<section class="filter-panel" aria-label="Filtres du calendrier">
			<div class="filter-panel__heading">
				<div>
					<Filter size={18} aria-hidden="true" />
					<strong>Filtrer les quêtes</strong>
					{#if activeFilterCount > 0}
						<span>{activeFilterCount} actif{activeFilterCount > 1 ? 's' : ''}</span>
					{/if}
				</div>
				{#if activeFilterCount > 0}
					<button type="button" onclick={resetFilters}>
						<RotateCcw size={15} aria-hidden="true" />
						Tout effacer
					</button>
				{/if}
			</div>

			<div class="filter-grid">
				<label class="search-field">
					<span>Recherche</span>
					<div>
						<Search size={17} aria-hidden="true" />
						<input bind:value={searchQuery} placeholder="Nom, mission, note…" />
					</div>
				</label>

				<MultiSelect
					label="Bénévoles"
					options={volunteerOptions}
					selected={selectedVolunteers}
					onchange={(value) => (selectedVolunteers = value)}
				/>
				<MultiSelect
					label="Lieux"
					options={spotOptions}
					selected={selectedSpots}
					onchange={(value) => (selectedSpots = value)}
				/>
				<MultiSelect
					label="Types de quête"
					options={questTypeOptions}
					selected={selectedQuestTypes}
					onchange={(value) => (selectedQuestTypes = value)}
				/>

				<label class="assignment-field">
					<span>Affectation</span>
					<select bind:value={assignmentFilter}>
						<option value="all">Toutes les quêtes</option>
						<option value="assigned">Avec bénévole</option>
						<option value="unassigned">Sans bénévole</option>
					</select>
				</label>
			</div>
		</section>

		<section class="week-card" aria-label={`Quêtes du ${eventRangeLabel}`}>
			<header class="week-heading">
				<div>
					<p class="eyebrow">Semaine de l’événement</p>
					<h2>{eventRangeLabel}</h2>
				</div>
				<span>{filteredTasks.length} quête{filteredTasks.length > 1 ? 's' : ''} affichée{filteredTasks.length > 1 ? 's' : ''}</span>
			</header>
			<p class="week-scroll-hint">
				Balayez pour changer de jour
				<ChevronRight size={16} aria-hidden="true" />
			</p>

			<div
				class="week-grid"
				role="region"
				aria-label="Calendrier par jour, défilement horizontal"
				style={`--day-count:${Math.max(1, eventWindow.days.length)};`}
			>
				{#each eventWindow.days as day (day)}
					{@const dayTasks = tasksByDay.get(day) ?? []}
					<section class="week-day" aria-label={`${formatDayName(day)}, ${dayTasks.length} quêtes`}>
						<header>
							<div>
								<strong>{formatDayName(day)}</strong>
								<span>{formatDayDate(day)}</span>
							</div>
							<small>{dayTasks.length}</small>
						</header>

						<div class="day-task-list">
							{#each dayTasks as task (task.id)}
								<article class:overlap={task.overlaps} class="calendar-task" style={taskTone(task)}>
									<div class="calendar-task__time">
										<Clock3 size={14} aria-hidden="true" />
										{describeRange(task, timezone)}
									</div>
									<h3>{task.title}</h3>

									<div class="calendar-task__meta">
										{#if task.spot}
											<span><MapPin size={13} aria-hidden="true" />{task.spot.name}</span>
										{/if}
										{#if task.questType}
											<span><Tag size={13} aria-hidden="true" />{task.questType.name}</span>
										{/if}
									</div>

									<div class="calendar-task__people">
										{#if task.volunteers.length > 0}
											{#each task.volunteers as volunteer}
												<span title={volunteer.fullName ?? volunteer.name}>
													<UserRound size={12} aria-hidden="true" />
													{volunteer.name}
												</span>
											{/each}
										{:else}
											<span class="unassigned">
												<UsersRound size={13} aria-hidden="true" />
												Non affectée
											</span>
										{/if}
									</div>

									{#if task.notes || task.mission?.description}
										<p>{task.notes ?? task.mission?.description}</p>
									{/if}
								</article>
							{:else}
								<div class="day-empty">
									<CalendarDays size={22} aria-hidden="true" />
									<span>Aucune quête avec ces filtres</span>
								</div>
							{/each}
						</div>
					</section>
				{/each}
			</div>
		</section>

		{#if filteredTasks.length === 0}
			<section class="no-results">
				<Search size={28} aria-hidden="true" />
				<div>
					<h2>Aucune quête ne correspond</h2>
					<p>Essaie de retirer un filtre ou de modifier la recherche.</p>
				</div>
				<button type="button" class="primary-action" onclick={resetFilters}>Réinitialiser les filtres</button>
			</section>
		{/if}
	{/if}
</main>

<style>
	.calendar-page {
		display: grid;
		align-content: start;
		gap: 14px;
	}

	.calendar-header,
	.filter-panel,
	.week-card,
	.no-results {
		width: min(100%, 1540px);
		margin: 0 auto;
		border: 1px solid var(--line);
		border-radius: 10px;
		background: var(--panel);
		box-shadow: var(--shadow);
		backdrop-filter: blur(22px) saturate(1.2);
	}

	.calendar-header {
		position: relative;
		z-index: 60;
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		align-items: center;
		gap: 18px;
		padding: 15px 17px;
		border-color: var(--line-strong);
		background:
			linear-gradient(90deg, hsl(var(--accent-h) 82% 63% / 0.18), transparent 62%),
			hsl(var(--surface-h) 28% 9% / 0.92);
	}

	.back-link {
		display: inline-flex;
		min-height: 42px;
		align-items: center;
		gap: 7px;
		padding: 0 11px;
		border-radius: 8px;
		background: rgba(255, 255, 255, 0.08);
		color: var(--text);
		font-size: 0.86rem;
		font-weight: 800;
		text-decoration: none;
	}

	.calendar-title {
		display: flex;
		min-width: 0;
		align-items: center;
		gap: 12px;
	}

	.calendar-title__icon {
		display: grid;
		width: 46px;
		height: 46px;
		flex: 0 0 auto;
		place-items: center;
		border: 1px solid var(--accent-border);
		border-radius: 10px;
		background: var(--accent-wash);
		color: var(--accent-strong);
	}

	.calendar-title h1,
	.week-heading h2,
	.calendar-task h3,
	.no-results h2 {
		margin: 0;
		line-height: 1.1;
	}

	.calendar-title h1 {
		font-size: clamp(1.35rem, 2.7vw, 2.3rem);
	}

	.calendar-title p:last-child {
		margin: 4px 0 0;
		color: var(--muted);
		font-size: 0.85rem;
	}

	.calendar-header__stats {
		display: grid;
		min-width: 100px;
		text-align: right;
	}

	.calendar-header__stats strong {
		color: var(--accent-strong);
		font-size: 1.45rem;
	}

	.calendar-header__stats span {
		color: var(--muted);
		font-size: 0.75rem;
	}

	.filter-panel {
		position: relative;
		z-index: 50;
		display: grid;
		gap: 11px;
		overflow: visible;
		padding: 13px;
	}

	.filter-panel__heading,
	.filter-panel__heading > div {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.filter-panel__heading {
		justify-content: space-between;
	}

	.filter-panel__heading > div {
		color: var(--accent-strong);
	}

	.filter-panel__heading span {
		padding: 3px 7px;
		border-radius: 999px;
		background: var(--accent-wash);
		font-size: 0.68rem;
		font-weight: 850;
	}

	.filter-panel__heading button,
	.no-results button {
		display: inline-flex;
		min-height: 34px;
		align-items: center;
		justify-content: center;
		gap: 6px;
		padding: 0 9px;
		border: 0;
		border-radius: 7px;
		background: rgba(255, 255, 255, 0.08);
		color: var(--text);
		cursor: pointer;
		font-size: 0.78rem;
		font-weight: 800;
	}

	.filter-grid {
		display: grid;
		grid-template-columns: minmax(220px, 1.4fr) repeat(3, minmax(150px, 1fr)) minmax(160px, 0.8fr);
		gap: 8px;
	}

	.search-field,
	.assignment-field {
		display: grid;
		gap: 4px;
		color: var(--muted);
		font-size: 0.68rem;
		font-weight: 800;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.search-field > div {
		display: flex;
		min-height: 54px;
		align-items: center;
		gap: 8px;
		padding: 0 11px;
		border: 1px solid var(--line);
		border-radius: 8px;
		background: hsl(var(--surface-h) 20% 18% / 0.92);
	}

	.search-field:focus-within > div {
		border-color: var(--accent-border);
		box-shadow: 0 0 0 3px var(--accent-wash);
	}

	.search-field input {
		width: 100%;
		border: 0;
		outline: 0;
		background: transparent;
		color: var(--text);
		font-size: 0.88rem;
	}

	.search-field input::placeholder {
		color: var(--muted);
	}

	.assignment-field select {
		min-height: 54px;
		padding: 0 10px;
		border: 1px solid var(--line);
		border-radius: 8px;
		outline: 0;
		background: hsl(var(--surface-h) 20% 18% / 0.92);
		color: var(--text);
		font-size: 0.84rem;
		font-weight: 700;
		text-transform: none;
	}

	.week-card {
		position: relative;
		z-index: 1;
		overflow: hidden;
	}

	.week-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 13px 15px;
		border-bottom: 1px solid var(--line);
		background:
			linear-gradient(100deg, var(--accent-wash), transparent 55%),
			rgba(255, 255, 255, 0.025);
	}

	.week-heading h2 {
		font-size: 1.1rem;
	}

	.week-heading > span {
		color: var(--muted);
		font-size: 0.76rem;
		font-weight: 750;
	}

	.week-grid {
		display: grid;
		width: 100%;
		min-width: 0;
		grid-template-columns: repeat(var(--day-count), minmax(230px, 1fr));
		align-items: stretch;
		overflow-x: auto;
		overscroll-behavior-inline: contain;
		scrollbar-color: var(--accent-border) transparent;
		scrollbar-width: thin;
		-webkit-overflow-scrolling: touch;
	}

	.week-grid::-webkit-scrollbar {
		height: 6px;
	}

	.week-grid::-webkit-scrollbar-thumb {
		border-radius: 999px;
		background: var(--accent-border);
	}

	.week-scroll-hint {
		display: none;
	}

	.week-day {
		display: grid;
		min-width: 0;
		grid-template-rows: auto 1fr;
		border-right: 1px solid var(--line);
		background: rgba(255, 255, 255, 0.012);
	}

	.week-day:last-child {
		border-right: 0;
	}

	.week-day > header {
		position: sticky;
		top: 0;
		z-index: 2;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		min-height: 59px;
		padding: 9px 11px;
		border-bottom: 1px solid var(--line);
		background: hsl(var(--surface-h) 25% 11% / 0.96);
		backdrop-filter: blur(16px);
	}

	.week-day > header > div {
		display: grid;
		gap: 2px;
	}

	.week-day > header strong {
		font-size: 0.9rem;
	}

	.week-day > header span {
		color: var(--muted);
		font-size: 0.72rem;
		font-weight: 750;
	}

	.week-day > header small {
		display: grid;
		min-width: 27px;
		height: 27px;
		place-items: center;
		border-radius: 999px;
		background: var(--accent-wash);
		color: var(--accent-strong);
		font-size: 0.69rem;
		font-weight: 900;
	}

	.day-task-list {
		display: grid;
		align-content: start;
		gap: 7px;
		padding: 8px;
	}

	.calendar-task {
		position: relative;
		display: grid;
		gap: 7px;
		padding: 10px;
		overflow: hidden;
		border: 1px solid hsl(var(--event-h) 70% 65% / 0.3);
		border-radius: 8px;
		background:
			linear-gradient(125deg, hsl(var(--event-h) 70% 50% / 0.15), transparent 62%),
			hsl(var(--surface-h) 20% 15% / 0.78);
		box-shadow: 0 10px 24px rgba(0, 0, 0, 0.12);
	}

	.calendar-task::before {
		position: absolute;
		inset: 0 auto 0 0;
		width: 3px;
		background: hsl(var(--event-h) 74% 64%);
		content: '';
	}

	.calendar-task.overlap {
		border-color: rgba(255, 107, 107, 0.62);
	}

	.calendar-task__time {
		display: flex;
		align-items: center;
		gap: 5px;
		color: hsl(var(--event-h) 76% 80%);
		font-size: 0.7rem;
		font-weight: 850;
	}

	.calendar-task h3 {
		font-size: 0.92rem;
	}

	.calendar-task__meta,
	.calendar-task__people {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}

	.calendar-task__meta span,
	.calendar-task__people span {
		display: inline-flex;
		min-width: 0;
		align-items: center;
		gap: 4px;
		padding: 4px 6px;
		border-radius: 6px;
		background: rgba(255, 255, 255, 0.07);
		color: var(--muted);
		font-size: 0.63rem;
		font-weight: 700;
	}

	.calendar-task__people span {
		border-radius: 999px;
		background: var(--accent-wash);
		color: var(--text);
	}

	.calendar-task__people span.unassigned {
		background: rgba(244, 199, 109, 0.12);
		color: var(--amber);
	}

	.calendar-task p {
		margin: 0;
		color: var(--muted);
		font-size: 0.71rem;
		line-height: 1.38;
	}

	.day-empty {
		display: grid;
		min-height: 140px;
		place-items: center;
		align-content: center;
		gap: 7px;
		padding: 12px;
		color: var(--muted);
		font-size: 0.74rem;
		text-align: center;
	}

	.no-results {
		position: relative;
		z-index: 1;
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 16px;
		color: var(--muted);
	}

	.no-results div {
		flex: 1;
	}

	.no-results h2 {
		color: var(--text);
		font-size: 1rem;
	}

	.no-results p {
		margin: 4px 0 0;
		font-size: 0.8rem;
	}

	.no-results .primary-action {
		background: linear-gradient(135deg, var(--accent), var(--accent-2));
		color: var(--ink);
	}

	@media (max-width: 1100px) {
		.filter-grid {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}

		.search-field {
			grid-column: span 2;
		}

	}

	@media (max-width: 680px) {
		.calendar-page {
			padding: 9px;
		}

		.calendar-header {
			grid-template-columns: auto minmax(0, 1fr);
			gap: 10px;
			padding: 12px;
		}

		.back-link {
			width: 42px;
			padding: 0;
			justify-content: center;
			font-size: 0;
		}

		.calendar-title__icon {
			display: none;
		}

		.calendar-header__stats {
			grid-column: 2;
			min-width: 0;
			text-align: left;
		}

		.filter-grid {
			grid-template-columns: 1fr 1fr;
		}

		.search-field,
		.assignment-field {
			grid-column: 1 / -1;
		}

		.week-heading {
			align-items: flex-start;
			flex-direction: column;
		}

		.week-scroll-hint {
			display: flex;
			align-items: center;
			justify-content: flex-end;
			gap: 4px;
			margin: 0;
			padding: 7px 11px;
			border-bottom: 1px solid var(--line);
			background: var(--accent-wash);
			color: var(--accent-strong);
			font-size: 0.72rem;
			font-weight: 800;
		}

		.week-grid {
			grid-template-columns: repeat(var(--day-count), minmax(82vw, 82vw));
			scroll-padding-inline: 8px;
			scroll-snap-type: inline mandatory;
			touch-action: pan-x pan-y;
		}

		.week-day {
			scroll-snap-align: start;
			scroll-snap-stop: normal;
		}

		.no-results {
			align-items: stretch;
			flex-direction: column;
			text-align: center;
		}
	}
</style>
