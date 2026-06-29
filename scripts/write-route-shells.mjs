import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const registry = JSON.parse(readFileSync('static/data/projects.json', 'utf8'));
const shellPath = existsSync('build/index.html') ? 'build/index.html' : 'build/404.html';
const staticRoutes = ['all', 'update'];

if (!existsSync(shellPath)) {
	throw new Error('Missing build/index.html or build/404.html. Run vite build first.');
}

for (const route of staticRoutes) {
	writeRouteShell(route);
}

for (const project of registry.projects ?? []) {
	if (!project.slug) continue;

	writeRouteShell(project.slug);
	writeRouteShell(`${project.slug}/update`);
}

console.log(`Wrote route shell(s) for ${(registry.projects ?? []).length} project(s).`);

function writeRouteShell(route) {
	const outputPath = join('build', route, 'index.html');
	mkdirSync(dirname(outputPath), { recursive: true });
	copyFileSync(shellPath, outputPath);
}
