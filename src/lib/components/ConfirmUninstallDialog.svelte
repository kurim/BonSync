<script lang="ts">
	import { enhance } from '$app/forms';

	let { storeId, displayName }: { storeId: string; displayName: string } = $props();

	let dialogEl: HTMLDialogElement | undefined = $state();
	let deleteData = $state(false);
	let submitting = $state(false);

	export function open() {
		deleteData = false;
		dialogEl?.showModal();
	}
</script>

<dialog bind:this={dialogEl} class="uninstall-dialog m-auto rounded-xl bg-surface-container text-on-surface shadow-xl p-0 w-full max-w-md">
	<form
		method="POST"
		action="?/uninstall"
		use:enhance={() => {
			submitting = true;
			return async ({ update }) => {
				await update();
				submitting = false;
				dialogEl?.close();
			};
		}}
		class="flex flex-col gap-space-md p-space-lg"
	>
		<input type="hidden" name="storeId" value={storeId} />
		<input type="hidden" name="deleteData" value={deleteData} />

		<div class="flex items-start gap-space-sm">
			<div class="w-9 h-9 rounded-lg bg-error-container/20 text-error flex items-center justify-center shrink-0">
				<i class="fa-solid fa-triangle-exclamation text-[16px]"></i>
			</div>
			<div class="min-w-0">
				<h3 class="font-headline-sm text-headline-sm font-bold">"{displayName}" deinstallieren?</h3>
				<p class="font-body-sm text-body-sm text-on-surface-variant mt-1">
					Entfernt das Modul aus BonSync. Diese Aktion kann nur durch eine erneute Installation rückgängig gemacht werden.
				</p>
			</div>
		</div>

		<label class="flex items-start gap-2 px-space-sm py-space-sm rounded-lg bg-surface-container-high/60 cursor-pointer">
			<input type="checkbox" bind:checked={deleteData} class="accent-error mt-0.5" />
			<span class="font-body-sm text-body-sm text-on-surface">
				<span class="font-semibold">Auch vorhandene Daten löschen</span>
				<span class="block text-on-surface-variant">Belege, Artikel, Zugangsdaten und heruntergeladene PDFs dieses Marktes werden unwiderruflich gelöscht.</span>
			</span>
		</label>

		<div class="flex items-center justify-end gap-space-sm mt-space-xs">
			<button type="button" onclick={() => dialogEl?.close()} class="px-space-md py-space-sm rounded-lg font-body-sm text-body-sm font-semibold text-on-surface-variant hover:bg-surface-container-high transition-colors">
				Abbrechen
			</button>
			<button
				type="submit"
				disabled={submitting}
				class="px-space-md py-space-sm rounded-lg font-body-sm text-body-sm font-semibold bg-error text-on-error hover:brightness-110 transition-[filter] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
			>
				{#if submitting}
					<i class="fa-solid fa-arrows-rotate text-[14px] animate-spin"></i>
				{/if}
				Deinstallieren
			</button>
		</div>
	</form>
</dialog>

<style>
	.uninstall-dialog::backdrop {
		background: rgba(8, 6, 15, 0.55);
		backdrop-filter: blur(1px);
	}
</style>
