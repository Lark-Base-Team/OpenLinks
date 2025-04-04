import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    open: true,
    proxy: {
      '/api': {
        target: 'https://www.ccai.fun',
        changeOrigin: true
      }
    }
  },
  optimizeDeps: {
    include: ['xlsx']
  }
})
