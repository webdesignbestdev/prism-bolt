/* Zero-dependency static server for previewing the bolt locally.

     node serve.mjs                    http://localhost:5190
     node serve.mjs --port 8080
     node serve.mjs --shots ./stills   also accept POST /__shot?name=x.png and
                                       write the PNG body into that folder

   ES modules and the import map need http://, so file:// will not do. */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const port = Number(arg('--port', 5190));
const shots = arg('--shots', null);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

http
  .createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');

    if (req.method === 'POST' && url.pathname === '/__shot') {
      if (!shots) return res.writeHead(404).end('start with --shots <dir>');
      const name = path.basename(url.searchParams.get('name') || `shot-${Date.now()}.png`).replace(/[^\w.-]/g, '_');
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        fs.mkdirSync(shots, { recursive: true });
        const file = path.join(shots, name.endsWith('.png') ? name : `${name}.png`);
        fs.writeFileSync(file, Buffer.concat(chunks));
        res.writeHead(200).end(file);
      });
      return;
    }

    let file = path.normalize(path.join(root, decodeURIComponent(url.pathname)));
    if (!file.startsWith(root)) return res.writeHead(403).end();
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');

    fs.readFile(file, (err, data) => {
      if (err) return res.writeHead(404).end('Not found');
      res.writeHead(200, {
        'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(data);
    });
  })
  .listen(port, () => console.log(`glass-bolt  http://localhost:${port}`));
