import type { ProjectRegistry } from './types';

export const THEME_PALETTE = [
	{ primary: 166, secondary: 28, surface: 172 },
	{ primary: 322, secondary: 190, surface: 318 },
	{ primary: 38, secondary: 214, surface: 32 },
	{ primary: 214, secondary: 54, surface: 220 },
	{ primary: 286, secondary: 96, surface: 280 },
	{ primary: 96, secondary: 344, surface: 104 },
	{ primary: 18, secondary: 188, surface: 12 },
	{ primary: 252, secondary: 54, surface: 248 },
	{ primary: 190, secondary: 322, surface: 190 },
	{ primary: 344, secondary: 166, surface: 350 },
	{ primary: 54, secondary: 252, surface: 48 },
	{ primary: 132, secondary: 286, surface: 136 }
] as const;

export function projectTheme(seed: string, registry: ProjectRegistry | null) {
	return THEME_PALETTE[resolveThemeIndex(seed, registry)];
}

export function themeStyle(theme: (typeof THEME_PALETTE)[number]): string {
	return `--accent-h:${theme.primary};--accent-2-h:${theme.secondary};--surface-h:${theme.surface};`;
}

function resolveThemeIndex(seed: string, registry: ProjectRegistry | null) {
	const sortedSlugs = [...(registry?.projects.map((item) => item.slug).filter(Boolean) ?? [])].sort(
		(a, b) => a.localeCompare(b)
	);
	const usedIndexes = new Set<number>();

	for (const slug of sortedSlugs) {
		const preferredIndex = hashString(slug) % THEME_PALETTE.length;
		const index = findAvailableThemeIndex(preferredIndex, usedIndexes);

		if (slug === seed) return index;
		usedIndexes.add(index);
	}

	return hashString(seed) % THEME_PALETTE.length;
}

function findAvailableThemeIndex(preferredIndex: number, usedIndexes: Set<number>) {
	for (let offset = 0; offset < THEME_PALETTE.length; offset += 1) {
		const index = (preferredIndex + offset * 5) % THEME_PALETTE.length;
		if (!usedIndexes.has(index)) return index;
	}

	return preferredIndex;
}

function hashString(value: string) {
	let hash = 2166136261;
	for (const char of value) {
		hash ^= char.charCodeAt(0);
		hash = Math.imul(hash, 16777619);
	}
	return Math.abs(hash);
}
