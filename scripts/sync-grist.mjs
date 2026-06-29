import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
	compactObject,
	fetchRecords,
	formatPeriod,
	gristDateTime,
	loadEnv,
	ref,
	refList,
	stripHtml,
	text
} from './grist-utils.mjs';

loadEnv();

const configPath = 'grist.projects.json';
const outputRoot = 'static/data';
const config = JSON.parse(readFileSync(configPath, 'utf8'));
const apiKey = process.env.GRIST_API_KEY;
const syncedAt = new Date().toISOString();
const existingRegistry = readJsonIfExists(join(outputRoot, 'projects.json'));
const changedProjects = [];

const registry = {
	defaultProject: config.defaultProject,
	projects: []
};

for (const project of config.projects) {
	if (project.staticOnly) {
		const staticSchedule = readJsonIfExists(resolveStaticDataPath(project.dataPath));
		const existingSummary = findExistingSummary(project.slug);

		registry.projects.push({
			slug: project.slug,
			name: project.name,
			period: project.period,
			description: project.description,
			dataPath: project.dataPath,
			updatedAt: staticSchedule?.updatedAt ?? existingSummary?.updatedAt ?? syncedAt,
			accent: project.accent
		});
		continue;
	}

	if (project.enabled === false) continue;
	if (!apiKey) throw new Error(`GRIST_API_KEY is required to sync ${project.slug}`);
	if (!project.docId) throw new Error(`Missing docId for ${project.slug}`);

	const schedule = await syncProject(project, apiKey, syncedAt);
	const outputPath = join(outputRoot, project.slug, 'schedule.json');
	const existingSchedule = readJsonIfExists(outputPath);
	const hasChanged = !samePublicData(existingSchedule, schedule);

	if (!hasChanged && existingSchedule?.updatedAt) {
		schedule.updatedAt = existingSchedule.updatedAt;
	} else {
		changedProjects.push(project.slug);
	}

	mkdirSync(dirname(outputPath), { recursive: true });
	if (hasChanged || !existsSync(outputPath)) {
		writeFileSync(outputPath, `${JSON.stringify(schedule, null, '\t')}\n`);
	}

	registry.projects.push({
		slug: schedule.slug,
		name: schedule.name,
		period: schedule.period,
		description: schedule.description,
		dataPath: `data/${schedule.slug}/schedule.json`,
		updatedAt: schedule.updatedAt,
		accent: project.accent
	});
}

if (!registry.projects.some((project) => project.slug === registry.defaultProject)) {
	registry.defaultProject = registry.projects[0]?.slug ?? 'demo';
}

mkdirSync(outputRoot, { recursive: true });
writeFileSync(join(outputRoot, 'projects.json'), `${JSON.stringify(registry, null, '\t')}\n`);

console.log(`Synced ${registry.projects.length} project(s).`);
console.log(
	changedProjects.length ? `Updated data: ${changedProjects.join(', ')}.` : 'No public data changes detected.'
);

function readJsonIfExists(path) {
	if (!path || !existsSync(path)) return undefined;
	return JSON.parse(readFileSync(path, 'utf8'));
}

function resolveStaticDataPath(dataPath) {
	if (!dataPath) return '';
	return dataPath.startsWith('data/') ? join('static', dataPath) : dataPath;
}

function findExistingSummary(slug) {
	return existingRegistry?.projects?.find((project) => project.slug === slug);
}

function samePublicData(previous, next) {
	if (!previous) return false;
	return JSON.stringify(stripGeneratedFields(previous)) === JSON.stringify(stripGeneratedFields(next));
}

function stripGeneratedFields(value) {
	if (Array.isArray(value)) return value.map(stripGeneratedFields);
	if (!value || typeof value !== 'object') return value;

	return Object.fromEntries(
		Object.entries(value)
			.filter(([key]) => key !== 'updatedAt')
			.map(([key, item]) => [key, stripGeneratedFields(item)])
	);
}

