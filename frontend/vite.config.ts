import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Название портала по умолчанию (переопределяется VITE_APP_NAME в .env или при сборке)
process.env.VITE_APP_NAME ||= 'ННГАСУ';

const API =process.env.VITE_API_PROXY ?? 'http://localhost:4000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: API, changeOrigin: true },
      '/socket.io': { target: API, ws: true, changeOrigin: true },
    },
  },
});
