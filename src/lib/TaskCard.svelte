<script lang="ts">
	import {
		AlertTriangle,
		CalendarDays,
		Clock3,
		MapPin,
		Tag,
		UserRound,
		UsersRound
	} from '@lucide/svelte';
	import { describeRange, formatCompactDate, formatDay, statusLabel } from './schedule';
	import type { EnrichedTask } from './types';

	let {
		task,
		featured = false,
		showDate = true,
		timezone = 'Europe/Paris',
		onSelectVolunteer = () => {},
		onSelectSpot = () => {},
		onSelectQuestType = () => {}
	} = $props<{
		task: EnrichedTask;
		featured?: boolean;
		showDate?: boolean;
		timezone?: string;
		onSelectVolunteer?: (id: string) => void;
		onSelectSpot?: (id: string) => void;
		onSelectQuestType?: (id: string) => void;
	}>();

	const headline = $derived(
		task.state === 'now' ? 'En ce moment' : task.state === 'next' ? 'Prochaine quête' : statusLabel(task.state)
	);
</script>

<article class:featured class:past={task.state === 'past'} class:overlap={task.overlaps} class="task-card">
	<div class="task-card__header">
		<div>
			<p class="task-card__eyebrow">
				<span class="task-card__state">{featured ? headline : statusLabel(task.state)}</span>
			</p>
			<h3>{task.title}</h3>
		</div>

		<div class="task-card__corner">
			{#if showDate}
				<div class="task-card__date" title={formatDay(task.start, timezone)}>
					<CalendarDays size={18} aria-hidden="true" />
					<span>{featured ? formatDay(task.start, timezone) : formatCompactDate(task.start, timezone)}</span>
				</div>
			{/if}
			<span>
				<Clock3 size={17} aria-hidden="true" />
				{describeRange(task, timezone)}
			</span>
			{#if task.spot}
				<button type="button" class="text-link" onclick={() => onSelectSpot(task.spot!.id)}>
					<MapPin size={17} aria-hidden="true" />
					{task.spot.name}
				</button>
			{/if}
			{#if task.questType}
				<button type="button" class="text-link" onclick={() => onSelectQuestType(task.questType!.id)}>
					<Tag size={17} aria-hidden="true" />
					{task.questType.name}
				</button>
			{/if}
		</div>
	</div>

	{#if featured && (task.notes || task.mission?.description)}
		<p class="task-card__notes">{task.notes ?? task.mission?.description}</p>
	{/if}

	<div class="task-card__footer">
		<div class="task-card__people">
			<UsersRound size={18} aria-hidden="true" />
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

		{#if task.overlaps}
			<span class="task-card__warning" title="Chevauchement détecté">
				<AlertTriangle size={17} aria-hidden="true" />
				Conflit
			</span>
		{/if}
	</div>
</article>
