import { defineConfig } from 'vite';

/* Serves preview/index.html against the embed source, so the tuner runs the
   same code path the built bundle does. */
export default defineConfig({
  server: { port: 5179, strictPort: true, open: '/preview/' },
});
