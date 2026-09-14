<script lang="ts">
	import { enhance } from '$app/forms';
	let { data, form } = $props();

	let showCurrent = $state(false);
	let showNew = $state(false);
	let showConfirm = $state(false);
	let showMqttPassword = $state(false);
	let clearMqttPassword = $state(false);

	let savingMqtt = $state(false);
	let testingMqtt = $state(false);
	let changingPassword = $state(false);
</script>

<svelte:head><title>Einstellungen — BonSync</title></svelte:head>

<div class="flex flex-col w-full pb-space-xl font-body-md text-on-surface">
	<div class="flex flex-col gap-space-xs mb-space-xl">
		<div class="flex items-center gap-space-sm">
			<div class="flex items-center justify-center w-7 h-7 rounded-lg bg-surface-container-high shadow-inner text-primary">
				<i class="fa-solid fa-gear text-[18px]"></i>
			</div>
			<h1 class="font-headline-xl text-headline-xl tracking-tight text-on-surface">Einstellungen</h1>
		</div>
		<p class="font-body-md text-body-md text-on-surface-variant pl-space-md">Home Assistant / MQTT-Anbindung &amp; Konto</p>
	</div>

	<div class="grid grid-cols-1 md:grid-cols-12 gap-gutter-desktop items-start">
		<!-- MQTT Broker -->
		<section class="col-span-6 2xl:col-span-7 flex flex-col gap-space-lg">
			<div class="bg-surface-container-low rounded-xl p-space-lg shadow-xl relative overflow-hidden">
				<div class="absolute -top-24 -right-24 w-60 h-60 bg-secondary-container/20 rounded-full blur-3xl pointer-events-none"></div>

				<div class="flex items-center justify-between mb-space-lg relative z-10">
					<div class="flex items-center gap-space-sm">
						<div class="w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center text-primary">
							<i class="fa-solid fa-tower-broadcast text-[20px]"></i>
						</div>
						<h2 class="font-headline-md text-headline-md text-on-surface">MQTT Broker</h2>
					</div>
					<span class="font-label-mono-xs text-label-mono-xs uppercase px-space-xs py-0.5 rounded bg-surface-container-highest text-secondary font-semibold tracking-wider">Smart Home Bridge</span>
				</div>

				<div class="mb-space-lg bg-surface-container/70 rounded-lg p-space-md flex items-start gap-space-sm relative z-10">
					<i class="fa-solid fa-circle-info text-primary text-[20px] shrink-0 mt-0.5"></i>
					<p class="font-body-sm text-body-sm leading-relaxed text-on-surface-variant">
						Verbindung wird bei jedem Sync kurz aufgebaut, um Nachrichten zu veröffentlichen — kein dauerhaft offener Client. Ist der Broker nicht erreichbar oder stimmen die Zugangsdaten nicht, bleibt der restliche Sync unberührt (Fehler landet nur im Server-Log).
					</p>
				</div>

				<form
					method="POST"
					action="?/saveMqtt"
					use:enhance={({ submitter }) => {
						const isTest = submitter?.getAttribute('formaction')?.includes('testMqtt');
						if (isTest) testingMqtt = true;
						else savingMqtt = true;
						return async ({ update }) => {
							testingMqtt = false;
							savingMqtt = false;
							// reset:false -- sonst leert SvelteKits Standardverhalten nach jedem Submit
							// (auch beim reinen Verbindungstest) alle Felder ohne festes HTML-value-
							// Attribut (Base-Topic, Sync-Intervall, Eager-PDF-Grenze, Toggles).
							await update({ reset: false });
						};
					}}
					class="flex flex-col gap-space-lg relative z-10"
				>
					<div class="grid grid-cols-1 md:grid-cols-12 gap-space-md">
						<div class="md:col-span-8 flex flex-col gap-space-xs">
							<label class="font-label-mono-sm text-label-mono-sm text-on-surface font-medium flex items-center justify-between flex-wrap gap-1" for="mqtt-host">
								<span>Host</span>
								<span class="text-outline text-label-mono-xs font-normal">z.B. 192.168.178.50 / homeassistant.local</span>
							</label>
							<input
								id="mqtt-host"
								name="mqttHost"
								class="w-full h-[38px] bg-surface-container-lowest text-on-surface font-label-mono-md text-label-mono-md px-space-md rounded-lg focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-outline transition-all"
								placeholder="homeassistant.local"
								type="text"
								value={data.settings.mqttHost}
							/>
						</div>
						<div class="md:col-span-4 flex flex-col gap-space-xs">
							<label class="font-label-mono-sm text-label-mono-sm text-on-surface font-medium" for="mqtt-port">Port</label>
							<input
								id="mqtt-port"
								name="mqttPort"
								class="w-full h-[38px] bg-surface-container-lowest text-on-surface font-label-mono-md text-label-mono-md px-space-md rounded-lg focus:outline-none focus:ring-1 focus:ring-primary transition-all text-center"
								type="number"
								value={data.settings.mqttPort}
							/>
						</div>
					</div>

					<div class="grid grid-cols-1 md:grid-cols-12 gap-space-md">
						<div class="md:col-span-6 flex flex-col gap-space-xs">
							<label class="font-label-mono-sm text-label-mono-sm text-on-surface font-medium" for="mqtt-user">Username</label>
							<input
								id="mqtt-user"
								name="mqttUsername"
								class="w-full h-[38px] bg-surface-container-lowest text-on-surface font-label-mono-md text-label-mono-md px-space-md rounded-lg focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-outline transition-all"
								placeholder="homeassistant"
								type="text"
								autocomplete="off"
								value={data.settings.mqttUsername}
							/>
						</div>
						<div class="md:col-span-6 flex flex-col gap-space-xs">
							<label class="font-label-mono-sm text-label-mono-sm text-on-surface font-medium flex items-center justify-between" for="mqtt-password">
								<span>Passwort</span>
								{#if data.settings.mqttPasswordSet}<span class="text-outline text-label-mono-xs font-normal">hinterlegt — leer lassen für keine Änderung</span>{/if}
							</label>
							<div class="relative">
								<input
									id="mqtt-password"
									name="mqttPassword"
									class="w-full h-[38px] bg-surface-container-lowest text-on-surface font-label-mono-md text-label-mono-md px-space-md pr-10 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-outline transition-all disabled:opacity-50"
									placeholder={data.settings.mqttPasswordSet ? '••••••••••••' : 'kein Passwort hinterlegt'}
									type={showMqttPassword ? 'text' : 'password'}
									autocomplete="new-password"
									disabled={clearMqttPassword}
								/>
								<button type="button" class="absolute right-2.5 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface transition-colors" onclick={() => (showMqttPassword = !showMqttPassword)} aria-label={showMqttPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}>
									<i class="fa-regular {showMqttPassword ? 'fa-eye-slash' : 'fa-eye'} text-[18px]"></i>
								</button>
							</div>
							{#if data.settings.mqttPasswordSet}
								<label class="flex items-center gap-1.5 mt-1 font-body-sm text-body-sm text-on-surface-variant">
									<input type="checkbox" name="mqttPasswordClear" bind:checked={clearMqttPassword} class="accent-primary" />
									Hinterlegtes Passwort beim Speichern entfernen
								</label>
							{/if}
						</div>
					</div>

					<div class="flex flex-col gap-space-xs">
						<label class="font-label-mono-sm text-label-mono-sm text-on-surface font-medium" for="mqtt-base-topic">Base-Topic</label>
						<input
							id="mqtt-base-topic"
							name="mqttBaseTopic"
							class="w-full h-[38px] bg-surface-container-lowest text-on-surface font-label-mono-md text-label-mono-md px-space-md rounded-lg focus:outline-none focus:ring-1 focus:ring-primary transition-all"
							type="text"
							value={data.settings.mqttBaseTopic}
						/>
					</div>

					<div class="h-px w-full bg-surface-container-highest"></div>

					<div class="flex items-center justify-between gap-space-md py-space-xs">
						<div class="flex flex-col gap-0.5 min-w-0">
							<span class="font-body-md text-body-md font-semibold text-on-surface">Neuen Bon sofort veröffentlichen</span>
							<span class="font-body-sm text-body-sm text-on-surface-variant">Feuert <code class="font-label-mono-xs text-label-mono-xs text-secondary bg-surface-container-highest px-1.5 py-0.5 rounded">bonsync/receipt/new</code> bei jedem neuen Beleg.</span>
						</div>
						<div class="switch shrink-0">
							<input type="checkbox" id="pub-new" name="mqttPublishNew" checked={data.settings.mqttPublishNew} />
							<label for="pub-new"></label>
						</div>
					</div>
					<div class="flex items-center justify-between gap-space-md py-space-xs">
						<div class="flex flex-col gap-0.5 min-w-0">
							<span class="font-body-md text-body-md font-semibold text-on-surface">Monats-Summen als Sensor</span>
							<span class="font-body-sm text-body-sm text-on-surface-variant">Ein Sensor pro aktivem Markt (<code class="font-label-mono-xs text-label-mono-xs text-secondary bg-surface-container-highest px-1.5 py-0.5 rounded">sensor.bonsync_&lt;store&gt;_ausgaben_monat</code>).</span>
						</div>
						<div class="switch shrink-0">
							<input type="checkbox" id="pub-sum" name="mqttPublishSummary" checked={data.settings.mqttPublishSummary} />
							<label for="pub-sum"></label>
						</div>
					</div>

					<div class="grid grid-cols-1 sm:grid-cols-2 gap-space-md pt-space-xs">
						<div class="flex flex-col gap-space-xs">
							<label class="font-label-mono-sm text-label-mono-sm text-on-surface font-medium" for="sync-interval">Sync-Intervall</label>
							<div class="flex items-center gap-space-sm">
								<input
									id="sync-interval"
									name="syncIntervalMinutes"
									class="w-24 h-[38px] bg-surface-container-lowest text-on-surface font-label-mono-md text-label-mono-md px-space-md rounded-lg focus:outline-none focus:ring-1 focus:ring-primary transition-all text-center"
									type="number"
									min="0"
									value={data.settings.syncIntervalMinutes}
								/>
								<span class="font-body-sm text-body-sm text-outline">Minuten automatisch abrufen (0 = nur manuell)</span>
							</div>
						</div>
						<div class="flex flex-col gap-space-xs">
							<label class="font-label-mono-sm text-label-mono-sm text-on-surface font-medium" for="eager-pdf-limit">Eager-PDF-Grenze</label>
							<div class="flex items-center gap-space-sm">
								<input
									id="eager-pdf-limit"
									name="eagerPdfLimit"
									class="w-24 h-[38px] bg-surface-container-lowest text-on-surface font-label-mono-md text-label-mono-md px-space-md rounded-lg focus:outline-none focus:ring-1 focus:ring-primary transition-all text-center"
									type="number"
									value={data.settings.eagerPdfLimit}
								/>
								<span class="font-body-sm text-body-sm text-outline">Belege vorab im Cache puffern</span>
							</div>
						</div>
					</div>

					<div class="pt-space-md flex items-center gap-space-md flex-wrap">
						<button
							class="flex items-center justify-center gap-space-xs px-space-xl h-[38px] rounded-lg bg-primary text-on-primary-container font-label-mono-md text-label-mono-md font-semibold hover:brightness-110 transition-all shadow-[0_0_16px_rgba(128,131,255,0.35)] disabled:opacity-60"
							type="submit"
							formaction="?/saveMqtt"
							disabled={savingMqtt || testingMqtt}
						>
							<i class="fa-solid fa-floppy-disk text-[18px]"></i>
							{savingMqtt ? 'Speichere…' : 'Speichern'}
						</button>
						<button
							class="flex items-center justify-center gap-space-xs px-space-lg h-[38px] rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-label-mono-md text-label-mono-md font-semibold transition-all disabled:opacity-60"
							type="submit"
							formaction="?/testMqtt"
							disabled={savingMqtt || testingMqtt}
						>
							<i class="fa-solid fa-wifi text-[18px]"></i>
							{testingMqtt ? 'Teste…' : 'Verbindung testen'}
						</button>
						{#if form?.mqttSaved}<span class="font-label-mono-xs text-label-mono-xs text-secondary">Änderungen gesichert ✓</span>{/if}
						{#if form?.mqttTestOk}<span class="font-label-mono-xs text-label-mono-xs text-secondary">Verbindung erfolgreich ✓</span>{/if}
					</div>
					{#if form?.mqttTestError}
						<p class="px-space-md py-space-sm rounded-lg bg-error-container text-on-error-container text-body-sm relative z-10">
							Verbindung fehlgeschlagen: {form.mqttTestError}
						</p>
					{/if}
				</form>
			</div>
		</section>

		<!-- Passwort ändern -->
		<section class="col-span-6 2xl:col-span-5 flex flex-col gap-space-lg">
			<div class="bg-surface-container-low rounded-xl p-space-lg shadow-xl relative overflow-hidden">
				<div class="absolute -bottom-24 -left-24 w-48 h-48 bg-primary/10 rounded-full blur-2xl pointer-events-none"></div>

				<div class="flex items-center justify-between mb-space-lg relative z-10">
					<div class="flex items-center gap-space-sm">
						<div class="w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center text-primary">
							<i class="fa-solid fa-key text-[20px]"></i>
						</div>
						<h2 class="font-headline-md text-headline-md text-on-surface">Passwort ändern</h2>
					</div>
					<i class="fa-solid fa-shield-halved text-outline text-[20px]"></i>
				</div>

				{#if form?.passwordError}
					<p class="mb-space-md px-space-md py-space-sm rounded-lg bg-error-container text-on-error-container text-body-sm relative z-10">{form.passwordError}</p>
				{/if}
				{#if form?.passwordChanged}
					<p class="mb-space-md px-space-md py-space-sm rounded-lg bg-emerald-950/30 text-emerald-300 text-body-sm relative z-10">Passwort geändert.</p>
				{/if}

				<form
					method="POST"
					action="?/changePassword"
					use:enhance={() => {
						changingPassword = true;
						return async ({ update }) => {
							changingPassword = false;
							await update();
						};
					}}
					class="flex flex-col gap-space-md relative z-10"
				>
					<!-- Verstecktes Username-Feld nur für Passwortmanager/Screenreader -- BonSync hat
						 nur ein einziges App-Passwort ohne echten Benutzernamen, aber Browser erwarten
						 aus Barrierefreiheits-/Autofill-Gründen ein (ggf. verstecktes) Username-Feld vor
						 den Passwortfeldern. -->
					<input type="text" name="username" autocomplete="username" value="bonsync" class="sr-only" tabindex="-1" aria-hidden="true" />
					<div class="flex flex-col gap-space-xs">
						<label class="font-label-mono-sm text-label-mono-sm text-on-surface font-medium" for="current-password">Aktuelles Passwort</label>
						<div class="relative">
							<input
								id="current-password"
								name="currentPassword"
								class="w-full h-[38px] bg-surface-container-lowest text-on-surface font-label-mono-md text-label-mono-md px-space-md pr-10 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-outline transition-all"
								type={showCurrent ? 'text' : 'password'}
								autocomplete="current-password"
								required
							/>
							<button type="button" class="absolute right-2.5 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface transition-colors" onclick={() => (showCurrent = !showCurrent)} aria-label={showCurrent ? 'Passwort verbergen' : 'Passwort anzeigen'}>
								<i class="fa-regular {showCurrent ? 'fa-eye-slash' : 'fa-eye'} text-[18px]"></i>
							</button>
						</div>
					</div>
					<div class="flex flex-col gap-space-xs">
						<label class="font-label-mono-sm text-label-mono-sm text-on-surface font-medium" for="new-password">Neues Passwort</label>
						<div class="relative">
							<input
								id="new-password"
								name="newPassword"
								class="w-full h-[38px] bg-surface-container-lowest text-on-surface font-label-mono-md text-label-mono-md px-space-md pr-10 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-outline transition-all"
								type={showNew ? 'text' : 'password'}
								autocomplete="new-password"
								minlength="8"
								required
							/>
							<button type="button" class="absolute right-2.5 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface transition-colors" onclick={() => (showNew = !showNew)} aria-label={showNew ? 'Passwort verbergen' : 'Passwort anzeigen'}>
								<i class="fa-regular {showNew ? 'fa-eye-slash' : 'fa-eye'} text-[18px]"></i>
							</button>
						</div>
					</div>
					<div class="flex flex-col gap-space-xs">
						<label class="font-label-mono-sm text-label-mono-sm text-on-surface font-medium" for="confirm-password">Neues Passwort bestätigen</label>
						<div class="relative">
							<input
								id="confirm-password"
								name="confirmPassword"
								class="w-full h-[38px] bg-surface-container-lowest text-on-surface font-label-mono-md text-label-mono-md px-space-md pr-10 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-outline transition-all"
								type={showConfirm ? 'text' : 'password'}
								autocomplete="new-password"
								minlength="8"
								required
							/>
							<button type="button" class="absolute right-2.5 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface transition-colors" onclick={() => (showConfirm = !showConfirm)} aria-label={showConfirm ? 'Passwort verbergen' : 'Passwort anzeigen'}>
								<i class="fa-regular {showConfirm ? 'fa-eye-slash' : 'fa-eye'} text-[18px]"></i>
							</button>
						</div>
					</div>
					<div class="pt-space-md">
						<button
							class="w-full flex items-center justify-center gap-space-xs px-space-lg h-[38px] rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface hover:text-primary font-label-mono-sm text-label-mono-sm font-medium transition-all shadow-[0_1px_4px_rgba(0,0,0,0.15)] disabled:opacity-60"
							type="submit"
							disabled={changingPassword}
						>
							<i class="fa-solid fa-key text-[16px]"></i>
							{changingPassword ? 'Ändere…' : 'Passwort ändern'}
						</button>
					</div>
				</form>
			</div>

			<div class="bg-surface-container-lowest/60 rounded-xl p-space-md shadow-sm flex items-start gap-space-sm">
				<i class="fa-solid fa-user-shield text-outline text-[18px] shrink-0 mt-0.5"></i>
				<div class="flex flex-col gap-0.5">
					<span class="font-label-mono-xs text-label-mono-xs font-semibold text-on-surface">Lokale Authentifizierung</span>
					<p class="font-body-sm text-body-sm text-outline">
						Passwörter werden lokal über scrypt-Hashes gesichert. Für Single-User-Installationen wird keine externe Cloud-Autorisierung benötigt.
					</p>
				</div>
			</div>
		</section>
	</div>
</div>