async function syncProject(project, apiKey, syncedAt) {
	const apiBase = project.apiBase || 'https://docs.getgrist.com/api';
	const tables = {
		volunteers: 'Benevoles',
		spots: 'Lieux',
		questTypes: 'Types_de_quetes',
		quests: 'Quetes',
		assignments: 'Assignations',
		info: 'Infos_generales',
		...(project.tables ?? {})
	};

	const [volunteerRows, spotRows, questTypeRows, questRows, assignmentRows, infoRows] = await Promise.all([
		fetchRecords(apiBase, project.docId, apiKey, tables.volunteers),
		fetchRecords(apiBase, project.docId, apiKey, tables.spots),
		fetchRecords(apiBase, project.docId, apiKey, tables.questTypes),
		fetchRecords(apiBase, project.docId, apiKey, tables.quests),
		fetchRecords(apiBase, project.docId, apiKey, tables.assignments),
		fetchRecords(apiBase, project.docId, apiKey, tables.info).catch(() => [])
	]);

	const info = infoRows[0]?.fields ?? {};
	const timezone = text(info.timezone, project.timezone || 'Europe/Paris');
	const startIso = gristDateTime(info.start);
	const endIso = gristDateTime(info.end_);
	const spotById = new Map(spotRows.map((row) => [String(row.id), row]));
	const typeById = new Map(questTypeRows.map((row) => [String(row.id), row]));
	const questById = new Map(questRows.map((row) => [String(row.id), row]));

	const volunteers = volunteerRows.map((row) => {
		const fields = row.fields ?? {};
		const fullName = [text(fields.prenom), text(fields.nom)].filter(Boolean).join(' ');
		const name = text(fields.Display) || text(fields.pseudo) || fullName || `Benevole ${row.id}`;

		return compactObject({
			id: String(row.id),
			name,
			fullName: fullName && fullName !== name ? fullName : undefined,
			team: text(fields.Role) || text(fields.respo_)
		});
	});

	const spots = spotRows.map((row) => {
		const fields = row.fields ?? {};
		const icon = text(fields.slug);
		const name = [icon, text(fields.nom)].filter(Boolean).join(' ') || text(fields.Ref) || `Lieu ${row.id}`;

		return compactObject({
			id: String(row.id),
			name,
			area: text(fields.nom),
			details: text(fields.description)
		});
	});

	const questTypes = questTypeRows.map((row) => {
		const fields = row.fields ?? {};
		const icon = text(fields.slug);
		const rawName = text(fields.nom);
		const name = [icon, rawName].filter(Boolean).join(' ') || text(fields.Ref) || `Type ${row.id}`;

		return compactObject({
			id: String(row.id),
			name,
			shortName: rawName,
			description: text(fields.fiche_de_poste),
			spotId: ref(fields.Lieu_par_defaut)
		});
	});

	const missions = questRows.map((row) => {
		const fields = row.fields ?? {};
		const questTypeId = ref(fields.type_);
		const typeRow = typeById.get(questTypeId ?? '');
		const typeFields = typeRow?.fields ?? {};
		const spotId = ref(fields.lieu) ?? ref(typeFields.Lieu_par_defaut);
		const display = text(fields.Display) || [text(typeFields.slug), text(fields.nom)].filter(Boolean).join(' ');

		return compactObject({
			id: String(row.id),
			name: display || text(fields.nom) || `Quête ${row.id}`,
			type: text(typeFields.nom),
			description: text(typeFields.fiche_de_poste),
			spotId,
			questTypeId
		});
	});

	const tasks = assignmentRows
		.filter((row) => project.solutionId === undefined || String(row.fields?.solution) === String(project.solutionId))
		.map((row) => {
			const fields = row.fields ?? {};
			const questId = ref(fields.initial_quest);
			const quest = questById.get(questId ?? '');
			const questFields = quest?.fields ?? {};
			const questTypeId = ref(questFields.type_);
			const typeFields = typeById.get(questTypeId ?? '')?.fields ?? {};
			const spotId = ref(questFields.lieu) ?? ref(typeFields.Lieu_par_defaut);
			const title = text(questFields.Display) || text(questFields.nom) || stripHtml(fields.name) || `Assignation ${row.id}`;

			return compactObject({
				id: String(row.id),
				title,
				start: gristDateTime(fields.start),
				end: gristDateTime(fields.end_),
				volunteerIds: refList(fields.volunteers).length
					? refList(fields.volunteers)
					: refList(fields.assigned_volunteers),
				spotId,
				missionId: questId,
				questTypeId,
				status: fields.Conserver ? 'Conservée' : undefined,
				notes: text(typeFields.fiche_de_poste)
			});
		})
		.filter((task) => task.start && task.end && task.volunteerIds.length > 0);

	return {
		schemaVersion: 1,
		slug: project.slug,
		name: text(info.name, project.name),
		period: project.period || formatPeriod(startIso, endIso, timezone),
		description: project.description,
		updatedAt: syncedAt,
		timezone,
		dayStartHour: info.day_start_time,
		source: {
			type: 'grist',
			tables
		},
		volunteers,
		spots,
		questTypes,
		missions,
		tasks
	};
}
