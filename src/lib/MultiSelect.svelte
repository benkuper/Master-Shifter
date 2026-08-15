<script lang="ts">
	import { Check, ChevronDown, X } from '@lucide/svelte';

	type Option = {
		id: string;
		label: string;
		count?: number;
	};

	let {
		label,
		options,
		selected = [],
		onchange
	} = $props<{
		label: string;
		options: Option[];
		selected?: string[];
		onchange: (selected: string[]) => void;
	}>();

	let summary = $derived(
		selected.length === 0
			? 'Tous'
			: selected.length === 1
				? options.find((option: Option) => option.id === selected[0])?.label ?? '1 sélection'
				: `${selected.length} sélections`
	);

	function toggle(id: string) {
		onchange(
			selected.includes(id)
				? selected.filter((selectedId: string) => selectedId !== id)
				: [...selected, id]
		);
	}
</script>

<details class="multi-select">
	<summary>
		<span class="multi-select__copy">
			<span class="multi-select__label">{label}</span>
			<span class:active={selected.length > 0} class="multi-select__value">{summary}</span>
		</span>
		<span class="multi-select__chevron">
			<ChevronDown size={17} aria-hidden="true" />
		</span>
	</summary>

	<div class="multi-select__panel">
		<div class="multi-select__panel-heading">
			<strong>{label}</strong>
			{#if selected.length > 0}
				<button type="button" onclick={() => onchange([])}>
					<X size={14} aria-hidden="true" />
					Effacer
				</button>
			{/if}
		</div>

	<div class="multi-select__options">
			{#each options as option}
				<label class:checked={selected.includes(option.id)}>
					<input
						type="checkbox"
						checked={selected.includes(option.id)}
						onchange={() => toggle(option.id)}
					/>
					<span class="multi-select__check"><Check size={14} aria-hidden="true" /></span>
					<span class="multi-select__option-label">{option.label}</span>
					{#if option.count !== undefined}
						<span class="multi-select__count">{option.count}</span>
					{/if}
				</label>
			{:else}
				<p>Aucune option disponible.</p>
			{/each}
		</div>
	</div>
</details>

<style>
	.multi-select {
		position: relative;
		min-width: 0;
	}

	summary {
		display: flex;
		min-height: 54px;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding: 8px 11px;
		border: 1px solid var(--line);
		border-radius: 8px;
		background: hsl(var(--surface-h) 20% 18% / 0.82);
		color: var(--text);
		cursor: pointer;
		list-style: none;
	}

	summary::-webkit-details-marker {
		display: none;
	}

	.multi-select[open] summary {
		border-color: var(--accent-border);
		box-shadow: 0 0 0 3px var(--accent-wash);
	}

	.multi-select__copy {
		display: grid;
		min-width: 0;
		gap: 2px;
	}

	.multi-select__label {
		color: var(--muted);
		font-size: 0.68rem;
		font-weight: 800;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.multi-select__value {
		overflow: hidden;
		color: var(--muted);
		font-size: 0.88rem;
		font-weight: 750;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.multi-select__value.active {
		color: var(--accent-strong);
	}

	.multi-select__chevron {
		flex: 0 0 auto;
		transition: transform 160ms ease;
	}

	.multi-select[open] .multi-select__chevron {
		transform: rotate(180deg);
	}

	.multi-select__panel {
		position: absolute;
		z-index: 30;
		top: calc(100% + 7px);
		left: 0;
		display: grid;
		grid-template-rows: auto minmax(0, 1fr);
		width: max(100%, 260px);
		max-height: min(380px, 55vh);
		overflow: hidden;
		border: 1px solid var(--line-strong);
		border-radius: 9px;
		background: hsl(var(--surface-h) 30% 9% / 0.98);
		box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
		backdrop-filter: blur(22px);
	}

	.multi-select__panel-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding: 11px 12px 8px;
		border-bottom: 1px solid var(--line);
		font-size: 0.82rem;
	}

	.multi-select__panel-heading button {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 4px 6px;
		border: 0;
		border-radius: 6px;
		background: transparent;
		color: var(--accent-strong);
		cursor: pointer;
		font-size: 0.75rem;
	}

	.multi-select__options {
		display: grid;
		gap: 3px;
		min-height: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: 7px;
		scrollbar-color: var(--line-strong) transparent;
		scrollbar-gutter: stable;
	}

	.multi-select__options::-webkit-scrollbar {
		width: 10px;
	}

	.multi-select__options::-webkit-scrollbar-thumb {
		border: 2px solid transparent;
		border-radius: 999px;
		background: var(--line-strong);
		background-clip: padding-box;
	}

	.multi-select__options label {
		display: grid;
		grid-template-columns: 20px minmax(0, 1fr) auto;
		align-items: center;
		gap: 8px;
		min-height: 38px;
		padding: 6px 8px;
		border-radius: 7px;
		color: var(--text);
		cursor: pointer;
	}

	.multi-select__options label:hover,
	.multi-select__options label.checked {
		background: var(--accent-wash);
	}

	.multi-select__options input {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
	}

	.multi-select__check {
		display: grid;
		width: 19px;
		height: 19px;
		place-items: center;
		border: 1px solid var(--line-strong);
		border-radius: 5px;
		color: transparent;
	}

	label.checked .multi-select__check {
		border-color: var(--accent);
		background: var(--accent);
		color: var(--ink);
	}

	.multi-select__option-label {
		overflow: hidden;
		font-size: 0.86rem;
		font-weight: 700;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.multi-select__count {
		min-width: 24px;
		padding: 3px 6px;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.08);
		color: var(--muted);
		font-size: 0.7rem;
		font-weight: 800;
		text-align: center;
	}

	.multi-select__options p {
		margin: 8px;
		color: var(--muted);
		font-size: 0.84rem;
	}

	@media (max-width: 680px) {
		.multi-select__panel {
			position: fixed;
			inset: auto 10px 10px;
			width: auto;
			max-height: 60vh;
		}
	}
</style>
