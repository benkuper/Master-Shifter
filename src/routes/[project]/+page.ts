export const ssr = false;

export function load({ params }) {
	return {
		projectSlug: params.project
	};
}
