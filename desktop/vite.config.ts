import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  build: {
    outDir: path.join(__dirname, 'dist'),
    emptyOutDir: true,
    lib: {
      entry: path.join(__dirname, 'src/main.ts'),
      formats: ['cjs'],
      fileName: 'main'
    },
    rollupOptions: {
      external: [
        'electron', 
        'electron-store', 
        'active-win'
      ],
      output: {
        inlineDynamicImports: true,
      },
    },
    ssr: true,  // This tells Vite this is a Node.js build
  },
  resolve: {
    alias: {
      '@': path.join(__dirname, 'src'),
    },
  },
});
