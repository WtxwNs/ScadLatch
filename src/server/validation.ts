import type { Feature, Part } from '../shared/types.js';

export function assertNoGeometryWarnings(log: string): void {
  const failures = log.split(/\r?\n/).filter(line =>
    /^\s*WARNING:/i.test(line) &&
    /unknown (?:module|function|variable)|undefined operation|unable to convert|cannot be converted|could not be converted|invalid (?:value|parameter|argument)|out of bounds|parameter.*(?:not specified|not valid)|wrong number of (?:parameters|arguments)/i.test(line));
  if (failures.length) {
    throw new Error(`OpenSCAD could not evaluate the complete model and may have omitted geometry. Fix these source warnings before continuing:\n${failures.join('\n').slice(-5000)}`);
  }
}

export function assertSelfContained(source: string): void {
  // Read strings and comments together: comment delimiters inside a string must
  // never hide a real import between two echo statements.
  const code = source.replace(/"(?:\\.|[^"\\])*"|\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g, ' ');
  if (/\b(include|use)\s*</.test(code) || /\b(import|import_stl|import_dxf|import_off|surface)\s*\(/.test(code)) {
    throw new Error('This edition accepts self-contained .scad files. External include/use libraries and imported files are not supported. Use a single-file model.');
  }
}

export function assertFeaturesFitParts(features: Feature[], parts: Part[]): void {
  for (const feature of features) {
    const target = parts.find(p => p.primitiveId === feature.primitiveId && p.route === feature.route);
    if (!target || !target.editable) throw new Error(target?.reason ?? 'An edit no longer matches a selectable part. Undo that edit or reload the original model.');
    const plane = feature.face[0] === 'x' ? [1, 2] : feature.face[0] === 'y' ? [0, 2] : [0, 1];
    const compound = target.kind === 'hull' || target.kind === 'linear_extrude';
    if ((compound && feature.anchor !== 'origin') || (!compound && feature.anchor === 'origin')) {
      throw new Error('The placement rule no longer matches this part. Remove the edit and select the face again.');
    }
    const low = compound ? target.boundsMin : [0, 0, 0];
    if (!low) throw new Error('The selected body has no reliable local bounds. Select another face.');
    if (compound && low.some((n, i) => Math.abs(n) >= 900000 || Math.abs(n + target.size[i]) >= 900000)) {
      throw new Error('This body exceeds the supported local coordinate range. Use a model smaller than 900,000 units from its local origin.');
    }
    const halfU = (feature.kind === 'circle' ? feature.diameter : feature.width) / 2;
    const halfV = (feature.kind === 'circle' ? feature.diameter : feature.height) / 2;
    if (feature.u - halfU < low[plane[0]] || feature.v - halfV < low[plane[1]] ||
        feature.u + halfU > low[plane[0]] + target.size[plane[0]] || feature.v + halfV > low[plane[1]] + target.size[plane[1]]) {
      throw new Error('The complete opening no longer fits within the selected part bounds. Move or resize the opening, or increase the model size.');
    }
  }
}
