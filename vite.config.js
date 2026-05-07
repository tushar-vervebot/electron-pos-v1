import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  // Electron renderer process — no server, just static files
  base: './',

  root: path.resolve(__dirname, 'src'),

  build: {
    outDir: path.resolve(__dirname, 'src/dist'),
    emptyOutDir: true,
    // Keep chunks reasonable for Electron (no CDN, all local)
    rollupOptions: {
      input: path.resolve(__dirname, 'src/index.html'),
    },
  },

  resolve: {
    alias: {
      '@core':    path.resolve(__dirname, 'src/core'),
      '@plugins': path.resolve(__dirname, 'src/plugins'),
    },
  },

  // Dev server — used when running `npm run renderer:dev`
  server: {
    port: 5173,
    strictPort: true,
  },

  css: {
    postcss: {
      plugins: [
        require('tailwindcss'),
        require('autoprefixer'),
      ],
    },
  },
});
