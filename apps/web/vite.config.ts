import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // En dev, l'API Fastify (catalogue, decks, proxy d'images) tourne sur :3001.
      '/api': 'http://localhost:3001',
      '/img': 'http://localhost:3001',
    },
  },
});
