import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// Local dev: Vite (5173) proxies API + media to wrangler dev (8787).
// Cookies are scoped to host (localhost), ports do not matter.
// The host portal (F10) is http://host.localhost:5173: the proxy keeps the Host
// header, so the Worker sees the host site.
export default defineConfig(({ mode }) => ({
  plugins: [vue()],
  define: {
    __VUE_OPTIONS_API__: false,
    // Where the host portal lives. A production build points at the real host
    // site; otherwise the app works it out from its own address (site.js).
    __HOST_ORIGIN__: JSON.stringify(process.env.VITE_HOST_ORIGIN ?? (mode === 'production' ? 'https://host.lanyd.fyi' : '')),
  },
  server: {
    allowedHosts: ['host.localhost'],
    // changeOrigin: false keeps the browser's Host header (host.localhost or
    // localhost), which is how the Worker tells the two sites apart.
    proxy: {
      '/api': { target: 'http://localhost:8787', changeOrigin: false },
      '/media': { target: 'http://localhost:8787', changeOrigin: false },
    },
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 120,
  },
}))
