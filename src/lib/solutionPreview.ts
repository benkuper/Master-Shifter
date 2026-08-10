import type { ProjectSummary, Solution } from './types';

const STORAGE_PREFIX = 'master-shifter-preview-solution:';

export function getPreviewSolutionId(project: ProjectSummary): string {
	if (typeof window === 'undefined') return '';
	const key = `${STORAGE_PREFIX}${project.slug}`;
	const stored = window.localStorage.getItem(key) ?? '';
	if (stored === String(project.solutionId ?? '')) {
		window.localStorage.removeItem(key);
		return '';
	}
	return project.solutions?.some((solution) => String(solution.id) === stored) ? stored : '';
}

export function setPreviewSolutionId(project: ProjectSummary, solutionId: string): void {
	if (typeof window === 'undefined') return;
	const key = `${STORAGE_PREFIX}${project.slug}`;
	if (!solutionId || solutionId === String(project.solutionId ?? '')) window.localStorage.removeItem(key);
	else window.localStorage.setItem(key, solutionId);
}

export function solutionById(project: ProjectSummary, solutionId: string): Solution | undefined {
	return project.solutions?.find((solution) => String(solution.id) === solutionId);
}
