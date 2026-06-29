export const ssr = false;
export const prerender = false;

export function load({ params }) {
	return {
		projectSlug: params.project
	};
}
