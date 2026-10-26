import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractParts } from './csg.js';

test('maps transformed positive cubes and excludes subtractors', () => {
  const csg = `multmatrix([[0,-1,0,30],[1,0,0,5],[0,0,1,0],[0,0,0,1]]) {
    difference() {
      color([0,0,0.00392157,1]) { cube(size=[20,30,40], center=true); }
      color([0,0,0.00784314,1]) { cube(size=[10,20,30], center=false); }
    }
  }`;
  const { parts } = extractParts(csg, 'ECHO: "SCADLATCH", "n1", "/n0/n1", [0, 0, 1]\nECHO: "SCADLATCH", "n2", "/n0/n2", [0, 0, 2]');
  assert.equal(parts.length, 1);
  assert.equal(parts[0].route, '/n0/n1');
  assert.deepEqual(parts[0].matrix, [0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, 30, 5, 0, 1]);
});

test('repeated routes cannot silently edit every loop instance', () => {
  const csg = 'color([0,0,0.00392157,1]) { cube(size=[20,30,40], center=false); }';
  const log = 'ECHO: "SCADLATCH", "n1", "/n0/n1", [0,0,1]';
  const { parts } = extractParts(csg, `${log}\n${log}`);
  assert.equal(parts[0].editable, false);
  assert.match(parts[0].reason!, /loop/);
});

test('nonlinear operations are not advertised as editable planar primitives', () => {
  const { parts } = extractParts('hull() { color([0,0,0.00392157,1]) { cube(size=[20,30,40], center=false); } }', 'ECHO: "SCADLATCH", "n1", "/n0/n1", [0,0,1]');
  assert.equal(parts[0].editable, false);
  assert.match(parts[0].reason!, /hull/);
});

test('background and disabled groups cannot expose selectable solid faces', () => {
  const cube = 'color([0,0,0.00392157,1]) { cube(size=[20,30,40], center=false); }';
  const log = 'ECHO: "SCADLATCH", "n1", "/n0/n1", [0,0,1]';
  for (const modifier of ['%', '*', '%#']) {
    assert.equal(extractParts(`${modifier}group() { ${cube} }`, log).parts.length, 0);
  }
  assert.equal(extractParts(`#group() { ${cube} }`, log).parts.length, 1);
});

const trace = (id: number) => `ECHO: "SCADLATCH", "n${id}", "/n0/n${id}", [0,0,${id}]`;
const marked = (id: number, body: string) => `color([0,0,${id / 255},1]) { ${body} }`;
const translated = (x: number, y: number, z: number, body: string) =>
  `multmatrix([[1,0,0,${x}],[0,1,0,${y}],[0,0,1,${z}],[0,0,0,1]]) { ${body} }`;

test('a compound marker owns its bounds while inner cube markers stay uneditable', () => {
  const body = `hull() {
    ${marked(2, 'cube(size=[10,20,6],center=true);')}
    ${translated(30, 0, 0, 'cube(size=[4,8,6],center=true);')}
  }`;
  const { parts } = extractParts(translated(100, -50, 12, marked(1, body)), `${trace(1)}\n${trace(2)}`);
  assert.equal(parts.length, 2);
  assert.deepEqual(parts[0].boundsMin, [-5, -10, -3]);
  assert.deepEqual(parts[0].size, [37, 20, 6]);
  assert.deepEqual(parts[0].matrix.slice(12, 15), [100, -50, 12]);
  assert.equal(parts[0].kind, 'hull');
  assert.equal(parts[0].editable, true);
  assert.equal(parts[1].kind, 'cube');
  assert.equal(parts[1].editable, false);
  assert.match(parts[1].reason!, /hull/);
});

test('centered uniform extrusion preserves off-origin profile coordinates and excludes unused vertices', () => {
  const body = `linear_extrude(height=8,center=true,twist=0,scale=[2,2]) {
    polygon(points=[[2,3],[6,3],[6,7],[2,7],[999,999]],paths=[[0,1,2,3]]);
  }`;
  const { parts } = extractParts(marked(1, body), trace(1));
  assert.equal(parts[0].kind, 'linear_extrude');
  assert.equal(parts[0].editable, true);
  assert.deepEqual(parts[0].boundsMin, [2, 3, -4]);
  assert.deepEqual(parts[0].size, [10, 11, 8]);
});

