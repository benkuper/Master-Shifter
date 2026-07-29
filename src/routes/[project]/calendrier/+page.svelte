<script lang="ts">
	import CalendarView from '$lib/CalendarView.svelte';

	let { data } = $props();
</script>

<CalendarView projectSlug={data.projectSlug} />
