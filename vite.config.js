import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';

/* Press S in the page to drop a full-resolution still into ./shots. */
function shotSaver() {
  return {
    name: 'shot-saver',
    configureServer(server) {
      server.middlewares.use('/_shot', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; return res.end(); }
        const name = path.basename(new URL(req.url, 'http://x').searchParams.get('name') || 'shot.png');
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => {
          const b64 = Buffer.concat(chunks).toString('utf8').replace(/^data:image\/png;base64,/, '');
          const dir = path.resolve(process.cwd(), 'shots');
          fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(path.join(dir, name), Buffer.from(b64, 'base64'));
          res.end('ok ' + name);
        });
      });
    },
  };
}

export default defineConfig({
  /* Not dist/.  dist/ holds the committed embed bundle that jsDelivr serves,
     and vite empties its outDir on every build -- so a plain `npm run build`
     here would quietly delete the file the live site loads. */
  build: { outDir: 'dist-app' },
  plugins: [react(), shotSaver()],
  server: { port: 5178, strictPort: true },
});
