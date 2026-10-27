import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// Local dev: Vite (5173) proxies API + media to wrangler dev (8787).
// Cookies are scoped to host (localhost), ports do not matter.
export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      '/api': 'http://localhost:8787',
      '/media': 'http://localhost:8787',
    },
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 120,
  },
})
