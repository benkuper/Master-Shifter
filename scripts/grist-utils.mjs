import { existsSync, readFileSync } from 'node:fs';

export function loadEnv(path = '.env') {
	if (!existsSync(path)) return;

	for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;

		const separator = trimmed.indexOf('=');
		if (separator === -1) continue;

		const key = trimmed.slice(0, separator).trim();
		const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '');
		if (key && process.env[key] === undefined) process.env[key] = value;
	}
}

export function getArg(name, fallback = '') {
	const index = process.argv.indexOf(name);
	if (index === -1) return fallback;
	return process.argv[index + 1] ?? fallback;
}

export async function gristFetch(apiBase, docId, apiKey, path) {
	const response = await fetch(`${apiBase.replace(/\/$/, '')}/docs/${docId}${path}`, {
		headers: {
			Authorization: `Bearer ${apiKey}`
		}
	});

	if (!response.ok) {
		throw new Error(`Grist ${response.status} while fetching ${path}: ${await response.text()}`);
	}

	return response.json();
}

export async function fetchRecords(apiBase, docId, apiKey, tableId) {
	const payload = await gristFetch(apiBase, docId, apiKey, `/tables/${tableId}/records`);
	return payload.records ?? [];
}

export async function fetchColumns(apiBase, docId, apiKey, tableId) {
	const payload = await gristFetch(apiBase, docId, apiKey, `/tables/${tableId}/columns`);
	return payload.columns ?? [];
}

export function refList(value) {
	if (!Array.isArray(value)) return [];
	const [, ...items] = value;
	return items.filter((item) => typeof item === 'number' || typeof item === 'string').map(String);
}

export function ref(value) {
	if (value === null || value === undefined || value === 0) return undefined;
	return String(value);
}

export function text(value, fallback = '') {
	if (value === null || value === undefined) return fallback;
	if (Array.isArray(value)) return value.slice(1).join(', ');
	return String(value).trim();
}

export function gristDateTime(value) {
	if (typeof value !== 'number') return undefined;
	return new Date(value * 1000).toISOString();
}

export function stripHtml(value) {
	return text(value).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function compactObject(object) {
	return Object.fromEntries(
		Object.entries(object).filter(([, value]) => {
			if (value === undefined || value === null || value === '') return false;
			if (Array.isArray(value) && value.length === 0) return false;
			return true;
		})
	);
}

export function formatPeriod(startIso, endIso, timezone = 'Europe/Paris') {
	if (!startIso || !endIso) return undefined;

	const start = new Date(startIso);
	const end = new Date(endIso);
	const sameYear = start.getFullYear() === end.getFullYear();
	const formatter = new Intl.DateTimeFormat('fr-FR', {
		day: 'numeric',
		month: 'long',
		year: sameYear ? undefined : 'numeric',
		timeZone: timezone
	});

	return `${formatter.format(start)} - ${formatter.format(end)}${sameYear ? ` ${end.getFullYear()}` : ''}`;
}
