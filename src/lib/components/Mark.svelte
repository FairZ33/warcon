<script lang="ts">
	let { size = 28 }: { size?: number } = $props();
</script>

<!-- Colosseum arches: a distinct mark for the community fork. -->
<span
	class="inline-flex shrink-0 items-center justify-center bg-accent text-ink-950"
	style="width:{size}px;height:{size}px;clip-path:polygon(0 0, calc(100% - 7px) 0, 100% 7px, 100% 100%, 7px 100%, 0 calc(100% - 7px))"
	aria-hidden="true"
>
	<svg
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2.2"
		stroke-linecap="square"
		style="width:{size * 0.62}px;height:{size * 0.62}px"
	>
		<path d="M3 20V8l9-4 9 4v12H3ZM3 10h18M8 10v10M16 10v10M3 20h18" />
		<path d="M10 20v-5a2 2 0 0 1 4 0v5" />
	</svg>
</span>
