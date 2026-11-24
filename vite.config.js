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
    // F54.0: with preloading on, the entry lists every lazy chunk and its imports by hashed file name (about 2.7 KB raw,
    // about 1.4 KB gzip, and it grows with each new chunk), and every public page downloads that list. Off, the list keeps only
    // the CSS files (a lazy chunk's styles still load with it); a lazy chunk's own imports start once the chunk has arrived.
    modulePreload: false,
    chunkSizeWarningLimit: 120,
  },
}))
