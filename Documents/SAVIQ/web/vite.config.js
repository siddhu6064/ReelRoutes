import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../shared'),
    },
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
    allowedHosts: 'all',   // Allow any host during development; restrict via reverse proxy in production
  }
})
