import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { renderProject } from '../src/server/runtime.js';
import type { Feature } from '../src/shared/types.js';
import { triangleSet, volume } from './mesh-checks.js';

const roundedSource = (width: number) => `
width=${width}; depth=30; height=20; wall=2; radius=3; $fn=32;
module rounded(w,d,h) {
  hull() for(x=[radius,w-radius],y=[radius,d-radius])
    translate([x,y,0]) cylinder(r=radius,h=h);
}
module tray(w,d,h) {
  difference(){ rounded(w,d,h); translate([wall,wall,wall])cube([w-2*wall,d-2*wall,h]); }
}
translate([-width-10,0,0])tray(width,depth,height);
translate([10,0,0])tray(width,depth,height);
`;
const out = resolve('.cache/compound-workflow'); await mkdir(out, { recursive: true });
const observations: object[] = [];
let selected: Feature | undefined;
for (const width of [50, 80]) {
  const source = roundedSource(width);
  const original = await renderProject({ source, features: [] });
  const target = original.parts.find(p => p.kind === 'hull' && p.editable && p.matrix[12] < 0);
  assert(target, 'Rounded tray body must be selectable.');
  selected ??= { primitiveId: target.primitiveId, route: target.route, anchor: 'origin', face: 'x+', kind: 'rectangle', u: 15, v: 10, width: 10, height: 6, diameter: 4, depth: 4 };
  const edited = await renderProject({ source, features: [selected] });
  const removed = volume(original.stl) - volume(edited.stl);
  assert(Math.abs(removed - 120) < 0.02, `Expected only a 10×6 opening through one 2mm wall, got ${removed}.`);
  assert.deepEqual(triangleSet(original.stl, v => v[0] >= 10), triangleSet(edited.stl, v => v[0] >= 10), 'The other explicit instance must remain identical.');
  await writeFile(resolve(out, `rounded-${width}.scad`), edited.exportSource);
  await writeFile(resolve(out, `rounded-${width}.stl`), edited.stl);
  observations.push({ model: 'two rounded trays', width, removedVolume: removed, renderMs: edited.durationMs });
}

const standSource = (width: number) => `
width=${width};
rotate([15,0,30]) linear_extrude(height=width,center=true)
  polygon([[0,0],[60,0],[60,4],[4,4],[4,35],[0,35]]);
`;
selected = undefined;
for (const width of [32, 48]) {
  const source = standSource(width);
  const original = await renderProject({ source, features: [] });
  const target = original.parts.find(p => p.kind === 'linear_extrude' && p.editable);
  assert(target, 'The complete rotated, extruded profile must be selectable.');
  selected ??= { primitiveId: target.primitiveId, route: target.route, anchor: 'origin', face: 'z+', kind: 'circle', u: 30, v: 2, width: 2, height: 2, diameter: 2, depth: 6 };
  const edited = await renderProject({ source, features: [selected] });
  const removed = volume(original.stl) - volume(edited.stl);
  // The 64-sided cylinder approximates a circle; rotated STL vertices are rounded.
  assert(Math.abs(removed - Math.PI * 6) < 0.1, `The blind hole must follow the moving end face, got ${removed}.`);
  await writeFile(resolve(out, `extrusion-${width}.scad`), edited.exportSource);
  await writeFile(resolve(out, `extrusion-${width}.stl`), edited.stl);
  observations.push({ model: 'rotated extruded profile', width, removedVolume: removed, renderMs: edited.durationMs });
}
console.log(JSON.stringify({ result: 'passed', observations, outputs: out }, null, 2));
