import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { composeSource } from '../engine/source.js';
import type { RenderRequest, RenderResult } from '../shared/types.js';
import { extractParts } from './csg.js';
import { assertFeaturesFitParts, assertNoGeometryWarnings, assertSelfContained } from './validation.js';

export const projectRoot = fileURLToPath(new URL('../..', import.meta.url));
let active = false;
export async function executablePath(): Promise<string> {
  if (process.env.OPENSCAD_BIN) return process.env.OPENSCAD_BIN;
  try { return JSON.parse(await readFile(join(projectRoot, '.runtime/config.json'), 'utf8')).executable; }
  catch { return process.platform === 'win32' ? 'openscad.com' : 'openscad'; }
}

export async function runOpenSCAD(executable: string, args: string[], cwd: string, timeout = 90000): Promise<string> {
  return new Promise((done, reject) => {
    const child = spawn(executable, args, { cwd, windowsHide: true, shell: false });
    let log = '', ended = false, stopping: Error | undefined, stoppingTree = false;
    const finish = (error?: Error) => { if (ended) return; ended = true; clearTimeout(timer); error ? reject(error) : done(log); };
    const stop = (error: Error) => {
      if (ended || stopping) return;
      stopping = error;
      clearTimeout(timer);
      if (process.platform === 'win32' && child.pid && child.exitCode === null) {
        // The official .com launcher starts openscad.exe as a child. Terminate
        // this invocation's tree, never all OpenSCAD processes by image name.
        stoppingTree = true;
        const killer = spawn(join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe'),
          ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, shell: false, stdio: 'ignore' });
        killer.once('error', () => {
          stoppingTree = false;
          finish(new Error(`${error.message} Windows could not stop render process ${child.pid}. Close that process before retrying.`));
        });
        killer.once('close', code => {
          stoppingTree = false;
          finish(code !== 0 && child.exitCode === null
            ? new Error(`${error.message} Windows could not stop render process ${child.pid}. Close that process before retrying.`)
            : error);
        });
      } else if (!child.kill()) finish(error);
    };
    const timer = setTimeout(() => stop(new Error(`OpenSCAD took longer than ${Math.round(timeout / 1000)} seconds. Simplify the model or reduce resolution ($fn), then try again.`)), timeout);
    child.on('error', () => finish(new Error('OpenSCAD could not start. Run npm run setup, or set OPENSCAD_BIN to your OpenSCAD executable.')));
    const capture = (chunk: Buffer) => { if (stopping || ended) return; log += chunk.toString(); if (log.length > 2_000_000) stop(new Error('The model produced too much diagnostic output. Remove large echo loops.')); };
    child.stdout.on('data', capture); child.stderr.on('data', capture);
    child.on('close', code => {
      if (stopping) { if (!stoppingTree) finish(stopping); return; }
      if (code !== 0 || /^ERROR:/m.test(log)) finish(new Error(cleanLog(log) || `OpenSCAD stopped (code ${code}). Check the source syntax.`));
      else {
        try { assertNoGeometryWarnings(log); finish(); }
        catch (error) { finish(error as Error); }
      }
    });
  });
}
function cleanLog(log: string) { return log.split(/\r?\n/).filter(line => !line.startsWith('ECHO: "SCADLATCH"')).join('\n').trim().slice(-6000); }

export async function renderProject(request: RenderRequest): Promise<RenderResult> {
  if (active) throw new Error('A model is already rendering. Wait for it to finish before rendering again.');
  assertSelfContained(request.source);
  active = true;
  const started = performance.now();
  let dir: string | undefined;
  try {
    const traced = composeSource(request.source, request.features, { trace: true });
    const exportSource = composeSource(request.source, request.features, { trace: false });
    dir = await mkdtemp(join(tmpdir(), 'scadlatch-'));
    await writeFile(join(dir, 'model.scad'), traced);
    const executable = await executablePath();
    const csgLog = await runOpenSCAD(executable, ['-o', 'model.csg', 'model.scad'], dir);
    const csg = await readFile(join(dir, 'model.csg'), 'utf8');
    const { parts, diagnostics } = extractParts(csg, csgLog);
    assertFeaturesFitParts(request.features, parts);
    // Use clean exported source for the actual printable result (no preview modifiers).
    await writeFile(join(dir, 'export.scad'), exportSource);
    const stlLog = await runOpenSCAD(executable, ['--export-format', 'asciistl', '-o', 'model.stl', 'export.scad'], dir);
    const stl = await readFile(join(dir, 'model.stl'), 'utf8');
    const triangles = (stl.match(/facet normal/g) ?? []).length;
    if (!stl.startsWith('solid') || triangles < 4 || !stl.includes('endsolid')) throw new Error('OpenSCAD did not produce a nonempty 3D solid. Check that the source creates valid 3D geometry.');
    for (const line of `${csgLog}\n${stlLog}`.split(/\r?\n/)) {
      if (/^(WARNING:|ERROR:)/.test(line) && !diagnostics.includes(line)) diagnostics.push(line);
    }
    return { stl, parts, diagnostics, durationMs: Math.round(performance.now() - started), exportSource };
  } finally {
    try {
      if (dir && resolve(dir).startsWith(resolve(tmpdir()) + sep) && dir.includes('scadlatch-')) await rm(dir, { recursive: true, force: true });
    } finally { active = false; }
  }
}
