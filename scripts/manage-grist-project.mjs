import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { fetchColumns, fetchRecords, getArg, gristFetch, loadEnv, ref, text } from './grist-utils.mjs';

loadEnv();

const configPath = 'grist.projects.json';
const outputRoot = resolve('static/data');
const action = getArg('--action', process.env.PROJECT_ACTION || '').toLowerCase();
const rawDocId = getArg('--doc', process.env.GRIST_DOC_ID || '');
const targetSlug = getArg('--project', process.env.GRIST_PROJECT || '');
const apiBase = getArg('--api', process.env.GRIST_API_BASE || 'https://docs.getgrist.com/api');
const apiKey = process.env.GRIST_API_KEY;
const docId = rawDocId ? normalizeDocId(rawDocId) : '';
const config = JSON.parse(readFileSync(configPath, 'utf8'));

if (!['add', 'remove'].includes(action)) {
	throw new Error('Use --action add or --action remove.');
}

if (action === 'add' && !docId) {
	throw new Error('Missing Grist document ID. Use --doc <document-id>.');
}

if (action === 'remove' && !docId && !targetSlug) {
	throw new Error('Missing project. Use --doc <document-id> or --project <slug>.');
}

if (action === 'add') await addProject();
else removeProject();

writeFileSync(configPath, `${JSON.stringify(config, null, '\t')}\n`);

async function addProject() {
	if (!apiKey) throw new Error('GRIST_API_KEY is required to add a project.');

	const duplicate = config.projects.find((project) => project.docId === docId);
	if (duplicate) {
		console.log(`Document ${docId} is already configured as "${duplicate.slug}".`);
		return;
	}

	const [{ tables }, document] = await Promise.all([
		gristFetch(apiBase, docId, apiKey, '/tables'),
		gristFetch(apiBase, docId, apiKey, '').catch(() => ({}))
	]);
	const detectedTables = detectTables(tables ?? []);
	const infoRows = detectedTables.info
		? await fetchRecords(apiBase, docId, apiKey, detectedTables.info).catch(() => [])
		: [];
	const info = infoRows[0]?.fields ?? {};
	const documentName = text(document?.name) || text(document?.doc?.name);
	const name = text(info.name) || documentName || `Projet ${docId.slice(0, 8)}`;
	const slug = uniqueSlug(text(info.slug) || name);
	const solutionId = await detectSolutionId(detectedTables.assignments, info);

	config.projects.push({
		slug,
		name,
		enabled: true,
		docId,
		apiBase,
		...(solutionId === undefined ? {} : { solutionId }),
		description: text(info.description) || 'Planning synchronise depuis Grist.',
		tables: detectedTables
	});

	if (!config.defaultProject || !config.projects.some((project) => project.slug === config.defaultProject)) {
		config.defaultProject = slug;
	}

	console.log(`Added ${name} (${slug}) from Grist document ${docId}.`);
	if (solutionId !== undefined) console.log(`Detected solution ${solutionId}.`);
}

function removeProject() {
	const index = config.projects.findIndex((project) =>
		docId ? project.docId === docId : project.slug === targetSlug
	);
	if (index === -1) {
		const target = docId ? `Grist document ${docId}` : `slug ${targetSlug}`;
		console.log(`No configured project uses ${target}; it is already absent.`);
		return;
	}

	const [removed] = config.projects.splice(index, 1);
	if (config.defaultProject === removed.slug) {
		config.defaultProject = config.projects[0]?.slug ?? 'demo';
	}

	const dataDirectory = resolve(outputRoot, removed.slug);
	if (!dataDirectory.startsWith(`${outputRoot}${sep}`)) {
		throw new Error(`Refusing to remove unsafe project path: ${dataDirectory}`);
	}
	if (existsSync(dataDirectory)) rmSync(dataDirectory, { recursive: true });

	console.log(`Removed ${removed.name} (${removed.slug}) and its generated data.`);
}

function detectTables(tables) {
	const expected = {
		spots: 'Lieux',
		questTypes: 'Types_de_quetes',
		quests: 'Quetes',
		volunteers: 'Benevoles',
		assignments: 'Assignations',
		info: 'Infos_generales'
	};
	const byNormalizedId = new Map(tables.map((table) => [normalizeName(table.id), table.id]));
	const detected = Object.fromEntries(
		Object.entries(expected)
			.map(([role, expectedId]) => [role, byNormalizedId.get(normalizeName(expectedId))])
			.filter(([, tableId]) => tableId)
	);
	const missing = Object.keys(expected).filter((role) => role !== 'info' && !detected[role]);

	if (missing.length) {
		const available = tables.map((table) => table.id).join(', ');
		throw new Error(
			`The document is not a compatible Master Shifter document. Missing table(s): ${missing.join(', ')}. ` +
				`Available tables: ${available || 'none'}.`
		);
	}

	return detected;
}

async function detectSolutionId(assignmentsTable, info) {
	const configured = ref(info.solution) ?? ref(info.solution_id) ?? ref(info.active_solution);
	if (configured) return numericOrText(configured);

	const columns = await fetchColumns(apiBase, docId, apiKey, assignmentsTable);
	if (!columns.some((column) => normalizeName(column.id) === 'solution')) return undefined;

	const rows = await fetchRecords(apiBase, docId, apiKey, assignmentsTable);
	const solutions = [
		...new Set(rows.map((row) => ref(row.fields?.solution)).filter((value) => value !== undefined))
	];
	if (!solutions.length) return undefined;

	return solutions.map(numericOrText).sort(compareSolutions).at(-1);
}

function compareSolutions(left, right) {
	if (typeof left === 'number' && typeof right === 'number') return left - right;
	return String(left).localeCompare(String(right), undefined, { numeric: true });
}

function numericOrText(value) {
	const number = Number(value);
	return Number.isFinite(number) ? number : value;
}

function uniqueSlug(value) {
	const base = slugify(value) || `projet-${docId.slice(0, 8).toLowerCase()}`;
	let candidate = base;
	let suffix = 2;
	while (config.projects.some((project) => project.slug === candidate) || ['all', 'update'].includes(candidate)) {
		candidate = `${base}-${suffix}`;
		suffix += 1;
	}
	return candidate;
}

function slugify(value) {
	return value
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 64);
}

function normalizeName(value) {
	return String(value ?? '')
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]/g, '');
}

function normalizeDocId(value) {
	const trimmed = value.trim();
	if (!trimmed) return '';

	let candidate = trimmed;
	try {
		const url = new URL(trimmed);
		const match = url.pathname.match(/\/doc\/([^/]+)/);
		if (match) candidate = decodeURIComponent(match[1]);
	} catch {
		// A plain document ID is the normal input.
	}

	if (!/^[A-Za-z0-9_-]+$/.test(candidate)) {
		throw new Error('Invalid Grist document ID. Paste the ID or the full document URL.');
	}
	return candidate;
}
