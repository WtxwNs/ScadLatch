import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { renderProject } from '../src/server/runtime.js';
import type { Feature } from '../src/shared/types.js';

const source = await readFile(new URL('../examples/cable-tray.scad', import.meta.url), 'utf8');
const base = await renderProject({ source, features: [] });
assert(base.parts.some(p => p.editable), 'Tray needs an editable actual face.');
const part = base.parts.find(p => p.editable)!;
const feature: Feature = { primitiveId: part.primitiveId, route: part.route, face: 'x+', kind: 'rectangle', u: 35, v: 18, width: 22, height: 12, diameter: 12, depth: 6 };
const edited = await renderProject({ source, features: [feature] });
const resized = await renderProject({ source: source.replace('width = 100', 'width = 140'), features: [feature] });
function volume(stl: string) {
  const vertices = [...stl.matchAll(/vertex\s+([-\d.e+]+)\s+([-\d.e+]+)\s+([-\d.e+]+)/gi)].map(m => m.slice(1).map(Number));
  let sum = 0;
  for (let i = 0; i < vertices.length; i += 3) {
    const [a, b, c] = vertices.slice(i, i + 3);
    sum += a[0] * (b[1] * c[2] - b[2] * c[1]) + a[1] * (b[2] * c[0] - b[0] * c[2]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
  }
  return Math.abs(sum / 6);
}
const cut = volume(base.stl) - volume(edited.stl);
assert(Math.abs(cut - 22 * 12 * 4) < 0.1, `Only the chosen 4 mm wall must be cut, volume delta ${cut}`);
const resizedBase = await renderProject({ source: source.replace('width = 100', 'width = 140'), features: [] });
assert(Math.abs(volume(resizedBase.stl) - volume(resized.stl) - cut) < 0.1, 'Resizing must preserve the complete wall opening.');
assert.match(edited.exportSource, /__scadlatch_raw=\(\[w, d, h\]\)/, 'Export must use the original dimension expression.');
const out = resolve('.cache/workflow'); await mkdir(out, { recursive: true });
await writeFile(resolve(out, 'tray-edited.scad'), edited.exportSource);
await writeFile(resolve(out, 'tray-edited.stl'), edited.stl);
await writeFile(resolve(out, 'tray-resized.scad'), resized.exportSource);
await writeFile(resolve(out, 'tray-resized.stl'), resized.stl);
console.log(JSON.stringify({ result: 'passed', originalVolume: volume(base.stl), cutVolume: cut, resizedWidth: resized.parts[0].size[0], milliseconds: [base, edited, resized, resizedBase].map(r => r.durationMs), outputs: out }, null, 2));
