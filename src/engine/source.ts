import { ParsingHelper, CodeFile } from 'openscad-parser';
import type { Feature, Face } from '../shared/types.js';

export interface Diagnostic {
  code: string;
  message: string;
  line?: number;
}

interface PrimitiveBase {
  id: string;
  sourceRange: { start: number; end: number };
  line: number;
  inLoop: boolean;
}

export type Primitive = PrimitiveBase & (
  { kind: 'cube'; sizeExpression: string; centerExpression: string } |
  { kind: 'hull' | 'linear_extrude'; sizeExpression?: never; centerExpression?: never }
);

export interface SourceAnalysis {
  primitives: Primitive[];
  diagnostics: Diagnostic[];
}

export class SourceError extends Error {
  constructor(message: string, readonly diagnostics: Diagnostic[] = []) {
    super(message);
    this.name = 'SourceError';
  }
}

// ASTNode.span in openscad-parser includes only that node's own tokens.
// In particular, BinaryOpExpr.span is just the operator, not the expression.
type Ast = {
  tokens: Record<string, unknown>;
  accept: (...args: never[]) => unknown;
  [key: string]: unknown;
};
type Token = { span: { start: { char: number; line: number }; end: { char: number } } };
type Call = { node: Ast; id: string; range: { start: number; end: number }; inLoop: boolean; children: Call[] };

function isAst(value: unknown): value is Ast {
  return !!value && typeof value === 'object' && 'tokens' in value &&
    typeof (value as Ast).accept === 'function';
}

function children(node: Ast): Ast[] {
  const result: Ast[] = [];
  for (const [key, value] of Object.entries(node)) {
    if (key === 'tokens' || key === 'docComment') continue;
    if (isAst(value)) result.push(value);
    else if (Array.isArray(value)) result.push(...value.filter(isAst));
  }
  return result;
}

function ownTokens(node: Ast): Token[] {
  return Object.values(node.tokens).flat().filter((value): value is Token =>
    !!value && typeof value === 'object' && 'span' in value);
}

function rangeOf(node: Ast): { start: number; end: number } {
  const own = ownTokens(node);
  const descendants = children(node).map(rangeOf);
  return {
    start: Math.min(...own.map(t => t.span.start.char), ...descendants.map(r => r.start)),
    end: Math.max(...own.map(t => t.span.end.char), ...descendants.map(r => r.end)),
  };
}

function nodeLine(node: Ast): number {
  return Math.min(...ownTokens(node).map(t => t.span.start.line)) + 1;
}

function sourceOf(source: string, node: Ast): string {
  const { start, end } = rangeOf(node);
  return source.slice(start, end);
}

function argument(source: string, node: Ast, name: string, position: number, fallback: string): string {
  const args = node.args as Ast[];
  const named = args.find(a => a.name === name);
  const positional = args.filter(a => !a.name)[position];
  const value = (named ?? positional)?.value;
  return isAst(value) ? sourceOf(source, value) : fallback;
}

