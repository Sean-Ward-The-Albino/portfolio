import { defineConfig } from 'vite';

// In development Vite serves the front end on :5173 and passes /api to Spring Boot on :8080.
export default defineConfig({
  server: { port: 5173, fs: { allow: ['..'] }, proxy: { '/api': { target: 'http://localhost:8080', changeOrigin: false, ws: true } } },
  build: {
    target: 'es2022',
    // three.js gets its own file: it rarely changes, so browsers and Cloudflare keep it across deploys
    rollupOptions: { input: { main: 'index.html', admin: 'admin.html' }, output: { manualChunks: (id) => (id.includes('node_modules/three') ? 'three' : undefined) } },
    chunkSizeWarningLimit: 900,
  },
});
