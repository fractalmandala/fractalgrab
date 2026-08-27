import { sveltekit } from '@sveltejs/kit/vite';
import { fractalsStyler } from 'fractals-styler';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [fractalsStyler(), sveltekit()],
	optimizeDeps: {
		exclude: ['fractals-styler']
	},
	clearScreen: false,
	server: {
		port: 5173,
		strictPort: true
	},
	envPrefix: ['VITE_', 'TAURI_'],
	build: {
		// Tauri uses Chromium on Windows and WebKit on macOS and Linux
		target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
		minify: !process.env.TAURI_ENV_DEBUG ? 'esbuild' : false,
		sourcemap: !!process.env.TAURI_ENV_DEBUG
	}
});