function parse(source: string): { calls: Call[]; analysis: SourceAnalysis } {
  if (typeof source !== 'string' || !source.trim()) throw new SourceError('Choose an OpenSCAD file or enter a model first.');
  const [parsed, errors] = ParsingHelper.parseFile(new CodeFile('model.scad', source));
  if (!parsed || errors.hasErrors()) {
    const messages = errors.errors.map(error => error.message);
    throw new SourceError(`OpenSCAD source could not be read: ${messages.join('; ')}`);
  }
  const calls: Call[] = [];
  const diagnostics: Diagnostic[] = [];
  const visit = (node: Ast, inLoop: boolean) => {
    if (typeof node.name === 'string' &&
        (node.name.startsWith('__scadlatch_') || node.name.startsWith('$__scadlatch_'))) {
      throw new SourceError('Names beginning with __scadlatch_ are reserved. Open the original SCAD or the saved ScadLatch project to continue editing an exported model.');
    }
    const type = node.constructor.name;
    if (type === 'ModuleDeclarationStmt' && ['cube', 'hull', 'linear_extrude'].includes(String(node.name))) {
      throw new SourceError(`This model defines its own ${node.name} module. Rename that module before using face editing.`);
    }
    if (type === 'IncludeStmt' || type === 'UseStmt') {
      diagnostics.push({ code: 'external-library', line: nodeLine(node), message: 'External include/use files are not bundled by this editor. Inline the modules you want to edit.' });
    }
    let nestedLoop = inLoop;
    if (type === 'ModuleInstantiationStmt') {
      nestedLoop ||= node.name === 'for' || node.name === 'intersection_for';
      calls.push({ node, id: `n${calls.length}`, range: rangeOf(node), inLoop: nestedLoop, children: [] });
    }
    for (const child of children(node)) visit(child, nestedLoop);
  };
  visit(parsed as unknown as Ast, false);
  const primitives: Primitive[] = [];
  for (const call of calls) {
    if (!['cube', 'hull', 'linear_extrude'].includes(String(call.node.name))) continue;
    const child = call.node.child;
    if (call.node.name === 'cube' && (!isAst(child) || child.constructor.name !== 'NoopStmt')) {
      diagnostics.push({ code: 'cube-children', line: nodeLine(call.node), message: 'A cube with attached child statements is not selectable. Use a cube ending with a semicolon.' });
      continue;
    }
    const common: PrimitiveBase = {
      id: call.id,
      sourceRange: call.range,
      line: nodeLine(call.node),
      inLoop: call.inLoop,
    };
    primitives.push(call.node.name === 'cube' ? {
      ...common, kind: 'cube',
      sizeExpression: argument(source, call.node, 'size', 0, '1'),
      centerExpression: argument(source, call.node, 'center', 1, 'false'),
    } : { ...common, kind: call.node.name as 'hull' | 'linear_extrude' });
  }
  return { calls, analysis: { primitives, diagnostics } };
}

export function analyseSource(source: string): SourceAnalysis {
  return parse(source).analysis;
}

export const analyzeSource = analyseSource;

const FACES = new Set<Face>(['x+', 'x-', 'y+', 'y-', 'z+', 'z-']);

function validateFeature(feature: Feature, primitives: Map<string, Primitive>): void {
  const primitive = primitives.get(feature.primitiveId);
  if (!primitive) {
    throw new SourceError('This feature refers to a part that is no longer in the source. Remove the feature and select the part again.');
  }
  if (!/^\/n\d+(?:\/n\d+)*$/.test(feature.route) || !feature.route.endsWith(`/${feature.primitiveId}`)) {
    throw new SourceError('The selected part route is invalid. Render the model and select the part again.');
  }
  if (!FACES.has(feature.face) || !['circle', 'rectangle'].includes(feature.kind)) {
    throw new SourceError('Choose an exposed planar face and either a round hole or a rectangular opening.');
  }
  for (const name of ['u', 'v', 'width', 'height', 'diameter', 'depth'] as const) {
    if (!Number.isFinite(feature[name])) throw new SourceError(`${name} must be a finite number.`);
  }
  if (primitive.kind === 'cube' && feature.anchor !== undefined && feature.anchor !== 'edge') {
    throw new SourceError('Cube features use lower-edge offsets. Select the face again to restore that anchor.');
  }
  if (primitive.kind !== 'cube' && feature.anchor !== 'origin') {
    throw new SourceError('Hull and extruded features require local-origin coordinates. Select the face again to set that anchor.');
  }
  if ((primitive.kind === 'cube' && (feature.u < 0 || feature.v < 0)) || feature.depth < 0) {
    throw new SourceError('Edge distances and cutting depth cannot be negative. Use zero depth for a through hole.');
  }
  if (feature.kind === 'circle' ? feature.diameter <= 0 : feature.width <= 0 || feature.height <= 0) {
    throw new SourceError('The opening dimensions must be greater than zero.');
  }
}

function routePrefix(id: string): string {
  return `let($__scadlatch_path=str(is_undef($__scadlatch_path)?"":$__scadlatch_path,"/${id}")) `;
}

