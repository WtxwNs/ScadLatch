import type { Part } from '../shared/types.js';

interface Node { name: string; args: Record<string, unknown>; children: Node[]; modifiers: string[] }
interface Trace { primitiveId: string; route: string; key: number }
type Vec3 = [number, number, number];
interface Interval { min: number; max: number; dimension: 2 | 3 }
type Extent = Interval | { reason: string } | null;
interface Bounds { min: Vec3; size: Vec3 }
const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function multiply(a: number[], b: number[]): number[] {
  return Array.from({ length: 16 }, (_, i) => {
    const row = i % 4, col = Math.floor(i / 4);
    return [0, 1, 2, 3].reduce((s, k) => s + a[k * 4 + row] * b[col * 4 + k], 0);
  });
}

function transform(node: Node): number[] | undefined {
  const rows = node.args['0'];
  if (!Array.isArray(rows) || rows.length !== 4 ||
      !rows.every(row => Array.isArray(row) && row.length === 4 && row.every(Number.isFinite)) ||
      rows[3][0] !== 0 || rows[3][1] !== 0 || rows[3][2] !== 0 || rows[3][3] !== 1) return;
  return Array.from({ length: 16 }, (_, n) => rows[n % 4][Math.floor(n / 4)]);
}

const finiteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const failure = (reason: string): Extent => ({ reason });
const absent = (node: Node) => node.modifiers.includes('%') || node.modifiers.includes('*');
const dot = (a: number[], b: number[]) => a.reduce((sum, value, i) => sum + value * b[i], 0);

function merged(values: Extent[]): Extent {
  const intervals: Interval[] = [];
  for (const value of values) {
    if (!value) continue;
    if ('reason' in value) return value;
    intervals.push(value);
  }
  if (!intervals.length) return null;
  if (intervals.some(value => value.dimension !== intervals[0].dimension)) return failure('Mixed 2D and 3D geometry has no supported local bounds.');
  return { min: Math.min(...intervals.map(value => value.min)), max: Math.max(...intervals.map(value => value.max)), dimension: intervals[0].dimension };
}

/** Directional extrema avoid rotating an already axis-aligned bounding box.
 * Difference retains its first operand's conservative envelope; the UI must
 * still confirm that a real STL surface exists at a selectable bounds plane.
 * Circles/spheres use their analytic envelope (facets can lie inside it).
 */
