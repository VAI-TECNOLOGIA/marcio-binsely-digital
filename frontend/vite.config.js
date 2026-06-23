import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Em desenvolvimento, faz proxy de /api e /uploads para o backend (porta 4000),
// evitando CORS e mantendo o front consumindo caminhos relativos.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
      '/uploads': { target: 'http://localhost:4000', changeOrigin: true },
    },
  },
});
