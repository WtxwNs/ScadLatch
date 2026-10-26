import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { renderProject, executablePath } from '../src/server/runtime.ts';

type V = [number, number, number];
type T = [V, V, V];
function parseStl(text: string): T[] {
  const verts = [...text.matchAll(/vertex\s+([-+\d.eE]+)\s+([-+\d.eE]+)\s+([-+\d.eE]+)/g)].map(m => [Number(m[1]), Number(m[2]), Number(m[3])] as V);
  assert(verts.length >= 12 && verts.length % 3 === 0, 'Actual STL must contain complete triangles');
  return Array.from({length: verts.length / 3}, (_, i) => verts.slice(i * 3, i * 3 + 3) as T);
}
const sub = (a: V,b: V): V => [a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const cross = (a: V,b: V): V => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot = (a: V,b: V) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const volume = (ts: T[]) => Math.abs(ts.reduce((sum,[a,b,c]) => sum + dot(a,cross(b,c))/6,0));
function intersections(ts: T[], y: number, z: number): number[] {
  const origin: V = [-10,y,z], dir: V = [1,0,0];
  const hits: number[] = [];
  for(const [a,b,c] of ts) {
    const e1=sub(b,a), e2=sub(c,a), h=cross(dir,e2), det=dot(e1,h);
    if(Math.abs(det)<1e-9) continue;
    const f=1/det, s=sub(origin,a), u=f*dot(s,h);
    if(u < -1e-7 || u > 1+1e-7) continue;
    const q=cross(s,e1), v=f*dot(dir,q);
    if(v < -1e-7 || u+v > 1+1e-7) continue;
    const t=f*dot(e2,q);
    if(t>=0) hits.push(-10+t);
  }
  return hits.sort((a,b)=>a-b).filter((x,i,a)=>i===0 || Math.abs(x-a[i-1])>1e-4).map(x=>Number(x.toFixed(5)));
}
function edgeErrors(ts: T[]): number {
  const key = (v: V) => v.map(x=>Math.round(x*1e5)).join(',');
  const edges = new Map<string,number>();
  for(const t of ts) for(let i=0;i<3;i++) {
    const edge = [key(t[i]),key(t[(i+1)%3])].sort().join(':');
    edges.set(edge,(edges.get(edge)||0)+1);
  }
  return [...edges.values()].filter(n=>n!==2).length;
}
const output = resolve('.cache/release-workflow');
await mkdir(output,{recursive:true});
const original = await readFile('examples/rounded-shell.scad','utf8');
const exe = await executablePath();
const rows: any[] = [];
for(const width of [100,140]) {
  const source = original.replace(/^width\s*=\s*100\s*;/m, `width = ${width};`);
  const base = await renderProject({source,features:[]});
  const eligible = base.parts.filter(p=>p.editable && p.kind==='hull');
  assert.equal(eligible.length,1,'One supported positive hull should be selectable');
  const part=eligible[0];
  const feature = {primitiveId:part.primitiveId,route:part.route,face:'x+' as const,kind:'rectangle' as const,anchor:'origin' as const,u:32,v:17,width:18,height:10,diameter:6,depth:5};
  const edited=await renderProject({source,features:[feature]});
  const baseMesh=parseStl(base.stl), editedMesh=parseStl(edited.stl);
  const removed=volume(baseMesh)-volume(editedMesh);
  assert(Math.abs(removed-540)<0.05,`Expected 540 mm^3 wall removal, got ${removed}`);
  assert.deepEqual(intersections(baseMesh,32,17),[0,3,width-3,width]);
  assert.deepEqual(intersections(editedMesh,32,17),[0,3],'Center ray must pass through right opening, retain left wall');
  assert.deepEqual(intersections(editedMesh,20,17),[0,3,width-3,width],'Outside opening both walls remain');
  assert.equal(edgeErrors(editedMesh),0,'Every output edge has exactly two incident triangles');
  await writeFile(join(output,`shell-${width}.scad`),edited.exportSource);
  await writeFile(join(output,`shell-${width}.stl`),edited.stl);
  await writeFile(join(output,`shell-${width}.scadlatch.json`),JSON.stringify({format:"scadlatch",version:1,name:`Rounded shell ${width}`,source,features:[feature]},null,2));
  const compiled=spawnSync(exe,['--export-format','asciistl','-o',`independent-${width}.stl`,`shell-${width}.scad`],{cwd:output,windowsHide:true,encoding:'utf8',timeout:90000});
  assert.equal(compiled.status,0,compiled.stderr);
  const independentMesh=parseStl(await readFile(join(output,`independent-${width}.stl`),'utf8'));
  assert(Math.abs(volume(independentMesh)-volume(editedMesh))<0.0001);
  assert.deepEqual(intersections(independentMesh,32,17),[0,3]);
  assert.equal(edgeErrors(independentMesh),0);
  const row={width,part:{kind:part.kind,route:part.route,size:part.size},baselineVolume:volume(baseMesh),editedVolume:volume(editedMesh),removedMm3:removed,baselineCenterRay:intersections(baseMesh,32,17),editedCenterRay:intersections(editedMesh,32,17),outsideOpeningRay:intersections(editedMesh,20,17),nonTwoManifoldEdges:edgeErrors(editedMesh),triangles:editedMesh.length,baselineMs:base.durationMs,editedMs:edited.durationMs,diagnostics:edited.diagnostics,independentVolume:volume(independentMesh),independentTriangles:independentMesh.length,independentCompilerLog:compiled.stderr.trim()};
  rows.push(row); console.log(JSON.stringify(row,null,2));
}
await writeFile(join(output,'results.json'),JSON.stringify({date:new Date().toISOString(),platform:process.platform,node:process.version,executable:exe,results:rows},null,2));
console.log('PASS: real Rounded shell geometry, width change, opposite wall preservation, closed mesh, standalone SCAD rerender.');


