<script lang="ts">
	import UpdatePage from '$lib/UpdatePage.svelte';

	let { data } = $props();
</script>

<UpdatePage projectSlug={data.projectSlug} />
