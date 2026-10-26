import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { analyseSource, composeSource, routeColorKey, SourceError } from './source.js';
import type { Feature } from '../shared/types.js';

const feature = (primitiveId: string, route: string, change: Partial<Feature> = {}): Feature => ({
  primitiveId, route, face: 'z+', kind: 'circle', u: 5, v: 6,
  width: 4, height: 3, diameter: 2, depth: 0, ...change,
});

test('preserves complete symbolic expressions, comments and source ranges', () => {
  const source = '// dimensions\nw=20; margin=2; useCenter=true;\ntranslate([10,0,0]) cube(size=[w + margin*2, max(w/2,7), 5], center=useCenter && w>0);\n';
  const { primitives } = analyseSource(source);
  assert.equal(primitives.length, 1);
  assert.equal(primitives[0].sizeExpression, '[w + margin*2, max(w/2,7), 5]');
  assert.equal(primitives[0].centerExpression, 'useCenter && w>0');
  assert.equal(source.slice(primitives[0].sourceRange.start, primitives[0].sourceRange.end),
    'cube(size=[w + margin*2, max(w/2,7), 5], center=useCenter && w>0);');
  const result = composeSource(source, [feature(primitives[0].id, '/n0/n1')]);
  assert.ok(result.includes('// dimensions\nw=20; margin=2; useCenter=true;'));
  assert.ok(result.includes('__scadlatch_raw=([w + margin*2, max(w/2,7), 5])'));
  assert.ok(result.includes('__scadlatch_center=(useCenter && w>0)'));
  assert.ok(result.includes('__scadlatch_depth=__scadlatch_size[2]'));
  assert.ok(!result.includes('color('));
  assert.ok(!result.includes('echo('));
});

test('scalar cube dimensions and positional center retain their original expressions', () => {
  const primitive = analyseSource('s=10; cube(s*2, true);').primitives[0];
  assert.equal(primitive.sizeExpression, 's*2');
  assert.equal(primitive.centerExpression, 'true');
  const output = composeSource('s=10; cube(s*2, true);', [feature('n0', '/n0', { face: 'x-', kind: 'rectangle', depth: 3 })]);
  assert.ok(output.includes('__scadlatch_lo=__scadlatch_center?-__scadlatch_size/2:[0,0,0]'));
  assert.ok(output.includes('translate([__scadlatch_lo[0]+__scadlatch_depth/2,__scadlatch_lo[1]+5,__scadlatch_lo[2]+6])'));
  assert.ok(output.includes('cube([__scadlatch_depth+0.04,4,3],center=true)'));
});

test('numbering stays the same when dimensions change, and loop membership is explicit', () => {
  const first = analyseSource('w=20; module box(){cube([w,10,5]);} box(); translate([30,0,0])box();');
  const second = analyseSource('w=2000; module box(){cube([w,10,5]);} box(); translate([3000,0,0])box();');
  assert.equal(first.primitives[0].id, second.primitives[0].id);
  assert.equal(analyseSource('for(i=[0:2])translate([i*20,0,0])cube(10);').primitives[0].inLoop, true);
});

test('rejects invalid syntax and stale or invalid selections before producing source', () => {
  assert.throws(() => analyseSource('cube([1,2,);'), SourceError);
  assert.throws(() => composeSource('cube(10);', [feature('n8', '/n8')]), /no longer/);
  assert.throws(() => composeSource('cube(10);', [feature('n0', '/n1')]), /route is invalid/);
  assert.throws(() => composeSource('cube(10);', [feature('n0', '/n0', { u: NaN })]), /finite number/);
  assert.throws(() => composeSource('cube(10);', [feature('n0', '/n0', { diameter: -1 })]), /greater than zero/);
  assert.throws(() => analyseSource('module cube(x){sphere(x);}cube(5);'), /own cube module/);
  assert.throws(() => analyseSource('module __scadlatch_user(){cube(1);}'), /reserved/);
});

const configPath = resolve('.runtime/config.json');
const executable: string | undefined = process.env.OPENSCAD_BIN || (existsSync(configPath)
  ? (JSON.parse(readFileSync(configPath, 'utf8')) as { executable: string }).executable : undefined);
const native = { skip: executable ? false : 'Run npm run setup (or set OPENSCAD_BIN) for native source-evaluation checks.' };

