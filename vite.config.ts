import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Relative base so the build works under any path (GitHub Pages, e2b previews, VPS subfolders).
  base: './',
  // The Arena preview proxies the app under an e2b.app subdomain; allow it.
  server: { host: '0.0.0.0', port: 5173, allowedHosts: true },
  preview: { host: '0.0.0.0', port: 4173, allowedHosts: true },
  build: { target: 'es2020' },
});
