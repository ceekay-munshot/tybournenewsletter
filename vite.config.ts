import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Static SPA for Cloudflare Pages: `npm run build` -> dist/
// `base: './'` keeps asset paths relative so it works at any mount path.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
});
