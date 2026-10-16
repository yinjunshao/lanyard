import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// Local dev: the Vue dev server (5173) proxies API calls to wrangler dev (8787).
export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      '/api': 'http://localhost:8787',
      '/session': 'http://localhost:8787',
    },
  },
})