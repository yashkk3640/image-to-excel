import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// `base` must match the GitHub Pages project path (https://<user>.github.io/image-to-excel/).
// Change it if you rename the repository or deploy at a different path.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/image-to-excel/' : '/',
  plugins: [svelte()],
  worker: { format: 'es' },
}));
