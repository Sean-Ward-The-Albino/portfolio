import { defineConfig } from 'vite';

// In development Vite serves the front end on :5173 and passes /api to Spring Boot on :8080.
export default defineConfig({
  server: { port: 5173, fs: { allow: ['..'] }, proxy: { '/api': { target: 'http://localhost:8080', changeOrigin: false } } },
  build: {
    target: 'es2022',
    rollupOptions: { input: { main: 'index.html', admin: 'admin.html' } },
    chunkSizeWarningLimit: 900,
  },
});
