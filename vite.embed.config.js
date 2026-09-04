import { defineConfig } from 'vite';
import { resolve } from 'node:path';

/* Single self-contained IIFE for the Webflow embed: three.js bundled in, no
   React, no module loader, nothing for the page to resolve. */
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: resolve(process.cwd(), 'src/embed/index.js'),
      name: 'PrismBolt',
      formats: ['iife'],
      fileName: () => 'prism-bolt.min.js',
    },
    rollupOptions: { output: { extend: true } },
    target: 'es2019',
    minify: 'terser',
    terserOptions: { compress: { passes: 2 }, format: { comments: false } },
  },
});
