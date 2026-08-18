import type { EnrichedTask } from './types';

export type CalendarExportOptions = {
	calendarName: string;
	projectSlug: string;
	tasks: EnrichedTask[];
	timezone?: string;
	generatedAt?: Date;
};

const encoder = new TextEncoder();

export function buildCalendarIcs({
	calendarName,
	projectSlug,
	tasks,
	timezone = 'Europe/Paris',
	generatedAt = new Date()
}: CalendarExportOptions): string {
	const lines = [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//Master Shifter//Planning//FR',
		'CALSCALE:GREGORIAN',
		'METHOD:PUBLISH',
		`X-WR-CALNAME:${escapeIcsText(calendarName)}`,
		`X-WR-TIMEZONE:${escapeIcsText(timezone)}`
	];

	for (const task of tasks) {
		const start = new Date(task.start);
		const end = new Date(task.end);
		if (!isValidDate(start) || !isValidDate(end)) continue;

		lines.push(
			'BEGIN:VEVENT',
			`UID:${makeUid(projectSlug, task.id)}`,
			`DTSTAMP:${formatUtcDate(generatedAt)}`,
			`DTSTART:${formatUtcDate(start)}`,
			`DTEND:${formatUtcDate(end)}`,
			`SUMMARY:${escapeIcsText(task.title)}`
		);

		const location = [task.spot?.name, task.spot?.area].filter(Boolean).join(' · ');
		if (location) lines.push(`LOCATION:${escapeIcsText(location)}`);

		const description = buildDescription(task);
		if (description) lines.push(`DESCRIPTION:${escapeIcsText(description)}`);

		lines.push('END:VEVENT');
	}

	lines.push('END:VCALENDAR');
	return `${lines.map(foldIcsLine).join('\r\n')}\r\n`;
}

export function calendarFilename(projectSlug: string, firstDay: string, lastDay: string): string {
	const safeSlug =
		projectSlug
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '') || 'planning';
	const range = firstDay === lastDay ? firstDay : `${firstDay}_${lastDay}`;
	return `${safeSlug}-${range}.ics`;
}

function buildDescription(task: EnrichedTask): string {
	const lines: string[] = [];
	if (task.mission?.name && task.mission.name !== task.title) {
		lines.push(`Mission : ${task.mission.name}`);
	}
	if (task.questType?.name) lines.push(`Type : ${task.questType.name}`);
	if (task.volunteers.length > 0) {
		lines.push(`Bénévoles : ${task.volunteers.map((volunteer) => volunteer.name).join(', ')}`);
	} else {
		lines.push('Bénévoles : non affectée');
	}
	if (task.notes) lines.push('', task.notes);
	else if (task.mission?.description) lines.push('', task.mission.description);
	return lines.join('\n');
}

function escapeIcsText(value: string): string {
	return value
		.replace(/\\/g, '\\\\')
		.replace(/\r\n|\r|\n/g, '\\n')
		.replace(/;/g, '\\;')
		.replace(/,/g, '\\,');
}

function formatUtcDate(date: Date): string {
	return date
		.toISOString()
		.replace(/[-:]/g, '')
		.replace(/\.\d{3}Z$/, 'Z');
}

function isValidDate(date: Date): boolean {
	return Number.isFinite(date.getTime());
}

function makeUid(projectSlug: string, taskId: string): string {
	const value = `${projectSlug}-${taskId}`
		.normalize('NFKD')
		.replace(/[^a-zA-Z0-9._-]+/g, '-')
		.replace(/^-|-$/g, '');
	return `${value || 'event'}@master-shifter.local`;
}

function foldIcsLine(line: string): string {
	const parts: string[] = [];
	let part = '';
	let limit = 75;

	for (const character of line) {
		if (encoder.encode(part + character).length > limit && part) {
			parts.push(part);
			part = character;
			limit = 74;
		} else {
			part += character;
		}
	}

	parts.push(part);
	return parts.join('\r\n ');
}
