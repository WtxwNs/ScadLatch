export interface StlMeasure {
  volume: number;
  triangles: number;
  /** Floating-point roundoff allowance, not an estimate of model accuracy. */
  roundoff: number;
}

type Point = [number, number, number];
const MAX_TRIANGLES = 1_000_000;
const MAX_TEXT_LENGTH = 100_000_000;

/** Measure the actual exported mesh. A local origin and compensated sum keep
 * a translated part or a different triangulation from looking like a new cut.
 * Native OpenSCAD produces consistently oriented triangles; volume cannot
 * certify that an arbitrary third-party STL is watertight or printable.
 */
export function measureStl(stl: string): StlMeasure {
  if (stl.length > MAX_TEXT_LENGTH) throw new Error('The generated mesh is too large to verify. Reduce the model resolution ($fn) and try again.');
  let origin: Point | undefined, triangles = 0, sum = 0, compensation = 0, magnitude = 0;
  const addTriangle = (points: Point[]) => {
    if (++triangles > MAX_TRIANGLES) throw new Error('The generated mesh has too many triangles to verify. Reduce the model resolution ($fn) and try again.');
    if (points.length !== 3 || points.some(point => point.some(value => !Number.isFinite(value)))) throw new Error('The generated STL contains invalid triangle coordinates.');
    origin ??= points[0];
    const [a, b, c] = points.map(point => point.map((value, axis) => value - origin![axis]));
    const terms = [a[0] * b[1] * c[2], -a[0] * b[2] * c[1], a[1] * b[2] * c[0], -a[1] * b[0] * c[2], a[2] * b[0] * c[1], -a[2] * b[1] * c[0]];
    const value = terms.reduce((total, term) => total + term, 0) / 6;
    magnitude += terms.reduce((total, term) => total + Math.abs(term), 0) / 6;
    const adjusted = value - compensation, next = sum + adjusted;
    compensation = (next - sum) - adjusted;
    sum = next;
  };
  if (/^\s*solid\b/.test(stl) && stl.includes('facet ')) {
    const facets = stl.matchAll(/facet\s+normal\b[\s\S]*?endfacet/g);
    const vertexPattern = /\bvertex\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)/g;
    for (const facet of facets) {
      const points = [...facet[0].matchAll(vertexPattern)].map(match => match.slice(1).map(Number) as Point);
      addTriangle(points);
    }
    if (!/endsolid\b/.test(stl)) throw new Error('The generated STL is incomplete.');
  } else {
    // The current native path returns ASCII. Keep compatibility with the
    // binary/base64 form already accepted by the viewport.
    let decoded: string;
    try { decoded = atob(stl.replace(/^data:[^,]+,/, '')); }
    catch { throw new Error('The generated STL could not be decoded.'); }
    if (decoded.length < 84) throw new Error('The generated STL is incomplete.');
    const bytes = Uint8Array.from(decoded, char => char.charCodeAt(0));
    const view = new DataView(bytes.buffer);
    const count = view.getUint32(80, true);
    if (count > MAX_TRIANGLES || bytes.length !== 84 + count * 50) throw new Error('The generated binary STL has an invalid size or too many triangles.');
    for (let triangle = 0; triangle < count; triangle++) {
      const start = 84 + triangle * 50 + 12;
      addTriangle([0, 1, 2].map(vertex => [0, 1, 2].map(axis => view.getFloat32(start + vertex * 12 + axis * 4, true)) as Point));
    }
  }
  if (!triangles || !Number.isFinite(sum) || !Number.isFinite(magnitude)) throw new Error('The generated STL does not contain a finite, nonempty triangle mesh.');
  return { volume: Math.abs(sum), triangles, roundoff: magnitude * Number.EPSILON * 64 };
}

export function hasMaterialRemoval(before: StlMeasure, after: StlMeasure): boolean {
  const tolerance = before.roundoff + after.roundoff + Math.max(1, before.volume, after.volume) * Number.EPSILON * 32;
  return before.volume - after.volume > tolerance;
}
