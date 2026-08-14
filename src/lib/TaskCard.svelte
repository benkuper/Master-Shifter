<script lang="ts">
	import {
		AlertTriangle,
		CalendarDays,
		ClipboardList,
		Clock3,
		MapPin,
		Tag,
		UserRound,
		UsersRound,
		X
	} from '@lucide/svelte';
	import { describeRange, formatCompactDate, formatDay, statusLabel } from './schedule';
	import type { EnrichedTask } from './types';

	let {
		task,
		featured = false,
		showDate = true,
		timezone = 'Europe/Paris',
		dayStartHour = 0,
		onSelectVolunteer = () => {},
		onSelectSpot = () => {},
		onSelectQuestType = () => {}
	} = $props<{
		task: EnrichedTask;
		featured?: boolean;
		showDate?: boolean;
		timezone?: string;
		dayStartHour?: number;
		onSelectVolunteer?: (id: string) => void;
		onSelectSpot?: (id: string) => void;
		onSelectQuestType?: (id: string) => void;
	}>();

	const headline = $derived(
		task.state === 'now' ? 'En ce moment' : task.state === 'next' ? 'Prochaine quête' : statusLabel(task.state)
	);
	const jobDescription = $derived(
		task.questType?.description ?? task.mission?.description ?? task.notes
	);

	let jobSheetDialog: HTMLDialogElement;

	function openJobSheet() {
		jobSheetDialog.showModal();
	}

	function closeJobSheet() {
		jobSheetDialog.close();
	}

	function closeJobSheetOnBackdrop(event: MouseEvent) {
		if (event.target === event.currentTarget) closeJobSheet();
	}
</script>

<article
	class:featured
	class:past={task.state === "past"}
	class:overlap={task.overlaps}
	class="task-card"
>
	<div class="task-card__header">
		<div class="task-card__headline">
			{#if featured}
				<p class="task-card__eyebrow">
					<span class="task-card__state"
						>{featured ? headline : statusLabel(task.state)}</span
					>
				</p>
			{/if}
			<h3>{task.title}</h3>

			<div class="task-card__people" aria-label="Équipe assignée">
				<span class="task-card__people-label">
					<UsersRound size={16} aria-hidden="true" />
					Équipe
				</span>
				{#if task.volunteers.length > 0}
					<div class="chips">
						{#each task.volunteers as volunteer}
							<button
								type="button"
								class="chip"
								title={volunteer.fullName ?? volunteer.name}
								onclick={() => onSelectVolunteer(volunteer.id)}
							>
								<UserRound size={14} aria-hidden="true" />
								{volunteer.name}
							</button>
						{/each}
					</div>
				{:else}
					<span class="muted">Personne assignée</span>
				{/if}
			</div>
		</div>

		<div class="task-card__corner">
			{#if showDate}
				<div
					class="task-card__date"
					title={formatDay(task.start, timezone, dayStartHour)}
				>
					<CalendarDays size={18} aria-hidden="true" />
					<span
						>{featured
							? formatDay(task.start, timezone, dayStartHour)
							: formatCompactDate(task.start, timezone, dayStartHour)}</span
					>
				</div>
			{/if}
			<span class="task-card__time">
				<Clock3 size={17} aria-hidden="true" />
				{describeRange(task, timezone)}
			</span>
			{#if task.spot}
				<button
					type="button"
					class="text-link task-card__spot"
					onclick={() => onSelectSpot(task.spot!.id)}
				>
					<MapPin size={17} aria-hidden="true" />
					{task.spot.name}
				</button>
			{/if}
			{#if task.questType}
				<button
					type="button"
					class="text-link task-card__quest-type"
					onclick={() => onSelectQuestType(task.questType!.id)}
				>
					<Tag size={17} aria-hidden="true" />
					{task.questType.name}
				</button>
			{/if}
			<button
				type="button"
				class="text-link task-card__job-sheet-button"
				aria-haspopup="dialog"
				onclick={openJobSheet}
			>
				<ClipboardList size={17} aria-hidden="true" />
				Fiche de poste
			</button>
		</div>
	</div>

	{#if task.overlaps}
		<div class="task-card__footer">
			<span class="task-card__warning" title="Chevauchement détecté">
				<AlertTriangle size={17} aria-hidden="true" />
				Conflit
			</span>
		</div>
	{/if}

	<dialog
		class="job-sheet-modal"
		bind:this={jobSheetDialog}
		aria-labelledby={`job-sheet-title-${task.id}`}
		onclick={closeJobSheetOnBackdrop}
	>
		<div class="job-sheet-modal__panel">
			<header class="job-sheet-modal__header">
				<div>
					<p class="job-sheet-modal__eyebrow">
						<ClipboardList size={18} aria-hidden="true" />
						Fiche de poste
					</p>
					<h2 id={`job-sheet-title-${task.id}`}>
						{task.questType?.name ?? task.mission?.type ?? task.title}
					</h2>
				</div>
				<button type="button" class="icon-button" aria-label="Fermer" onclick={closeJobSheet}>
					<X size={20} aria-hidden="true" />
				</button>
			</header>

			{#if jobDescription}
				<p class="job-sheet-modal__description">{jobDescription}</p>
			{:else}
				<p class="job-sheet-modal__empty">
					Cette fiche de poste n’est pas encore renseignée.
				</p>
			{/if}

			<footer class="job-sheet-modal__context">
				<span>Quête concernée</span>
				<strong>{task.title}</strong>
			</footer>
		</div>
	</dialog>
</article>