function extent(node: Node, direction: Vec3): Extent {
  if (absent(node)) return null;
  if (node.name === 'multmatrix') {
    const matrix = transform(node);
    if (!matrix) return failure('A non-affine or invalid transform has no supported local bounds.');
    const local = [0, 1, 2].map(col => dot(direction, matrix.slice(col * 4, col * 4 + 3))) as Vec3;
    const child = merged(node.children.map(item => extent(item, local)));
    if (!child || 'reason' in child) return child;
    const offset = dot(direction, matrix.slice(12, 15));
    return { ...child, min: child.min + offset, max: child.max + offset };
  }
  if (['group', 'color', 'render', 'union', 'hull'].includes(node.name)) {
    return merged(node.children.map(child => extent(child, direction)));
  }
  if (node.name === 'difference') return node.children.length ? extent(node.children[0], direction) : null;
  if (node.name === 'cube' || node.name === 'square') {
    const dimension = node.name === 'cube' ? 3 : 2;
    const raw = node.args.size;
    const size = finiteNumber(raw) ? Array(dimension).fill(raw) : raw;
    if (!Array.isArray(size) || size.length !== dimension || !size.every(n => finiteNumber(n) && n > 0)) return failure(`${node.name} has invalid or empty dimensions.`);
    let min = 0, max = 0;
    for (let axis = 0; axis < dimension; axis++) {
      const lo = node.args.center === true ? -size[axis] / 2 : 0;
      const ends = [direction[axis] * lo, direction[axis] * (lo + size[axis])];
      min += Math.min(...ends); max += Math.max(...ends);
    }
    return { min, max, dimension };
  }
  if (node.name === 'sphere' || node.name === 'circle') {
    const radius = node.args.r;
    if (!finiteNumber(radius) || radius <= 0) return failure(`${node.name} has an invalid or empty radius.`);
    const dimension = node.name === 'sphere' ? 3 : 2;
    const distance = radius * Math.hypot(...direction.slice(0, dimension));
    return { min: -distance, max: distance, dimension };
  }
  if (node.name === 'cylinder') {
    const height = node.args.h, r1 = node.args.r1 ?? node.args.r, r2 = node.args.r2 ?? node.args.r;
    if (!finiteNumber(height) || height <= 0 || !finiteNumber(r1) || !finiteNumber(r2) || r1 < 0 || r2 < 0 || r1 + r2 <= 0) return failure('A cylinder has invalid or empty dimensions.');
    const lo = node.args.center === true ? -height / 2 : 0;
    const radial = Math.hypot(direction[0], direction[1]);
    return { min: Math.min(direction[2] * lo - radial * r1, direction[2] * (lo + height) - radial * r2),
      max: Math.max(direction[2] * lo + radial * r1, direction[2] * (lo + height) + radial * r2), dimension: 3 };
  }
  if (node.name === 'polygon' || node.name === 'polyhedron') {
    const dimension = node.name === 'polygon' ? 2 : 3;
    const points = node.args.points;
    if (!Array.isArray(points) || !points.length || !points.every(point => Array.isArray(point) && point.length === dimension && point.every(finiteNumber))) return failure(`${node.name} has invalid points.`);
    const paths = dimension === 2 ? node.args.paths : node.args.faces ?? node.args.triangles;
    let used = points;
    if (paths !== undefined && paths !== null) {
      if (!Array.isArray(paths) || !paths.every(path => Array.isArray(path) && path.length >= 3 && path.every(index => Number.isInteger(index) && index >= 0 && index < points.length))) return failure(`${node.name} has invalid vertex references.`);
      // OpenSCAD uses every point for a polygon with no explicit paths.
      if (paths.length) used = [...new Set(paths.flat() as number[])].map(index => points[index]);
      else if (dimension === 3) return null;
    } else if (dimension === 3) return failure('A polyhedron without faces has no supported local bounds.');
    const values = used.map(point => dot(point, direction));
    return { min: Math.min(...values), max: Math.max(...values), dimension };
  }
  if (node.name === 'linear_extrude') {
    const height = node.args.height;
    if (!finiteNumber(height) || height <= 0) return failure('linear_extrude requires a positive finite height.');
    if ((node.args.twist ?? 0) !== 0) return failure('Twisted linear_extrude is not supported for direct face editing.');
    const rawScale = node.args.scale ?? [1, 1];
    const scale = finiteNumber(rawScale) ? [rawScale, rawScale] : rawScale;
    if (!Array.isArray(scale) || scale.length !== 2 || !scale.every(n => finiteNumber(n) && n > 0) || scale[0] !== scale[1]) return failure('linear_extrude requires a uniform positive scale for direct face editing.');
    const vector = node.args.v;
    if (vector !== undefined && (!Array.isArray(vector) || vector.length !== 3 || vector[0] !== 0 || vector[1] !== 0 || vector[2] !== 1)) return failure('Oblique linear_extrude is not supported for direct face editing.');
    const bottom = merged(node.children.map(child => extent(child, [direction[0], direction[1], 0])));
    const top = merged(node.children.map(child => extent(child, [direction[0] * scale[0], direction[1] * scale[0], 0])));
    if (!bottom || !top) return null;
    if ('reason' in bottom) return bottom;
    if ('reason' in top) return top;
    if (bottom.dimension !== 2 || top.dimension !== 2) return failure('linear_extrude requires supported 2D children.');
    const z0 = node.args.center === true ? -height / 2 : 0;
    return { min: Math.min(bottom.min + direction[2] * z0, top.min + direction[2] * (z0 + height)),
      max: Math.max(bottom.max + direction[2] * z0, top.max + direction[2] * (z0 + height)), dimension: 3 };
  }
  return failure(`${node.name} has no supported local-bounds calculation. Direct editing is unavailable for this compound.`);
}

