import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const registry = JSON.parse(readFileSync('static/data/projects.json', 'utf8'));
const shellPath = existsSync('build/index.html') ? 'build/index.html' : 'build/404.html';

if (!existsSync(shellPath)) {
	throw new Error('Missing build/index.html or build/404.html. Run vite build first.');
}

for (const project of registry.projects ?? []) {
	if (!project.slug) continue;

	const outputPath = join('build', project.slug, 'index.html');
	mkdirSync(dirname(outputPath), { recursive: true });
	copyFileSync(shellPath, outputPath);
}

console.log(`Wrote route shell(s) for ${(registry.projects ?? []).length} project(s).`);
