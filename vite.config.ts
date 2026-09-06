import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { pwa } from './scripts/pwa.ts';

export default defineConfig({
  plugins: [preact(), pwa()],
  // Relative asset URLs work on both user.github.io and user.github.io/repo/.
  base: './',
  build: { license: { fileName: 'licenses.md' } },
});
