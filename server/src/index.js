// Local entry point: starts the API on PORT (default 4100).
// The routes live in app.js so Vercel can reuse them without app.listen().
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import app from './app.js';

// Optional: serve the built frontend (client/dist) from the same server.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

const port = Number(process.env.PORT) || 4100;
app.listen(port, () => console.log(`VieMeal API running on http://localhost:${port}`));