test('unsupported compound geometry never falls back to a partial supported child box', () => {
  const bodies = [
    ['linear_extrude(height=8,twist=20,scale=[1,1]) { square(size=[10,20]); }', /Twisted/],
    ['linear_extrude(height=8,twist=0,scale=[2,1]) { circle(r=3); }', /uniform positive/],
    ['hull() { cube(size=[10,20,5]); offset(r=10) { square(size=[4,4]); } }', /offset/],
  ] as const;
  for (const [body, reason] of bodies) {
    const result = extractParts(marked(1, body), trace(1));
    assert.equal(result.parts.length, 0);
    assert.match(result.diagnostics.join('\n'), reason);
  }
  const unknownParent = extractParts(`future_boundary_operator() { ${marked(1, 'cube(size=[10,20,5]);')} }`, trace(1));
  assert.equal(unknownParent.parts[0].editable, false);
});

test('nested inverse transforms are evaluated together instead of expanding intermediate AABBs', () => {
  const c = Math.SQRT1_2;
  const body = `hull() {
    multmatrix([[${c},-${c},0,0],[${c},${c},0,0],[0,0,1,0],[0,0,0,1]]) {
      multmatrix([[${c},${c},0,0],[-${c},${c},0,0],[0,0,1,0],[0,0,0,1]]) {
        cube(size=[10,20,5],center=true);
      }
    }
  }`;
  const { parts } = extractParts(marked(1, body), trace(1));
  const expected = [10, 20, 5];
  parts[0].size.forEach((value, axis) => assert.ok(Math.abs(value - expected[axis]) < 1e-10));
});

test('compound envelopes cover curved primitives, extrusion profiles and referenced polyhedron vertices', () => {
  const cases = [
    ['hull() { cylinder(h=8,r1=2,r2=4,center=true); sphere(r=3); }', [-4, -4, -4], [8, 8, 8]],
    ['linear_extrude(height=6,scale=[1,1]) { union() { square(size=[4,5],center=true); circle(r=3); } }', [-3, -3, 0], [6, 6, 6]],
    ['hull() { polyhedron(points=[[0,0,0],[2,0,0],[0,3,0],[0,0,4],[100,100,100]],faces=[[0,1,2],[0,3,1],[0,2,3],[1,3,2]]); }', [0, 0, 0], [2, 3, 4]],
  ] as const;
  for (const [body, min, size] of cases) {
    const { parts } = extractParts(marked(1, body), trace(1));
    assert.deepEqual(parts[0].boundsMin, min);
    assert.deepEqual(parts[0].size, size);
  }
});

test('subtraction retains only the positive envelope and negative compound targets stay excluded', () => {
  const positive = marked(1, `hull() { difference() { cube(size=[20,30,4]); ${translated(900, 900, 900, 'sphere(r=5);')} } }`);
  const negative = marked(2, 'linear_extrude(height=2) { square(size=[5,5]); }');
  const { parts } = extractParts(`difference() { ${positive} ${negative} }`, `${trace(1)}\n${trace(2)}`);
  assert.equal(parts.length, 1);
  assert.deepEqual(parts[0].boundsMin, [0, 0, 0]);
  assert.deepEqual(parts[0].size, [20, 30, 4]);
});

test('untraced geometry with a trace color cannot impersonate a target, including subtractors', () => {
  const body = marked(1, 'hull() { cube(size=[10,20,5]); }');
  for (const csg of [`${body} ${body}`, `difference() { ${body} ${body} }`, `${body} %group() { ${body} }`]) {
    const { parts } = extractParts(csg, trace(1));
    assert.ok(parts.length > 0);
    assert.ok(parts.every(part => !part.editable));
    assert.ok(parts.every(part => /untraced geometry/.test(part.reason!)));
  }
});