function cubeCutter(feature: Feature, primitive: Extract<Primitive, { kind: 'cube' }>, trace: boolean): string {
  const axis = { x: 0, y: 1, z: 2 }[feature.face[0] as 'x' | 'y' | 'z'];
  const sign = feature.face.endsWith('+') ? 1 : -1;
  const other = axis === 0 ? [1, 2] : axis === 1 ? [0, 2] : [0, 1];
  const position = ['__scadlatch_lo[0]', '__scadlatch_lo[1]', '__scadlatch_lo[2]'];
  position[axis] += `${sign > 0 ? `+__scadlatch_size[${axis}]` : ''}${sign > 0 ? '-' : '+'}__scadlatch_depth/2`;
  position[other[0]] += `+${feature.u}`;
  position[other[1]] += `+${feature.v}`;
  const depth = feature.depth === 0 ? `__scadlatch_size[${axis}]` : `${feature.depth}`;
  let geometry: string;
  if (feature.kind === 'circle') {
    const rotation = axis === 0 ? '[0,90,0]' : axis === 1 ? '[90,0,0]' : '[0,0,0]';
    geometry = `rotate(${rotation}) cylinder(h=__scadlatch_depth+0.04,d=${feature.diameter},center=true,$fn=64);`;
  } else {
    const size = ['', '', ''];
    size[axis] = '__scadlatch_depth+0.04';
    size[other[0]] = `${feature.width}`;
    size[other[1]] = `${feature.height}`;
    geometry = `cube([${size.join(',')}],center=true);`;
  }
  return `if($__scadlatch_path==${JSON.stringify(feature.route)})
  let(__scadlatch_raw=(${primitive.sizeExpression}),
      __scadlatch_size=is_list(__scadlatch_raw)?__scadlatch_raw:[__scadlatch_raw,__scadlatch_raw,__scadlatch_raw],
      __scadlatch_center=(${primitive.centerExpression}),
      __scadlatch_lo=__scadlatch_center?-__scadlatch_size/2:[0,0,0],
      __scadlatch_depth=${depth})
  ${trace ? 'color([0,0,0]) ' : ''}translate([${position.join(',')}]) ${geometry}`;
}

function compoundCutter(feature: Feature, body: string, trace: boolean): string {
  const axis = { x: 0, y: 1, z: 2 }[feature.face[0] as 'x' | 'y' | 'z'];
  const other = axis === 0 ? [1, 2] : axis === 1 ? [0, 2] : [0, 1];
  const position = [0, 0, 0];
  position[other[0]] = feature.u;
  position[other[1]] = feature.v;
  // The server rejects compound bounds outside this declared finite envelope.
  const span = 2_000_000;
  let tube: string;
  if (feature.kind === 'circle') {
    const rotation = axis === 0 ? '[0,90,0]' : axis === 1 ? '[90,0,0]' : '[0,0,0]';
    tube = `translate([${position.join(',')}]) rotate(${rotation}) cylinder(h=${span},d=${feature.diameter},center=true,$fn=64);`;
  } else {
    const size = [0, 0, 0];
    size[axis] = span;
    size[other[0]] = feature.width;
    size[other[1]] = feature.height;
    tube = `translate([${position.join(',')}]) cube([${size.join(',')}],center=true);`;
  }
  const inward = [0, 0, 0];
  inward[axis] = feature.face.endsWith('+') ? -feature.depth : feature.depth;
  const lateral = ['0', '0', '0'];
  lateral[other[0]] = '__scadlatch_a';
  lateral[other[1]] = '__scadlatch_b';
  // A raw convex hull has sloping support surfaces. Its translated difference
  // could cut lower ledges when an opening crosses a concave outline. Expand it
  // tangentially first: across the supported +/-900000 coordinate domain this
  // envelope has the body's exact global min/max normal planes everywhere.
  const envelope = `hull()
      for(__scadlatch_a=[-${span},${span}],__scadlatch_b=[-${span},${span}])
        translate([${lateral.join(',')}]){ ${body} }`;
  const cap = feature.depth === 0 ? tube : `intersection(){
    ${tube}
    difference(){
      ${envelope}
      translate([${inward.join(',')}]) ${envelope}
    }
  }`;
  // This special variable also suppresses trace instrumentation in user modules
  // called by the copied body, not just instrumentation visible in this snippet.
  return `if($__scadlatch_path==${JSON.stringify(feature.route)})
  let($__scadlatch_trace_off=true) ${trace ? 'color([0,0,0]) ' : ''}${cap}`;
}

