export const INSTALL_URL_STORAGE_KEY = 'master-shifter-install-url';

export function appRootPath(base: string): string {
	return `${base || ''}/`.replace(/\/{2,}/g, '/');
}

export function isAppRoot(pathname: string, base: string): boolean {
	const root = appRootPath(base);
	return pathname === root || pathname === root.replace(/\/$/, '');
}

export function resolveInstallTarget(rawTarget: string, origin: string, base: string): URL | null {
	if (!rawTarget) return null;

	try {
		const url = new URL(rawTarget, origin);
		const root = appRootPath(base);
		const rootWithoutSlash = root.replace(/\/$/, '');
		const isInScope = url.pathname === rootWithoutSlash || url.pathname.startsWith(root);

		if (url.origin !== origin || !isInScope) return null;

		url.searchParams.delete('source');
		return url;
	} catch {
		return null;
	}
}