function evaluate(source: string, format: 'csg' | 'stl' = 'csg'): { csg: string; log: string } {
  assert.ok(executable);
  const directory = mkdtempSync(join(tmpdir(), 'scadlatch-source-test-'));
  try {
    const input = join(directory, 'input.scad');
    const output = join(directory, `output.${format}`);
    writeFileSync(input, source, 'utf8');
    const result = spawnSync(executable, [...(format === 'stl' ? ['--export-format', 'asciistl'] : []), '-o', output, input], { encoding: 'utf8', windowsHide: true, timeout: 30000 });
    assert.equal(result.status, 0, result.stderr || result.error?.message);
    assert.ok(existsSync(output), 'OpenSCAD did not create a CSG output');
    assert.doesNotMatch(result.stderr, /ERROR:|WARNING:/);
    return { csg: readFileSync(output, 'utf8'), log: result.stdout + result.stderr };
  } finally {
    // Delete only the exact temporary directory created by this test.
    assert.equal(resolve(dirname(directory)), resolve(tmpdir()));
    assert.ok(basename(directory).startsWith('scadlatch-source-test-'));
    rmSync(directory, { recursive: true, force: true });
  }
}

function volume(source: string): number {
  const stl = evaluate(source, 'stl').csg;
  const vertices = [...stl.matchAll(/vertex\s+([-\deE+.]+)\s+([-\deE+.]+)\s+([-\deE+.]+)/g)]
    .map(match => [+match[1], +match[2], +match[3]]);
  assert.ok(vertices.length >= 12, 'Expected real nonempty STL triangles');
  let sum = 0;
  for (let index = 0; index < vertices.length; index += 3) {
    const [a, b, c] = vertices.slice(index, index + 3);
    sum += (a[0] * (b[1] * c[2] - b[2] * c[1]) +
      a[1] * (b[2] * c[0] - b[0] * c[2]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
  }
  return Math.abs(sum);
}

function traces(log: string) {
  return [...log.matchAll(/ECHO: "SCADLATCH", "(n\d+)", "([^"]+)", \[(\d+), (\d+), (\d+)\]/g)]
    .map(match => ({ id: match[1], route: match[2], key: +match[3] * 65536 + +match[4] * 256 + +match[5] }));
}

test('native module calls retain distinct routes and only the selected invocation receives a cutter', native, () => {
  const source = 'module box(w){translate([0,0,1])cube([w,20,10],center=true);}box(20);translate([50,0,0])box(30);';
  const first = evaluate(composeSource(source, [], { trace: true }));
  const instances = traces(first.log);
  assert.equal(instances.length, 2);
  assert.equal(instances[0].id, instances[1].id);
  assert.notEqual(instances[0].route, instances[1].route);
  for (const instance of instances) assert.equal(instance.key, routeColorKey(instance.route));
  const cut = evaluate(composeSource(source, [feature(instances[1].id, instances[1].route)], { trace: true }));
  assert.equal((cut.csg.match(/cylinder\(/g) ?? []).length, 1, 'A single selected instance must create exactly one cutter');
  assert.match(cut.csg, /cube\(size = \[20, 20, 10\], center = true\)/);
  assert.match(cut.csg, /cube\(size = \[30, 20, 10\], center = true\)/);
  assert.deepEqual(traces(cut.log), instances);
});

test('native evaluation follows new dimensions and preserves local edge offsets through transforms', native, () => {
  const original = 'w=20; translate([5,6,7])rotate([0,0,90])cube([w,12,8]);';
  const [{ id, route }] = traces(evaluate(composeSource(original, [], { trace: true })).log);
  const features = [feature(id, route, { face: 'x+', kind: 'rectangle', u: 3, v: 4, width: 2, height: 3 })];
  const first = evaluate(composeSource(original, features));
  const changed = evaluate(composeSource(original.replace('w=20', 'w=40'), features));
  assert.match(first.csg, /cube\(size = \[20\.04, 2, 3\], center = true\)/);
  assert.match(changed.csg, /cube\(size = \[40\.04, 2, 3\], center = true\)/);
  assert.match(first.csg, /\[1, 0, 0, 10\], \[0, 1, 0, 3\], \[0, 0, 1, 4\]/);
  assert.match(changed.csg, /\[1, 0, 0, 20\], \[0, 1, 0, 3\], \[0, 0, 1, 4\]/);
});

test('native loop instances expose duplicate routes instead of pretending each is independently editable', native, () => {
  const instances = traces(evaluate(composeSource('for(i=[0:2])translate([i*20,0,0])cube(10);', [], { trace: true })).log);
  assert.equal(instances.length, 3);
  assert.equal(new Set(instances.map(instance => instance.route)).size, 1);
});

test('compound features explicitly use signed local-origin coordinates', () => {
  const source = 'linear_extrude(height=8,center=true)square([20,12],center=true);';
  const primitive = analyseSource(source).primitives[0];
  assert.equal(primitive.kind, 'linear_extrude');
  assert.equal(primitive.sizeExpression, undefined);
  assert.throws(() => composeSource(source, [feature(primitive.id, '/n0')]), /local-origin/);
  const output = composeSource(source, [feature(primitive.id, '/n0', { anchor: 'origin', u: -2, v: -1 })]);
  assert.ok(output.includes('translate([-2,-1,0])'));
  assert.throws(() => composeSource('cube(20);', [feature('n0', '/n0', { anchor: 'origin' })]), /lower-edge/);
});

test('native compound blind recess follows a resized outer plane without a baked normal coordinate', native, () => {
  const source = 'w=20; h=8; linear_extrude(height=h,center=true)square([w,12],center=true);';
  const [{ id, route }] = traces(evaluate(composeSource(source, [], { trace: true })).log);
  const features = [feature(id, route, { anchor: 'origin', face: 'x+', kind: 'rectangle', u: -2, v: -1, width: 2, height: 2, depth: 3 })];
  const original = composeSource(source, features);
  const resized = composeSource(source.replace('w=20', 'w=40'), features);
  assert.ok(Math.abs(volume(original) - (20 * 12 * 8 - 2 * 2 * 3)) < 0.001);
  assert.ok(Math.abs(volume(resized) - (40 * 12 * 8 - 2 * 2 * 3)) < 0.001);
  assert.ok(!original.includes('SCADLATCH'));
  assert.ok(!original.includes('__scadlatch_trace('));
});

test('native compound caps retain nested calls and suppress copied-module trace output', native, () => {
  const source = 'module block(w){cube([w,12,8]);} module shell(w){hull(){block(w);}} shell(20);translate([50,0,0])shell(30);';
  const hullId = analyseSource(source).primitives.find(p => p.kind === 'hull')!.id;
  const baseline = traces(evaluate(composeSource(source, [], { trace: true })).log);
  const hulls = baseline.filter(instance => instance.id === hullId);
  assert.equal(hulls.length, 2);
  const features = [feature(hullId, hulls[1].route, { anchor: 'origin', face: 'y+', kind: 'rectangle', u: 5, v: 4, width: 2, height: 2, depth: 2 })];
  const edited = composeSource(source, features, { trace: true });
  assert.deepEqual(traces(evaluate(edited).log), baseline, 'Copied hull bodies must not add duplicate instance traces');
  const exported = composeSource(source, features);
  assert.ok(Math.abs(volume(exported) - ((20 + 30) * 12 * 8 - 8)) < 0.001, 'Only the selected hull invocation loses material');
});

test('native compound through opening and multiple retained features export together', native, () => {
  const source = 'h=8; linear_extrude(height=h)square([20,12]);';
  const [{ id, route }] = traces(evaluate(composeSource(source, [], { trace: true })).log);
  const features = [
    feature(id, route, { anchor: 'origin', face: 'z+', kind: 'rectangle', u: 5, v: 5, width: 2, height: 3, depth: 0 }),
    feature(id, route, { anchor: 'origin', face: 'z-', kind: 'rectangle', u: 14, v: 5, width: 2, height: 2, depth: 2 }),
  ];
  assert.ok(Math.abs(volume(composeSource(source, features)) - (20 * 12 * 8 - 2 * 3 * 8 - 2 * 2 * 2)) < 0.001);
  assert.ok(Math.abs(volume(composeSource(source.replace('h=8', 'h=16'), features)) - (20 * 12 * 16 - 2 * 3 * 16 - 2 * 2 * 2)) < 0.001);
});

test('native concave extrusion recess cuts from the selected plane, never a lower ledge', native, () => {
  const source = 'top=20;linear_extrude(height=10)difference(){square([12,top]);translate([4,12])square([8,top-12]);}';
  const [{ id, route }] = traces(evaluate(composeSource(source, [], { trace: true })).log);
  const recess = feature(id, route, { anchor: 'origin', face: 'y+', kind: 'rectangle', u: 6, v: 5, width: 12, height: 2, depth: 2 });
  const edited = composeSource(source, [recess]);
  // The opening spans the bbox but the actual selected y=20 plane only exists
  // over x=0..4. A raw hull cap incorrectly also cuts 4 mm^3 at the y=12 ledge.
  assert.ok(Math.abs(volume(edited) - (1760 - 4 * 2 * 2)) < 0.001);
  assert.ok(Math.abs(volume(`intersection(){${edited}\ntranslate([10,10,4])cube([2,2,2]);}`) - 8) < 0.001,
    'The lower ledge must remain wholly intact');
  assert.ok(Math.abs(volume(composeSource(source.replace('top=20', 'top=28'), [recess])) - (2080 - 16)) < 0.001,
    'The selected outer plane must follow source parameter changes');
  const through = feature(id, route, { anchor: 'origin', face: 'z+', kind: 'rectangle', u: 2, v: 5, width: 2, height: 2, depth: 0 });
  assert.ok(Math.abs(volume(composeSource(source, [recess, through])) - (1760 - 16 - 40)) < 0.001,
    'Original profile difference and both added edits must survive');
});
