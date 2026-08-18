<script lang="ts">
	import { CalendarPlus, ChevronDown, Download, ExternalLink } from '@lucide/svelte';
	import { onDestroy } from 'svelte';
	import { buildCalendarIcs, calendarFilename } from './calendarExport';
	import { calendarDayKey } from './schedule';
	import type { EnrichedTask } from './types';

	let {
		projectName,
		projectSlug,
		tasks,
		timezone = 'Europe/Paris',
		dayStartHour = 0,
		compact = false
	} = $props<{
		projectName: string;
		projectSlug: string;
		tasks: EnrichedTask[];
		timezone?: string;
		dayStartHour?: number;
		compact?: boolean;
	}>();

	let menu: HTMLDetailsElement | undefined = $state();
	let feedback = $state('');
	let feedbackTimer: ReturnType<typeof setTimeout> | undefined;

	onDestroy(() => {
		if (feedbackTimer) clearTimeout(feedbackTimer);
	});

	function downloadCurrentCalendar(showFeedback = true) {
		if (tasks.length === 0) return;

		const contents = buildCalendarIcs({
			calendarName: `${projectName} · Master Shifter`,
			projectSlug,
			tasks,
			timezone
		});
		const days = tasks
			.map((task: EnrichedTask) => calendarDayKey(task.start, timezone, dayStartHour))
			.sort((a: string, b: string) => a.localeCompare(b));
		const filename = calendarFilename(projectSlug, days[0], days.at(-1) ?? days[0]);
		const url = URL.createObjectURL(new Blob([contents], { type: 'text/calendar;charset=utf-8' }));
		const link = document.createElement('a');
		link.href = url;
		link.download = filename;
		document.body.appendChild(link);
		link.click();
		link.remove();
		setTimeout(() => URL.revokeObjectURL(url), 0);
		menu?.removeAttribute('open');

		if (showFeedback) {
			const plural = tasks.length > 1;
			showFeedbackMessage(
				`${tasks.length} quête${plural ? 's' : ''} exportée${plural ? 's' : ''} dans ${filename}`
			);
		}
	}

	function exportToGoogleCalendar() {
		if (tasks.length === 0) return;
		const googleCalendar = window.open(
			'https://calendar.google.com/calendar/u/0/r/settings/export',
			'_blank'
		);
		if (googleCalendar) googleCalendar.opener = null;
		downloadCurrentCalendar(false);
		showFeedbackMessage(
			googleCalendar
				? 'Fichier téléchargé · sélectionnez-le dans l’import Google Agenda.'
				: 'Fichier téléchargé · autorisez les pop-ups pour ouvrir Google Agenda.'
		);
	}

	function showFeedbackMessage(message: string) {
		feedback = message;
		if (feedbackTimer) clearTimeout(feedbackTimer);
		feedbackTimer = setTimeout(() => (feedback = ''), 6000);
	}
</script>

<details class:compact class="export-menu" bind:this={menu}>
	<summary title={compact ? 'Exporter la vue calendrier' : undefined} aria-label="Exporter la vue calendrier">
		<CalendarPlus size={compact ? 18 : 17} aria-hidden="true" />
		<span class="export-menu__label">Exporter</span>
		<span class="export-menu__chevron"><ChevronDown size={15} aria-hidden="true" /></span>
	</summary>
	<div class="export-menu__panel">
		<div class="export-menu__heading">
			<strong>Exporter la vue en cours</strong>
			<span>{tasks.length} quête{tasks.length > 1 ? 's' : ''} avec les filtres actifs</span>
		</div>
		<button type="button" disabled={tasks.length === 0} onclick={() => downloadCurrentCalendar()}>
			<Download size={18} aria-hidden="true" />
			<span><strong>Fichier .ics</strong><small>Apple Calendrier, Outlook, Thunderbird…</small></span>
		</button>
		<button type="button" disabled={tasks.length === 0} onclick={exportToGoogleCalendar}>
			<ExternalLink size={18} aria-hidden="true" />
			<span><strong>Google Agenda</strong><small>Télécharge le fichier puis ouvre l’import</small></span>
		</button>
	</div>
</details>

{#if feedback}
	<p class="export-feedback" role="status">{feedback}</p>
{/if}

<style>
	.export-menu {
		position: relative;
	}

	.export-menu summary {
		display: inline-flex;
		min-height: 42px;
		align-items: center;
		gap: 7px;
		padding: 0 11px;
		border: 1px solid var(--accent-border);
		border-radius: 8px;
		background: var(--accent-wash);
		color: var(--accent-strong);
		cursor: pointer;
		font-size: 0.82rem;
		font-weight: 850;
		list-style: none;
		user-select: none;
	}

	.export-menu summary::-webkit-details-marker {
		display: none;
	}

	.export-menu summary:focus-visible {
		outline: 2px solid var(--accent-strong);
		outline-offset: 2px;
	}

	.export-menu.compact summary {
		width: 42px;
		justify-content: center;
		padding: 0;
		border-color: var(--line);
		background: rgba(255, 255, 255, 0.08);
		color: var(--text);
	}

	.export-menu.compact .export-menu__label,
	.export-menu.compact .export-menu__chevron {
		display: none;
	}

	.export-menu__chevron {
		display: inline-flex;
		transition: transform 160ms ease;
	}

	.export-menu[open] .export-menu__chevron {
		transform: rotate(180deg);
	}

	.export-menu__panel {
		position: absolute;
		top: calc(100% + 8px);
		right: 0;
		z-index: 100;
		display: grid;
		width: min(340px, calc(100vw - 30px));
		padding: 7px;
		border: 1px solid var(--line-strong);
		border-radius: 10px;
		background: hsl(var(--surface-h) 25% 11% / 0.98);
		box-shadow: 0 18px 48px rgba(0, 0, 0, 0.38);
		backdrop-filter: blur(20px);
	}

	.export-menu__heading {
		display: grid;
		gap: 3px;
		padding: 7px 8px 9px;
		text-align: left;
	}

	.export-menu__heading strong {
		font-size: 0.82rem;
	}

	.export-menu__heading span {
		color: var(--muted);
		font-size: 0.7rem;
	}

	.export-menu__panel button {
		display: flex;
		width: 100%;
		align-items: center;
		gap: 10px;
		padding: 10px;
		border: 0;
		border-radius: 7px;
		background: transparent;
		color: var(--text);
		cursor: pointer;
		text-align: left;
	}

	.export-menu__panel button:hover:not(:disabled),
	.export-menu__panel button:focus-visible {
		background: var(--accent-wash);
		outline: 0;
	}

	.export-menu__panel button:disabled {
		cursor: not-allowed;
		opacity: 0.45;
	}

	.export-menu__panel button > :global(svg) {
		flex: 0 0 auto;
		color: var(--accent-strong);
	}

	.export-menu__panel button > span {
		display: grid;
		gap: 2px;
	}

	.export-menu__panel button strong {
		font-size: 0.8rem;
	}

	.export-menu__panel button small {
		color: var(--muted);
		font-size: 0.67rem;
	}

	.export-feedback {
		position: fixed;
		right: 16px;
		bottom: 16px;
		z-index: 1000;
		max-width: min(420px, calc(100vw - 32px));
		margin: 0;
		padding: 10px 13px;
		border: 1px solid var(--accent-border);
		border-radius: 8px;
		background: hsl(var(--surface-h) 25% 11% / 0.98);
		box-shadow: 0 14px 38px rgba(0, 0, 0, 0.34);
		color: var(--accent-strong);
		font-size: 0.76rem;
		font-weight: 800;
	}
</style>
