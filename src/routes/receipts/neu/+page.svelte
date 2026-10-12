<script lang="ts">
	import { enhance } from '$app/forms';

	let { data, form } = $props();

	interface Row {
		name: string;
		price: string;
	}

	const fmt = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');
	const pad = (n: number) => String(n).padStart(2, '0');

	let scanning = $state(false);
	let saving = $state(false);
	let previewUrl = $state<string | null>(null);
	let showRaw = $state(false);

	// Bearbeitbarer Stand des Belegs: kommt entweder aus der Texterkennung (form.draft) oder, nach
	// einem Validierungsfehler beim Speichern, aus dem zurückgegebenen Formularstand (form.form).
	let storeId = $state('manual');
	let marketName = $state('');
	let marketStreet = $state('');
	let marketZip = $state('');
	let marketCity = $state('');
	let date = $state('');
	let time = $state('');
	let total = $state('');
	let rows = $state<Row[]>([]);
	let rawText = $state('');
	let hasDraft = $state(false);

	$effect(() => {
		if (form && 'draft' in form && form.draft) {
			const d = form.draft;
			const ts = new Date(d.timestamp);
			storeId = d.storeId;
			marketName = d.marketName;
			marketStreet = d.marketStreet;
			marketZip = d.marketZip;
			marketCity = d.marketCity;
			date = `${ts.getFullYear()}-${pad(ts.getMonth() + 1)}-${pad(ts.getDate())}`;
			time = `${pad(ts.getHours())}:${pad(ts.getMinutes())}`;
			total = d.totalCents === null ? '' : fmt(d.totalCents);
			rows = d.items.map((i) => ({ name: i.name, price: fmt(i.priceCents) }));
			rawText = d.rawText;
			hasDraft = true;
		} else if (form && 'form' in form && form.form) {
			storeId = form.form.storeId;
			marketName = form.form.marketName;
			marketStreet = form.form.marketStreet;
			marketZip = form.form.marketZip;
			marketCity = form.form.marketCity;
			date = form.form.date;
			time = form.form.time;
			total = form.form.total;
			rows = form.form.items;
			hasDraft = true;
		}
	});

	const itemSum = $derived(
		rows.reduce((sum, r) => {
			const m = r.price.trim().match(/^(-)?(\d{1,5})[.,](\d{2})(-)?$/);
			if (!m) return sum;
			const cents = parseInt(m[2], 10) * 100 + parseInt(m[3], 10);
			return sum + (m[1] || m[4] ? -cents : cents);
		}, 0)
	);

	const totalCents = $derived.by(() => {
		const m = total.trim().match(/^(\d{1,5})[.,](\d{2})$/);
		return m ? parseInt(m[1], 10) * 100 + parseInt(m[2], 10) : null;
	});

	function onPick(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (previewUrl) URL.revokeObjectURL(previewUrl);
		previewUrl = file ? URL.createObjectURL(file) : null;
		if (file) (e.target as HTMLInputElement).form?.requestSubmit();
	}

	/** Sucht im Foto den hellen Bon-Streifen (Thermopapier vor dunklerem Untergrund) und gibt dessen
	 * Ausschnitt zurück. Ein unruhiger Hintergrund verschlechtert die Texterkennung deutlich; ohne
	 * eindeutigen Streifen (oder wenn er fast das ganze Bild füllt) bleibt das Bild unbeschnitten. */
	function findReceiptBox(bmp: ImageBitmap): { x: number; y: number; w: number; h: number } | null {
		const W = 160;
		const H = Math.max(1, Math.round((bmp.height / bmp.width) * W));
		const c = document.createElement('canvas');
		c.width = W;
		c.height = H;
		const ctx = c.getContext('2d', { willReadFrequently: true })!;
		ctx.drawImage(bmp, 0, 0, W, H);
		const px = ctx.getImageData(0, 0, W, H).data;
		const lum = new Float32Array(W * H);
		for (let i = 0; i < lum.length; i++) lum[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
		const sorted = Float32Array.from(lum).sort();
		const thr = sorted[Math.floor(sorted.length * 0.95)] * 0.75;
		const cols = new Array<number>(W).fill(0);
		const rows = new Array<number>(H).fill(0);
		for (let y = 0; y < H; y++) {
			for (let x = 0; x < W; x++) {
				if (lum[y * W + x] > thr) {
					cols[x]++;
					rows[y]++;
				}
			}
		}
		const span = (counts: number[]) => {
			const limit = Math.max(...counts) * 0.35;
			const first = counts.findIndex((n) => n > limit);
			const last = counts.length - 1 - [...counts].reverse().findIndex((n) => n > limit);
			return first < 0 ? null : [first, last] as const;
		};
		const cs = span(cols);
		const rs = span(rows);
		if (!cs || !rs) return null;
		const pad = 0.03;
		const x0 = Math.max(0, cs[0] / W - pad);
		const x1 = Math.min(1, (cs[1] + 1) / W + pad);
		const y0 = Math.max(0, rs[0] / H - pad);
		const y1 = Math.min(1, (rs[1] + 1) / H + pad);
		const area = (x1 - x0) * (y1 - y0);
		if (area < 0.15 || area > 0.85) return null;
		return { x: x0 * bmp.width, y: y0 * bmp.height, w: (x1 - x0) * bmp.width, h: (y1 - y0) * bmp.height };
	}

	/** Bereitet das Foto für Upload und Texterkennung vor: auf den Bon zuschneiden und auf ca. 2000 px
	 * Kantenlänge verkleinern (Handy-Kameras liefern oft 10+ MB; so bleibt der Upload schnell und unter
	 * dem Serverlimit). */
	async function downscale(file: File, maxEdge = 2000): Promise<Blob> {
		try {
			const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
			const box = findReceiptBox(bmp) ?? { x: 0, y: 0, w: bmp.width, h: bmp.height };
			const scale = Math.min(1, maxEdge / Math.max(box.w, box.h));
			const canvas = document.createElement('canvas');
			canvas.width = Math.round(box.w * scale);
			canvas.height = Math.round(box.h * scale);
			canvas.getContext('2d')!.drawImage(bmp, box.x, box.y, box.w, box.h, 0, 0, canvas.width, canvas.height);
			const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.85));
			return blob ?? file;
		} catch {
			return file; // z.B. HEIC ohne Browser-Decoder: Original senden, der Server prüft das Format
		}
	}

	function addRow() {
		rows.push({ name: '', price: '' });
	}
	function removeRow(i: number) {
		rows.splice(i, 1);
	}
	function reset() {
		hasDraft = false;
		previewUrl = null;
		rows = [];
	}

	const inputCls =
		'w-full h-10 px-space-sm bg-surface-container-low rounded-lg text-on-surface placeholder:text-outline font-body-md text-body-md focus:outline-none focus:bg-surface-container shadow-inner';
	const btnCls =
		'flex items-center justify-center gap-space-xs px-space-lg h-10 rounded-lg font-label-mono-md text-label-mono-md font-semibold transition-all disabled:opacity-60';
