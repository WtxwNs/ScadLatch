export type Face = 'x+' | 'x-' | 'y+' | 'y-' | 'z+' | 'z-';
export interface Feature {
  primitiveId: string;
  route: string;
  face: Face;
  kind: 'circle' | 'rectangle';
  /** Cubes use lower-edge offsets. Compounds use coordinates in their source-call frame. */
  anchor?: 'edge' | 'origin';
  u: number;
  v: number;
  width: number;
  height: number;
  diameter: number;
  depth: number;
}
export interface Part {
  id: string;
  primitiveId: string;
  route: string;
  kind?: 'cube' | 'hull' | 'linear_extrude';
  size: [number, number, number];
  center: boolean;
  /** Exact local bounds for compound targets; cubes derive this from size/center. */
  boundsMin?: [number, number, number];
  /** Three.js-compatible column-major affine matrix. */
  matrix: number[];
  editable: boolean;
  reason?: string;
}
export interface RenderRequest { source: string; features: Feature[] }
export interface RenderResult {
  stl: string;
  parts: Part[];
  diagnostics: string[];
  durationMs: number;
  exportSource: string;
}
