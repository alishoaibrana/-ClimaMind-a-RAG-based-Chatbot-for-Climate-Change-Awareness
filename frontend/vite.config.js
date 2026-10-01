import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    // Required: serve index.html for all routes so React handles /auth/callback
    historyApiFallback: true,
  },
});
