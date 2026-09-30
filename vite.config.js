import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    rollupOptions: {
      // Charts are the heaviest dependency; keep them in their own cached chunk.
      output: { manualChunks: { vendor: ['react', 'react-dom', 'react-router-dom'], charts: ['recharts'] } },
    },
  },
  server: { port: 5173 },
});
