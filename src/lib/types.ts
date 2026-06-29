export type ViewMode = 'volunteer' | 'spot' | 'questType' | 'all';

export type ProjectSummary = {
	slug: string;
	name: string;
	period?: string;
	description?: string;
	dataPath: string;
	updatedAt?: string;
	accent?: string;
};

export type ProjectRegistry = {
	defaultProject: string;
	projects: ProjectSummary[];
};

export type Volunteer = {
	id: string;
	name: string;
	fullName?: string;
	phone?: string;
	email?: string;
	team?: string;
	tags?: string[];
};

export type Spot = {
	id: string;
	name: string;
	area?: string;
	details?: string;
};

export type Mission = {
	id: string;
	name: string;
	type?: string;
	description?: string;
	spotId?: string;
	questTypeId?: string;
};

export type QuestType = {
	id: string;
	name: string;
	shortName?: string;
	description?: string;
	spotId?: string;
};

export type Task = {
	id: string;
	title: string;
	start: string;
	end: string;
	volunteerIds: string[];
	spotId?: string;
	missionId?: string;
	questTypeId?: string;
	status?: string;
	notes?: string;
	priority?: 'low' | 'normal' | 'high';
	color?: string;
};

export type ScheduleData = {
	schemaVersion: 1;
	slug: string;
	name: string;
	period?: string;
	description?: string;
	updatedAt: string;
	timezone?: string;
	dayStartHour?: number;
	source?: {
		type: 'demo' | 'grist';
		docId?: string;
		tables?: Record<string, string>;
	};
	volunteers: Volunteer[];
	spots: Spot[];
	questTypes: QuestType[];
	missions: Mission[];
	tasks: Task[];
};

export type TaskState = 'past' | 'now' | 'next' | 'future';

export type EnrichedTask = Task & {
	state: TaskState;
	volunteers: Volunteer[];
	spot?: Spot;
	mission?: Mission;
	questType?: QuestType;
	overlaps: boolean;
};