function localBounds(node: Node): Bounds | { reason: string } {
  const axes: Vec3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const ranges: Interval[] = [];
  for (const axis of axes) {
    const range = extent(node, axis);
    if (!range) return { reason: 'The compound has no nonempty supported geometry.' };
    if ('reason' in range) return range;
    if (range.dimension !== 3 || !Number.isFinite(range.min) || !Number.isFinite(range.max) || range.max <= range.min) return { reason: 'The compound does not have a finite three-dimensional extent.' };
    ranges.push(range);
  }
  return { min: ranges.map(range => range.min) as Vec3, size: ranges.map(range => range.max - range.min) as Vec3 };
}

/** CSG is OpenSCAD's evaluated tree, not an interpreter for user programs. */
function parseCSG(source: string): Node[] {
  const tokens = source.match(/"(?:\\.|[^"\\])*"|[A-Za-z_$][\w$]*|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?|[^\s]/g) ?? [];
  let i = 0;
  const expect = (s: string) => { if (tokens[i++] !== s) throw new Error(`Unexpected CSG token (expected ${s}).`); };
  function value(): unknown {
    if (tokens[i] === '[') {
      i++; const values: unknown[] = [];
      while (i < tokens.length && tokens[i] !== ']') { values.push(value()); if (tokens[i] === ',') i++; else break; }
      expect(']'); return values;
    }
    const token = tokens[i++];
    if (token === 'true' || token === 'false') return token === 'true';
    if (token === 'undef') return null;
    if (token?.startsWith('"')) return JSON.parse(token);
    const n = Number(token); if (!Number.isFinite(n)) throw new Error(`Unsupported CSG value: ${token}`);
    return n;
  }
  function nodes(stop = ''): Node[] {
    const result: Node[] = [];
    while (i < tokens.length && tokens[i] !== stop) {
      const modifiers: string[] = [];
      while (['%', '#', '!', '*'].includes(tokens[i])) modifiers.push(tokens[i++]);
      const name = tokens[i++]; expect('(');
      const args: Record<string, unknown> = {}; let position = 0;
      while (i < tokens.length && tokens[i] !== ')') {
        let key = String(position++);
        if (tokens[i + 1] === '=') { key = tokens[i]; i += 2; }
        args[key] = value(); if (tokens[i] === ',') i++; else break;
      }
      expect(')'); let children: Node[] = [];
      if (tokens[i] === '{') { i++; children = nodes('}'); expect('}'); }
      else if (tokens[i] === ';') i++;
      else throw new Error('Unexpected CSG child.');
      result.push({ name, args, children, modifiers });
    }
    return result;
  }
  return nodes();
}

