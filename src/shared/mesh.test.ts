import test from 'node:test';
import assert from 'node:assert/strict';
import { hasMaterialRemoval, measureStl } from './mesh.js';

type Point = [number, number, number];
function box(size: Point, offset: Point = [0, 0, 0], subdivide = false): Point[][] {
  const vertices = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]]
    .map(point => point.map((value, axis) => offset[axis] + value * size[axis]) as Point);
  return [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]].flatMap(indices => {
    const [a, b, c, d] = indices.map(index => vertices[index]);
    if (!subdivide) return [[a, b, c], [a, c, d]];
    const center = a.map((value, axis) => (value + c[axis]) / 2) as Point;
    return [[a, b, center], [b, c, center], [c, d, center], [d, a, center]];
  });
}
function ascii(triangles: Point[][]): string {
  return `solid test\n${triangles.map(points => `facet normal 0 0 0\nouter loop\n${points.map(point => `vertex ${point.join(' ')}`).join('\n')}\nendloop\nendfacet`).join('\n')}\nendsolid test`;
}

test('empty-space edits cannot become success merely because STL triangulation changed', () => {
  // Four non-overlapping bars form a 40 mm frame around a 30 mm opening.
  const ring = (subdivide: boolean) => ascii([
    ...box([40, 5, 8], [0, 0, 0], subdivide), ...box([40, 5, 8], [0, 35, 0], subdivide),
    ...box([5, 30, 8], [0, 5, 0], subdivide), ...box([5, 30, 8], [35, 5, 0], subdivide),
  ]);
  const before = measureStl(ring(false)), unchanged = measureStl(ring(true));
  assert.equal(before.volume, 5600);
  assert.equal(unchanged.volume, 5600);
  assert.notEqual(before.triangles, unchanged.triangles);
  assert.equal(hasMaterialRemoval(before, unchanged), false);
});

test('large translations and reversed winding do not manufacture removal', () => {
  const before = measureStl(ascii(box([10, 12, 8], [1e9, -1e9, 1e9])));
  const after = measureStl(ascii(box([10, 12, 8], [1e9, -1e9, 1e9], true).map(points => [...points].reverse())));
  assert.equal(before.volume, 960);
  assert.equal(after.volume, 960);
  assert.equal(hasMaterialRemoval(before, after), false);
});

test('a small real change remains measurable without a broad percentage threshold', () => {
  const before = measureStl(ascii(box([10, 10, 10])));
  const after = measureStl(ascii(box([10, 10, 9.9999999], [0, 0, 0], true)));
  assert.ok(Math.abs(before.volume - after.volume - 0.00001) < 1e-10);
  assert.equal(hasMaterialRemoval(before, after), true);
  assert.equal(hasMaterialRemoval(after, before), false);
});

test('binary STL has the same measured volume as the ASCII render', () => {
  const triangles = box([10, 12, 8]);
  const buffer = new ArrayBuffer(84 + triangles.length * 50), view = new DataView(buffer);
  view.setUint32(80, triangles.length, true);
  triangles.forEach((points, triangle) => points.forEach((point, vertex) => point.forEach((value, axis) =>
    view.setFloat32(84 + triangle * 50 + 12 + vertex * 12 + axis * 4, value, true))));
  const base64 = Buffer.from(buffer).toString('base64');
  assert.equal(measureStl(base64).volume, measureStl(ascii(triangles)).volume);
});

test('incomplete, nonfinite and oversized binary inputs cannot report a volume', () => {
  assert.throws(() => measureStl('solid missing\nendsolid missing'), /decoded|incomplete|nonempty/);
  assert.throws(() => measureStl(ascii(box([10, 10, 10])).replace('vertex 0 0 0', 'vertex NaN 0 0')), /invalid triangle/);
  const buffer = Buffer.alloc(84); buffer.writeUInt32LE(1_000_001, 80);
  assert.throws(() => measureStl(buffer.toString('base64')), /invalid size|too many/);
});