</script>

<svelte:head><title>Kassenzettel fotografieren — BonSync</title></svelte:head>

<div class="flex flex-col w-full max-w-3xl pb-space-xl font-body-md text-on-surface">
	<div class="flex items-center justify-between gap-space-md mb-space-lg">
		<div class="flex items-center gap-space-sm">
			<div class="flex items-center justify-center w-7 h-7 rounded-lg bg-surface-container-high shadow-inner text-primary">
				<i class="fa-solid fa-camera text-[18px]"></i>
			</div>
			<h1 class="font-headline-xl text-headline-xl text-on-surface font-bold tracking-tight">Beleg fotografieren</h1>
		</div>
		<a class="flex items-center gap-space-xs px-space-md h-9 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface text-body-sm font-medium" href="/receipts">
			<i class="fa-solid fa-arrow-left text-[16px]"></i>
			Zurück
		</a>
	</div>

	{#if !hasDraft}
		<form
			method="POST"
			action="?/scan"
			enctype="multipart/form-data"
			class="flex flex-col gap-space-md rounded-2xl bg-surface-container-low p-space-lg shadow-xl"
			use:enhance={async ({ formData }) => {
				scanning = true;
				// Kamera- und Galerie-Eingabe heißen beide "photo"; nur die mit Inhalt zählt.
				const photo = formData.getAll('photo').find((f): f is File => f instanceof File && f.size > 0);
				formData.delete('photo');
				if (photo) formData.set('photo', await downscale(photo), 'bon.jpg');
				return async ({ update }) => {
					scanning = false;
					await update({ reset: false });
				};
			}}
		>
			<p class="font-body-md text-body-md text-on-surface-variant">
				Fotografiere den Kassenzettel möglichst gerade, bei gutem Licht und so, dass er das Bild füllt. Der Text wird
				auf dem Server erkannt (ohne Cloud-Dienst); du kannst alles vor dem Speichern prüfen und korrigieren.
			</p>

			{#if form && 'scanError' in form && form.scanError}
				<p class="rounded-xl bg-error-container text-on-error-container p-space-md font-body-sm text-body-sm">{form.scanError}</p>
			{/if}

			{#if previewUrl}
				<img src={previewUrl} alt="Aufgenommener Kassenzettel" class="max-h-72 w-auto self-center rounded-lg shadow-md" />
			{/if}

			<div class="flex flex-col sm:flex-row gap-space-sm">
				<!-- Das Label ist der klickbare Button; das echte Input ist versteckt. `capture` öffnet auf
				     dem Handy direkt die Kamera, ohne `capture` die Galerie bzw. der Dateiauswahldialog. -->
				<label class="{btnCls} bg-primary text-on-primary-container cursor-pointer {scanning ? 'opacity-60 pointer-events-none' : ''}">
					<i class="fa-solid fa-camera text-[16px]"></i>
					Foto aufnehmen
					<input class="sr-only" type="file" name="photo" accept="image/*" capture="environment" onchange={onPick} />
				</label>
				<label class="{btnCls} bg-surface-container-high hover:bg-surface-container-highest text-on-surface cursor-pointer {scanning ? 'opacity-60 pointer-events-none' : ''}">
					<i class="fa-solid fa-image text-[16px]"></i>
					Aus Galerie wählen
					<input class="sr-only" type="file" name="photo" accept="image/jpeg,image/png,image/webp" onchange={onPick} />
				</label>
			</div>
			{#if scanning}
				<p class="font-body-sm text-body-sm text-on-surface-variant"><i class="fa-solid fa-spinner fa-spin"></i> Text wird erkannt …</p>
			{/if}
		</form>
	{:else}
		<form
			method="POST"
			action="?/save"
			class="flex flex-col gap-space-md rounded-2xl bg-surface-container-low p-space-lg shadow-xl"
			use:enhance={() => {
				saving = true;
				return async ({ update }) => {
					saving = false;
					await update({ reset: false });
				};
			}}
		>
			<p class="font-body-sm text-body-sm text-on-surface-variant">
				Erkannte Daten bitte prüfen: Texterkennung liest nicht jede Zeile korrekt. Falsche Zeilen kannst du ändern oder löschen.
			</p>

			{#if form && 'saveError' in form && form.saveError}
				<p class="rounded-xl bg-error-container text-on-error-container p-space-md font-body-sm text-body-sm">{form.saveError}</p>
			{/if}

			<div class="grid grid-cols-1 sm:grid-cols-2 gap-space-sm">
				<label class="flex flex-col gap-1 sm:col-span-2">
					<span class="font-label-mono-xs text-label-mono-xs text-outline">Händler</span>
					<select class={inputCls} name="storeId" bind:value={storeId}>
						{#each data.stores as s (s.id)}
							<option value={s.id}>{s.name}</option>
						{/each}
					</select>
				</label>
				<label class="flex flex-col gap-1 sm:col-span-2">
					<span class="font-label-mono-xs text-label-mono-xs text-outline">Markt</span>
					<input class={inputCls} name="marketName" bind:value={marketName} placeholder="z.B. REWE Musterstadt" required />
				</label>
				<label class="flex flex-col gap-1 sm:col-span-2">
					<span class="font-label-mono-xs text-label-mono-xs text-outline">Straße</span>
					<input class={inputCls} name="marketStreet" bind:value={marketStreet} />
				</label>
				<label class="flex flex-col gap-1">
					<span class="font-label-mono-xs text-label-mono-xs text-outline">PLZ</span>
					<input class={inputCls} name="marketZip" bind:value={marketZip} inputmode="numeric" />
				</label>
				<label class="flex flex-col gap-1">
					<span class="font-label-mono-xs text-label-mono-xs text-outline">Ort</span>
					<input class={inputCls} name="marketCity" bind:value={marketCity} />
				</label>
				<label class="flex flex-col gap-1">
					<span class="font-label-mono-xs text-label-mono-xs text-outline">Datum</span>
					<input class={inputCls} type="date" name="date" bind:value={date} required />
				</label>
				<label class="flex flex-col gap-1">
					<span class="font-label-mono-xs text-label-mono-xs text-outline">Uhrzeit</span>
					<input class={inputCls} type="time" name="time" bind:value={time} />
				</label>
				<label class="flex flex-col gap-1">
					<span class="font-label-mono-xs text-label-mono-xs text-outline">Gesamtbetrag (€)</span>
					<input class={inputCls} name="total" bind:value={total} inputmode="decimal" placeholder="0,00" required />
				</label>
				<div class="flex flex-col justify-end pb-2 font-label-mono-xs text-label-mono-xs text-outline">
					Summe der Artikel: {fmt(itemSum)} €
					{#if totalCents !== null && totalCents !== itemSum}
						<span class="text-error">Differenz zum Gesamtbetrag: {fmt(totalCents - itemSum)} € — fehlt ein Artikel?</span>
					{/if}
				</div>
			</div>

			<div class="flex flex-col gap-space-xs">
				<span class="font-label-mono-xs text-label-mono-xs text-outline uppercase tracking-wider">Artikel</span>
				{#each rows as row, i (i)}
					<div class="flex items-center gap-space-xs">
						<input class={inputCls} name="itemName" bind:value={row.name} placeholder="Artikel" aria-label="Artikelname {i + 1}" />
						<input class="{inputCls} !w-24 text-right" name="itemPrice" bind:value={row.price} inputmode="decimal" placeholder="0,00" aria-label="Preis {i + 1}" />
						<button type="button" class="w-10 h-10 flex-shrink-0 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface-variant" onclick={() => removeRow(i)} aria-label="Artikel {i + 1} entfernen">
							<i class="fa-solid fa-trash text-[14px]"></i>
						</button>
					</div>
				{/each}
				<button type="button" class="self-start flex items-center gap-space-xs px-space-md h-9 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface text-body-sm font-medium" onclick={addRow}>
					<i class="fa-solid fa-plus text-[14px]"></i> Artikel hinzufügen
				</button>
			</div>

			{#if rawText}
				<details bind:open={showRaw} class="text-on-surface-variant">
					<summary class="font-body-sm text-body-sm">Erkannter Rohtext</summary>
					<pre class="mt-space-xs max-h-60 overflow-auto rounded-lg bg-surface-container p-space-sm font-label-mono-xs text-label-mono-xs whitespace-pre-wrap">{rawText}</pre>
				</details>
			{/if}

			<div class="flex flex-col sm:flex-row gap-space-sm justify-end">
				<button type="button" class="{btnCls} bg-surface-container-high hover:bg-surface-container-highest text-on-surface" onclick={reset}>
					Neues Foto
				</button>
				<button type="submit" class="{btnCls} bg-primary text-on-primary-container hover:brightness-110" disabled={saving}>
					<i class="fa-solid fa-floppy-disk text-[16px]"></i>
					{saving ? 'Speichere …' : 'Beleg speichern'}
				</button>
			</div>
		</form>
	{/if}
</div>
