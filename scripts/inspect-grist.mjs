import { fetchColumns, fetchRecords, getArg, gristFetch, loadEnv } from './grist-utils.mjs';

loadEnv();

const apiKey = process.env.GRIST_API_KEY;
const docId = getArg('--doc', process.env.GRIST_DOC_ID);
const apiBase = getArg('--api', process.env.GRIST_API_BASE || 'https://docs.getgrist.com/api');
const sampleSize = Number(getArg('--sample', '0'));

if (!apiKey) {
	console.error('Missing GRIST_API_KEY. Put it in .env or pass it through the environment.');
	process.exit(1);
}

if (!docId) {
	console.error('Missing document id. Use --doc <docId> or GRIST_DOC_ID.');
	process.exit(1);
}

const { tables } = await gristFetch(apiBase, docId, apiKey, '/tables');

for (const table of tables) {
	const columns = await fetchColumns(apiBase, docId, apiKey, table.id);
	const summary = columns.map((column) => ({
		id: column.id,
		label: column.fields?.label,
		type: column.fields?.type,
		formula: Boolean(column.fields?.formula)
	}));

	console.log(`\n# ${table.id}`);
	console.table(summary);

	if (sampleSize > 0) {
		const records = await fetchRecords(apiBase, docId, apiKey, table.id);
		console.log(JSON.stringify(records.slice(0, sampleSize), null, 2));
	}
}
