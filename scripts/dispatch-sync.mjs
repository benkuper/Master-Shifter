import { getArg, loadEnv } from './grist-utils.mjs';

loadEnv();

const repo = getArg('--repo', process.env.GITHUB_REPOSITORY);
const project = getArg('--project', process.env.GRIST_PROJECT || '');
const force = process.argv.includes('--force');
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

if (!repo) {
	console.error('Missing GitHub repository. Use --repo owner/name or set GITHUB_REPOSITORY.');
	process.exit(1);
}

if (!token) {
	console.error('Missing GitHub token. Set GITHUB_TOKEN or GH_TOKEN with repository dispatch access.');
	process.exit(1);
}

const response = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
	method: 'POST',
	headers: {
		Accept: 'application/vnd.github+json',
		Authorization: `Bearer ${token}`,
		'Content-Type': 'application/json',
		'X-GitHub-Api-Version': '2022-11-28'
	},
	body: JSON.stringify({
		event_type: 'grist-updated',
		client_payload: {
			project: project || undefined,
			force
		}
	})
});

if (!response.ok) {
	throw new Error(`GitHub dispatch failed (${response.status}): ${await response.text()}`);
}

console.log(`Triggered Grist sync for ${repo}${project ? ` (${project})` : ''}.`);
