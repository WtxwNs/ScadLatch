import assert from 'node:assert/strict';

export function triangles(stl: string): number[][][] {
  const vertices = [...stl.matchAll(/vertex\s+([-\d.e+]+)\s+([-\d.e+]+)\s+([-\d.e+]+)/gi)].map(m => m.slice(1).map(Number));
  assert(vertices.length > 0 && vertices.length % 3 === 0, 'Expected actual STL triangles.');
  const result = [];
  for (let i = 0; i < vertices.length; i += 3) result.push(vertices.slice(i, i + 3));
  return result;
}
export function volume(stl: string) {
  return Math.abs(triangles(stl).reduce((sum, [a, b, c]) => sum +
    a[0] * (b[1] * c[2] - b[2] * c[1]) + a[1] * (b[2] * c[0] - b[0] * c[2]) + a[2] * (b[0] * c[1] - b[1] * c[0]), 0) / 6);
}
export function triangleSet(stl: string, predicate: (vertex: number[]) => boolean) {
  return triangles(stl).filter(triangle => triangle.every(predicate)).map(triangle => triangle.map(point => point.join(',')).sort().join('|')).sort();
}
