import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // Linked TS-source workspace package; let Vite transform it directly.
    exclude: ['@punters/shared'],
  },
  server: {
    port: 5174,
    proxy: {
      '/api': 'http://localhost:4000',
      '/media': 'http://localhost:4000',
      '/socket.io': { target: 'http://localhost:4000', ws: true },
    },
  },
})
