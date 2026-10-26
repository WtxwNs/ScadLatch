import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertFeaturesFitParts, assertNoGeometryWarnings, assertSelfContained } from './validation.js';
import type { Feature, Part } from '../shared/types.js';

test('strings cannot disguise external file access as a comment', () => {
  assert.throws(() => assertSelfContained('echo("/*"); import("part.stl"); echo("*/"); cube(10);'), /self-contained/);
  assert.throws(() => assertSelfContained('echo("//"); surface(file="height.dat");'), /self-contained/);
  assert.throws(() => assertSelfContained('include /* note */ <outside.scad>'), /self-contained/);
  assert.throws(() => assertSelfContained('import_stl("part.stl");'), /self-contained/);
  assert.doesNotThrow(() => assertSelfContained('echo("import(\\\"part.stl\\\")"); /* include <outside.scad> */ cube(10); // surface(\n'));
});

test('resizing rejects a clipped opening even while its centre remains inside', () => {
  const part: Part = { id: '/n0', route: '/n0', primitiveId: 'n0', size: [20, 12, 10], center: false, matrix: [], editable: true };
  const feature: Feature = { primitiveId: 'n0', route: '/n0', face: 'x+', kind: 'rectangle', u: 6, v: 5, width: 10, height: 8, diameter: 4, depth: 2 };
  assert.doesNotThrow(() => assertFeaturesFitParts([feature], [part]));
  assert.throws(() => assertFeaturesFitParts([feature], [{ ...part, size: [20, 10, 10] }]), /complete opening/);
  assert.throws(() => assertFeaturesFitParts([{ ...feature, kind: 'circle', diameter: 12 }], [part]), /complete opening/);
});

test('partial geometry warnings cannot be reported as a successful model', () => {
  for (const warning of [
    "WARNING: Ignoring unknown module 'missing_part' in file input.scad, line 1",
    "WARNING: Ignoring unknown function 'missing_size' in file input.scad, line 1",
    "WARNING: Ignoring unknown variable 'missing_size' in file input.scad, line 1",
    'WARNING: Unable to convert cube(size=[undef, 10, 10], ...) parameter to a number or a vec3 of numbers in file input.scad, line 1',
    'WARNING: undefined operation (number + undefined) in file input.scad, line 1',
  ]) assert.throws(() => assertNoGeometryWarnings(warning), /complete model/);
  assert.doesNotThrow(() => assertNoGeometryWarnings('WARNING: Viewall and autocenter disabled in favor of $vp*\nECHO: "ready"'));
});

test('compound placement uses its local origin without changing legacy cube offsets', () => {
  const part: Part = { id: '/n0', route: '/n0', primitiveId: 'n0', kind: 'hull', size: [20, 16, 10], boundsMin: [-10, -8, -5], center: false, matrix: [], editable: true };
  const feature: Feature = { primitiveId: 'n0', route: '/n0', face: 'x+', kind: 'rectangle', anchor: 'origin', u: -3, v: -1, width: 4, height: 4, diameter: 2, depth: 2 };
  assert.doesNotThrow(() => assertFeaturesFitParts([feature], [part]));
  assert.throws(() => assertFeaturesFitParts([{ ...feature, anchor: 'edge' }], [part]), /placement rule/);
  assert.throws(() => assertFeaturesFitParts([{ ...feature, u: -7 }], [part]), /complete opening/);
  assert.throws(() => assertFeaturesFitParts([feature], [{ ...part, boundsMin: [-1000000, -8, -5] }]), /coordinate range/);
});
