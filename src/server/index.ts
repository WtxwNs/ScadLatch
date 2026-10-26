import express from 'express';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createServer as createViteServer } from 'vite';
import { executablePath, projectRoot, renderProject, runOpenSCAD } from './runtime.js';
import type { Feature, RenderRequest } from '../shared/types.js';

const port = Number(process.env.PORT || 4173);
const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
  const origin = req.get('origin'), host = req.get('host');
  if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(host ?? '') || (origin && ![`http://127.0.0.1:${port}`, `http://localhost:${port}`].includes(origin))) {
    res.status(403).json({ error: 'ScadLatch accepts requests from its own local page only.' }); return;
  }
  next();
});
app.use(express.json({ limit: '1mb' }));
app.get('/api/health', async (_req, res) => {
  try {
    const version = await runOpenSCAD(await executablePath(), ['--version'], projectRoot, 10000);
    res.json({ ok: true, version: version.trim() });
  } catch (error) { res.status(503).json({ ok: false, error: (error as Error).message }); }
});
app.get('/api/examples', async (_req, res, next) => {
  try {
    const examples = [
      ['Cable tray', 'Add a cable opening. Change the width. The opening follows the wall.', 'cable-tray.scad'],
      ['Rounded shell', 'Keep the rounded body. Add a port to its flat outer wall.', 'rounded-shell.scad'],
      ['Twin housings', 'Two instances, one source module. Modify only the one you pick.', 'twin-housings.scad'],
      ['Mounting plate', 'A through hole on a centred, parameter-driven plate.', 'mounting-plate.scad'],
    ];
    res.json(await Promise.all(examples.map(async ([name, description, file]) => ({ name, description, source: await readFile(join(projectRoot, 'examples', file), 'utf8') }))));
  } catch (error) { next(error); }
});
function validate(body: unknown): RenderRequest {
  if (!body || typeof body !== 'object') throw new Error('Expected a source file and a list of edits.');
  const input = body as RenderRequest;
  if (typeof input.source !== 'string' || !input.source.trim() || input.source.length > 250000) throw new Error('Choose a nonempty .scad file under 250 KB.');
  if (!Array.isArray(input.features) || input.features.length > 50) throw new Error('A project can contain up to 50 edits.');
  for (const f of input.features as Feature[]) {
    if (!f || typeof f.primitiveId !== 'string' || !/^n\d+$/.test(f.primitiveId) || typeof f.route !== 'string' || !/^(\/n\d+)+$/.test(f.route)) throw new Error('Invalid edit target. Load a project saved by ScadLatch.');
    if (!['x+', 'x-', 'y+', 'y-', 'z+', 'z-'].includes(f.face) || !['circle', 'rectangle'].includes(f.kind)) throw new Error('Unsupported face or opening type.');
    if (f.anchor !== undefined && !['edge', 'origin'].includes(f.anchor)) throw new Error('Unsupported placement rule. Select the face again.');
    for (const field of ['u', 'v', 'width', 'height', 'diameter', 'depth'] as const) {
      const minimum = f.anchor === 'origin' && (field === 'u' || field === 'v') ? -10000 : 0;
      if (typeof f[field] !== 'number' || !Number.isFinite(f[field]) || f[field] < minimum || f[field] > 10000) throw new Error(`Invalid ${field}: use local millimetres between ${minimum} and 10,000.`);
    }
    if (f.width <= 0 || f.height <= 0 || f.diameter <= 0) throw new Error('Opening dimensions must be greater than zero.');
  }
  return input;
}
app.post('/api/render', async (req, res) => {
  try { res.json(await renderProject(validate(req.body))); }
  catch (error) { res.status(422).json({ error: (error as Error).message }); }
});
if (process.argv.includes('--production')) app.use(express.static(join(projectRoot, 'dist')));
else {
  const vite = await createViteServer({ root: projectRoot, server: { middlewareMode: true, hmr: { host: '127.0.0.1', port: port + 1 } }, appType: 'spa' });
  app.use(vite.middlewares);
}
app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(400).json({ error: error.message || 'Could not process the request.' });
});
const server = app.listen(port, '127.0.0.1', () => console.log(`ScadLatch → http://127.0.0.1:${port}`));
server.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