export function extractParts(csg: string, log: string): { parts: Part[]; diagnostics: string[] } {
  const traces: Trace[] = [];
  for (const line of log.split(/\r?\n/)) {
    const match = line.match(/ECHO:\s*"SCADLATCH",\s*(.*)/);
    if (!match) continue;
    try {
      const [primitiveId, route, encoded] = JSON.parse(`[${match[1]}]`);
      const key = Array.isArray(encoded) ? encoded[0] * 65536 + encoded[1] * 256 + encoded[2] : encoded;
      if (typeof primitiveId !== 'string' || !/^n\d+$/.test(primitiveId) || typeof route !== 'string' || !/^(\/n\d+)+$/.test(route) || !route.endsWith(`/${primitiveId}`) || !Number.isInteger(key) || key < 1 || key > 0xffffff) continue;
      traces.push({ primitiveId, route, key });
    } catch { /* Other user echo output is not tracing. */ }
  }
  const byKey = new Map<number, Trace[]>();
  for (const trace of traces) byKey.set(trace.key, [...(byKey.get(trace.key) ?? []), trace]);
  const found: { part: Part; key: number }[] = [];
  const matches = new Map<number, number>();
  const diagnostics: string[] = [];
  interface Anchor { key: number; used: boolean }
  function visit(node: Node, matrix: number[], anchor: Anchor | undefined, positive: boolean, reason?: string) {
    // Background and disabled geometry do not contribute to the exported solid.
    // Highlight (#), by contrast, does not remove a part from the solid.
    if (absent(node)) positive = false;
    if (node.name === 'multmatrix') {
      const local = transform(node);
      if (!local) throw new Error('Invalid transform in CSG.');
      matrix = multiply(matrix, local);
    }
    if (node.name === 'color') {
      const rgba = node.args['0'] as number[];
      if (Array.isArray(rgba)) {
        const candidate = Math.round(rgba[0] * 255) * 65536 + Math.round(rgba[1] * 255) * 256 + Math.round(rgba[2] * 255);
        if (byKey.has(candidate)) anchor = { key: candidate, used: false };
      }
    }
    if (['cube', 'hull', 'linear_extrude'].includes(node.name) && anchor && !anchor.used) {
      anchor.used = true;
      const key = anchor.key;
      matches.set(key, (matches.get(key) ?? 0) + 1);
      const candidates = byKey.get(key)!;
      const unique = new Set(candidates.map(t => t.route));
      const trace = candidates[0];
      const bounds = positive ? localBounds(node) : undefined;
      if (bounds && !('reason' in bounds)) {
        const ambiguous = unique.size !== 1 || candidates.length > 1;
        found.push({ key, part: { id: trace.route, primitiveId: trace.primitiveId, route: trace.route,
          kind: node.name as 'cube' | 'hull' | 'linear_extrude', boundsMin: bounds.min, size: bounds.size,
          center: node.name === 'cube' && node.args.center === true, matrix, editable: !reason && !ambiguous,
          reason: reason ?? (ambiguous ? 'This source statement creates repeated instances in a loop or has an ambiguous trace. Editing one instance is not supported.' : undefined) } });
      } else if (bounds) {
        diagnostics.push(`${node.name} at ${trace.route}: ${bounds.reason}`);
      }
    }
    // A trace owns one directly wrapped target, not every cube somewhere below
    // its color. Nested targets need their own marker and remain uneditable
    // when an ancestor changes their visible boundary.
    if (node.children.length && !['group', 'color', 'multmatrix', 'render', 'union', 'difference'].includes(node.name)) {
      reason ??= `${node.name} changes the primitive boundary. View and export work; direct editing is unavailable for this inner part.`;
    }
    const forwarded = ['group', 'color', 'multmatrix', 'render'].includes(node.name) ? anchor : undefined;
    node.children.forEach((child, index) => visit(child, matrix, forwarded, positive && !(node.name === 'difference' && index > 0), reason));
  }
  parseCSG(csg).forEach(n => visit(n, identity, undefined, true));
  const parts = found.map(({ part, key }) => {
    // A same-colored untraced copy must not inherit another body's source ID.
    // More matches than actual echoes means color alone cannot identify it.
    if ((matches.get(key) ?? 0) > byKey.get(key)!.length) return { ...part, editable: false,
      reason: 'The trace color also matches untraced geometry. This target cannot be identified safely for direct editing.' };
    return part;
  });
  if (!parts.some(p => p.editable)) diagnostics.push('No supported editable faces found. Select an exposed planar face of a supported cube, hull or linear extrusion.');
  if (parts.some(p => !p.editable)) diagnostics.push('Some parts can be viewed but cannot be edited individually. Select a supported face.');
  return { parts, diagnostics };
}
