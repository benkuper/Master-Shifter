import type {
	EnrichedTask,
	Mission,
	QuestType,
	ScheduleData,
	Spot,
	Task,
	TaskState,
	ViewMode,
	Volunteer
} from './types';

const collator = new Intl.Collator('fr-FR', { sensitivity: 'base' });

export function byName<T extends { name: string }>(items: T[]): T[] {
	return [...items].sort((a, b) => collator.compare(a.name, b.name));
}

export function normalizeForSearch(value = ''): string {
	return value
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.trim();
}

export function formatTime(value: string, timezone = 'Europe/Paris'): string {
	return new Intl.DateTimeFormat('fr-FR', {
		hour: '2-digit',
		minute: '2-digit',
		timeZone: timezone
	}).format(new Date(value));
}

export function formatDay(value: string, timezone = 'Europe/Paris', dayStartHour = 0): string {
	const date = shiftForDayStart(value, dayStartHour);
	const day = new Intl.DateTimeFormat('fr-FR', {
		weekday: 'long',
		day: 'numeric',
		month: 'long',
		timeZone: timezone
	}).format(date);

	return day.charAt(0).toUpperCase() + day.slice(1);
}

export function formatCompactDate(value: string, timezone = 'Europe/Paris', dayStartHour = 0): string {
	return new Intl.DateTimeFormat('fr-FR', {
		day: '2-digit',
		month: 'short',
		timeZone: timezone
	}).format(shiftForDayStart(value, dayStartHour));
}

export function describeRange(task: Task, timezone = 'Europe/Paris'): string {
	return `${formatTime(task.start, timezone)} - ${formatTime(task.end, timezone)}`;
}

export function taskState(task: Task, now = new Date()): TaskState {
	const start = new Date(task.start);
	const end = new Date(task.end);

	if (end < now) return 'past';
	if (start <= now && end >= now) return 'now';
	return 'future';
}

export function enrichTasks(data: ScheduleData, now = new Date()): EnrichedTask[] {
	const volunteerById = new Map(data.volunteers.map((volunteer) => [volunteer.id, volunteer]));
	const spotById = new Map(data.spots.map((spot) => [spot.id, spot]));
	const missionById = new Map(data.missions.map((mission) => [mission.id, mission]));
	const questTypeById = new Map((data.questTypes ?? []).map((questType) => [questType.id, questType]));

	const tasks = [...data.tasks]
		.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
		.map((task) => ({
			...task,
			state: taskState(task, now),
			volunteers: task.volunteerIds
				.map((id) => volunteerById.get(id))
				.filter((volunteer): volunteer is Volunteer => Boolean(volunteer)),
			spot: task.spotId ? spotById.get(task.spotId) : undefined,
			mission: task.missionId ? missionById.get(task.missionId) : undefined,
			questType: task.questTypeId ? questTypeById.get(task.questTypeId) : undefined,
			overlaps: false
		}));

	for (const volunteer of data.volunteers) {
		const volunteerTasks = tasks.filter((task) => task.volunteerIds.includes(volunteer.id));

		for (let index = 1; index < volunteerTasks.length; index += 1) {
			const previous = volunteerTasks[index - 1];
			const current = volunteerTasks[index];

			if (new Date(previous.end) > new Date(current.start)) {
				previous.overlaps = true;
				current.overlaps = true;
			}
		}
	}

	const nextTask = tasks.find((task) => task.state === 'future');
	if (nextTask) nextTask.state = 'next';

	return tasks;
}

export function filterTasks(
	tasks: EnrichedTask[],
	mode: ViewMode,
	selectedId: string,
	showPast: boolean
): EnrichedTask[] {
	return tasks.filter((task) => {
		const matchesPast = showPast || task.state !== 'past';

		if (!matchesPast) return false;
		if (mode === 'all' || !selectedId) return true;
		if (mode === 'volunteer') return task.volunteerIds.includes(selectedId);
		if (mode === 'spot') return task.spotId === selectedId;
		if (mode === 'questType') return task.questTypeId === selectedId;
		return true;
	});
}

export function getNextTask(tasks: EnrichedTask[]): EnrichedTask | undefined {
	return tasks.find((task) => task.state === 'now') ?? tasks.find((task) => task.state === 'next') ?? tasks.find((task) => task.state === 'future');
}

export function groupByDay(
	tasks: EnrichedTask[],
	timezone = 'Europe/Paris',
	dayStartHour = 0
): Array<[string, EnrichedTask[]]> {
	const groups = new Map<string, EnrichedTask[]>();

	for (const task of tasks) {
		const key = formatDay(task.start, timezone, dayStartHour);
		const group = groups.get(key) ?? [];
		group.push(task);
		groups.set(key, group);
	}

	return [...groups.entries()];
}

export function getContextTitle(
	mode: ViewMode,
	selectedVolunteer?: Volunteer,
	selectedSpot?: Spot,
	selectedQuestType?: QuestType
): string {
	if (mode === 'volunteer' && selectedVolunteer) return selectedVolunteer.name;
	if (mode === 'spot' && selectedSpot) return selectedSpot.name;
	if (mode === 'questType' && selectedQuestType) return selectedQuestType.name;
	if (mode === 'volunteer') return 'Tous les bénévoles';
	if (mode === 'spot') return 'Tous les lieux';
	if (mode === 'questType') return 'Tous les types';
	return 'Tous les plannings';
}

export function findByQuery<T extends { name: string; fullName?: string }>(
	items: T[],
	query: string
): T[] {
	const needle = normalizeForSearch(query);
	if (!needle) return byName(items);

	return byName(
		items.filter((item) => {
			const values = [item.name, item.fullName].filter(Boolean).join(' ');
			return normalizeForSearch(values).includes(needle);
		})
	);
}

export function statusLabel(state: TaskState): string {
	if (state === 'past') return 'Passée';
	if (state === 'now') return 'En cours';
	if (state === 'next') return 'Prochaine';
	return 'À venir';
}

export function minutesUntil(task: EnrichedTask, now = new Date()): string {
	const start = new Date(task.start);
	const end = new Date(task.end);

	if (start <= now && end >= now) return 'maintenant';

	const minutes = Math.round((start.getTime() - now.getTime()) / 60000);
	if (minutes < 0) return 'terminee';
	if (minutes < 60) return `dans ${minutes} min`;

	const hours = Math.floor(minutes / 60);
	const remaining = minutes % 60;
	if (hours < 24) return remaining ? `dans ${hours} h ${remaining}` : `dans ${hours} h`;

	const days = Math.floor(hours / 24);
	return days === 1 ? 'demain' : `dans ${days} jours`;
}

function shiftForDayStart(value: string, dayStartHour: number): Date {
	return new Date(new Date(value).getTime() - dayStartHour * 60 * 60 * 1000);
}
