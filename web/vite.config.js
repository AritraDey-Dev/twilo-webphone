import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev: Vite serves the UI on :5173 and proxies the API/webhooks to Express on :3000,
// so cookies stay same-origin and SSE streams through.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/voice': 'http://localhost:3000',
      '/sms': 'http://localhost:3000',
      '/events': 'http://localhost:3000',
    },
  },
});
