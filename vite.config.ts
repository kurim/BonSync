// Muss vor allen anderen Imports laufen -- lädt .env in process.env für den Dev-Server
// (Vite exponiert .env sonst nur als import.meta.env, nicht process.env; der Docker-Build
// bekommt seine Variablen direkt vom Container, ist also davon nicht betroffen).
import 'dotenv/config';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	server: {
		port: 5173
	}
});
