import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const useHttps = process.env.VITE_DEV_HTTPS === 'true';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    https: useHttps,
    proxy: {
      '/api': {
        target: 'https://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