const TRACE_HELPERS = `
// ScadLatch trace helpers; geometry is still evaluated by OpenSCAD.
function __scadlatch_hash(s,i=0,h=5381)=i>=len(s)?h:__scadlatch_hash(s,i+1,(h*33+ord(s[i]))%16777213);
function __scadlatch_key(s)=__scadlatch_hash(s)+1;
function __scadlatch_bytes(k)=[floor(k/65536),floor(k/256)%256,k%256];
function __scadlatch_color(k)=__scadlatch_bytes(k)/255;
module __scadlatch_trace(id){
  if(is_undef($__scadlatch_trace_off)||!$__scadlatch_trace_off)
    echo("SCADLATCH",id,$__scadlatch_path,__scadlatch_bytes(__scadlatch_key($__scadlatch_path)))
      color(__scadlatch_color(__scadlatch_key($__scadlatch_path))) children();
  else children();
}
`;

/** Compose from the unchanged imported source plus saved features, never from a previous composition. */
export function composeSource(source: string, features: Feature[] = [], options: { trace?: boolean } = {}): string {
  const { calls, analysis } = parse(source);
  const primitives = new Map(analysis.primitives.map(p => [p.id, p]));
  for (const feature of features) validateFeature(feature, primitives);
  // Build a containment tree of source calls. Replacing a compound's full range
  // must not discard the instrumentation or features belonging to descendants.
  const roots: Call[] = [], parents: Call[] = [];
  for (const call of calls) {
    while (parents.length && call.range.start >= parents.at(-1)!.range.end) parents.pop();
    if (parents.length) parents.at(-1)!.children.push(call);
    else roots.push(call);
    parents.push(call);
  }
  const renderRange = (start: number, end: number, nested: Call[], trace: boolean): string => {
    let result = '', cursor = start;
    for (const child of nested) {
      result += source.slice(cursor, child.range.start) + renderCall(child, trace);
      cursor = child.range.end;
    }
    return result + source.slice(cursor, end);
  };
  const renderCall = (call: Call, trace: boolean): string => {
    const original = renderRange(call.range.start, call.range.end, call.children, trace);
    const primitive = primitives.get(call.id);
    if (!primitive) return routePrefix(call.id) + original;
    const ownFeatures = features.filter(f => f.primitiveId === call.id);
    const traced = trace ? `__scadlatch_trace(${JSON.stringify(call.id)}) ${original}` : original;
    const cleanBody = primitive.kind === 'cube' || !ownFeatures.some(f => f.depth > 0)
      ? '' : renderRange(call.range.start, call.range.end, call.children, false);
    const body = ownFeatures.length
      ? `difference(){\n${traced}\n${ownFeatures.map(f => primitive.kind === 'cube'
        ? cubeCutter(f, primitive, trace) : compoundCutter(f, cleanBody, trace)).join('\n')}\n}`
      : traced;
    return routePrefix(call.id) + body;
  };
  const result = renderRange(0, source.length, roots, !!options.trace);
  return `${options.trace ? TRACE_HELPERS : '// Edited with ScadLatch. Feature positions retain the source size expressions.\n'}${result}`;
}

/** Same exact integer algorithm used by trace SCAD; useful for collision checks. */
export function routeColorKey(route: string): number {
  let hash = 5381;
  for (const character of route) hash = (hash * 33 + character.codePointAt(0)!) % 16777213;
  return hash + 1;
}
