<script lang="ts">
	import { enhance } from '$app/forms';
	let { form } = $props();
</script>

<svelte:head><title>Anmelden — BonSync</title></svelte:head>

<div class="login-shell">
	<div class="login-card">
		<div class="brand">
			<div class="brand-mark"><img src="/logos/bonsync.png" alt="BonSync" /></div>
			<div class="brand-text"><b>BonSync</b><span>KASSENBON&nbsp;HUB</span></div>
		</div>
		{#if form?.error}
			<p class="alert error">{form.error}</p>
		{/if}
		<form method="POST" use:enhance>
			<!-- Verstecktes Username-Feld nur für Passwortmanager/Screenreader -- BonSync hat nur
				 ein einziges App-Passwort ohne echten Benutzernamen. -->
			<input type="text" name="username" autocomplete="username" value="bonsync" class="sr-only" tabindex="-1" aria-hidden="true" />
			<div class="field">
				<label for="password">Passwort</label>
				<!-- svelte-ignore a11y_autofocus -->
				<input id="password" name="password" type="password" autocomplete="current-password" required autofocus />
			</div>
			<button class="btn primary" type="submit" style="justify-content:center;">Anmelden</button>
		</form>
	</div>
</div>
