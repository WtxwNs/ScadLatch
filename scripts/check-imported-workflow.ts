import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { renderProject, executablePath, runOpenSCAD } from '../src/server/runtime.js';
import { selectFace, partMinimum } from '../src/ui/scene.js';
import type { Feature, Part, RenderResult } from '../src/shared/types.js';

// Bounded recheck of the same three attributed originals. No new model search.
const external = resolve('examples/external');
const retryDrLex = process.argv.includes('--retry-drlex');
const refreshShell = process.argv.includes('--refresh-shell');
const report: Record<string, unknown> = (retryDrLex || refreshShell) ? JSON.parse(await readFile(resolve(external,'imported-workflow-results.json'),'utf8')) : { date: new Date().toISOString(), scope: 'Same three external source models; terminal product runtime, not human UI acceptance.', attempts: [] };
if (!retryDrLex && !refreshShell) {
  try { const previous = JSON.parse(await readFile(resolve(external,'imported-workflow-results.json'),'utf8')); report.previousRuns = [...(previous.previousRuns ?? []), {date: previous.date, attempts: previous.attempts}]; } catch { /* First run has no saved history. */ }
}
const attempts = report.attempts as Record<string, unknown>[];
function mesh(stl: string) { return new THREE.Mesh(new STLLoader().parse(new TextEncoder().encode(stl).buffer), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })); }
function measure(stl: string) {
  const geometry = mesh(stl).geometry, p = geometry.getAttribute('position'); let volume = 0;
  const edges = new Map<string, number>();
  for (let i = 0; i < p.count; i += 3) {
    const a = new THREE.Vector3().fromBufferAttribute(p, i), b = new THREE.Vector3().fromBufferAttribute(p, i + 1), c = new THREE.Vector3().fromBufferAttribute(p, i + 2);
    assert([...a.toArray(), ...b.toArray(), ...c.toArray()].every(Number.isFinite)); volume += a.dot(b.clone().cross(c)) / 6;
    const keys = [a,b,c].map(v => v.toArray().map(x => x.toFixed(5)).join(','));
    for (let j=0;j<3;j++) { const key=[keys[j],keys[(j+1)%3]].sort().join('|'); edges.set(key,(edges.get(key)||0)+1); }
  }
  return { triangles: p.count / 3, volume: Math.abs(volume), unmatchedEdges: [...edges.values()].filter(n=>n!==2).length };
}
const meshes = new WeakMap<RenderResult, THREE.Mesh>();
function capHit(result: RenderResult, part: Part, local: THREE.Vector3, axis: number) {
  const transform = new THREE.Matrix4().fromArray(part.matrix), normal = new THREE.Vector3().setComponent(axis,1).transformDirection(transform);
  const point = local.clone().applyMatrix4(transform); const ray = new THREE.Raycaster(point.clone().addScaledVector(normal,2),normal.clone().negate());
  let solid=meshes.get(result);if(!solid){solid=mesh(result.stl);meshes.set(result,solid);}
  const hit=ray.intersectObject(solid)[0]; if(!hit?.face || hit.point.distanceTo(point)>.02) return undefined;
  const chosen=selectFace(hit.point,hit.face.normal,result.parts);
  return chosen?.part.route===part.route && chosen.face===`${'xyz'[axis]}+` ? chosen : undefined;
}
async function save(folder:string,name:string,source:string,feature:Feature,result:RenderResult) {
  const path=resolve(external,folder,name); await writeFile(path+'.scadlatch.json',JSON.stringify({format:'scadlatch',version:1,name,source,features:[feature]},null,2)); await writeFile(path+'.scad',result.exportSource);
  const log=await runOpenSCAD(await executablePath(),['--export-format','asciistl','-o',path+'.stl',path+'.scad'],external);
  const independent=measure(await readFile(path+'.stl','utf8')); assert(Math.abs(independent.volume-measure(result.stl).volume)<.1);
  return {independent, log:log.trim()};
}
if (!retryDrLex) try {
  const original=await readFile(resolve(external,'erlancassiano-enclosure/enclosure.scad'),'utf8');
  const source=original.replace(/show_lid\s*=\s*true;/,'show_lid = false;'); assert.notEqual(source,original);
  const base=await renderProject({source,features:[]}); console.log('Erlan parts',base.parts.map(p=>({kind:p.kind,size:p.size,min:p.boundsMin,route:p.route,editable:p.editable})));
  const part=base.parts.find(p=>p.editable && p.kind==='hull' && p.size[0]>80 && p.size[2]>20); assert(part,'Rounded outer shell should be editable');
  const min=partMinimum(part), point=new THREE.Vector3(min[0]+part.size[0],25,10); assert(capHit(base,part,point,0),'Actual shell STL must have an exposed x+ face at the selected point');
  const feature:Feature={primitiveId:part.primitiveId,route:part.route,anchor:'origin',face:'x+',kind:'rectangle',u:25,v:10,width:12,height:6,diameter:6,depth:4};
  const edited=await renderProject({source,features:[feature]}); const resizedSource=source.replace(/pcb_len\s*=\s*80;/,'pcb_len = 110;');assert.notEqual(resizedSource,source);
  const wideBase=await renderProject({source:resizedSource,features:[]});const wide=await renderProject({source:resizedSource,features:[feature]});
  const delta=measure(base.stl).volume-measure(edited.stl).volume,wideDelta=measure(wideBase.stl).volume-measure(wide.stl).volume; assert(Math.abs(delta-180)<.1);assert(Math.abs(wideDelta-180)<.1);
  const widePart=wideBase.parts.find(p=>p.route===part.route)!;assert(capHit(wideBase,widePart,new THREE.Vector3(partMinimum(widePart)[0]+widePart.size[0],25,10),0));
  const saved=await save('erlancassiano-enclosure','shell-side-opening',source,feature,edited);const savedWide=await save('erlancassiano-enclosure','shell-side-opening-wide',resizedSource,feature,wide);
  attempts.push({model:'Erlan enclosure',result:'passed',verification: refreshShell ? 'fixed-plane-cap refresh' : 'full bounded run',verifiedAt:new Date().toISOString(),configuration:'show_lid=false; resize pcb_len 80 to 110 only',feature,base:measure(base.stl),edited:measure(edited.stl),wideBase:measure(wideBase.stl),wide:measure(wide.stl),delta,wideDelta,saved,savedWide});
} catch(e) { attempts.push({model:'Erlan enclosure',result:'failed',error:String(e)});console.error('Erlan',e); }
if (!refreshShell) try {
 const source=await readFile(resolve(external,'drlex-phone-holder/SmartPhoneHolder.scad'),'utf8');const base=await renderProject({source,features:[]});console.log('DrLex parts',base.parts.map(p=>({kind:p.kind,size:p.size,min:p.boundsMin,route:p.route,editable:p.editable,reason:p.reason})));
 const part=base.parts.find(p=>p.editable && p.kind==='linear_extrude');assert(part,'No supported positive extrusion'); const min=partMinimum(part),z=min[2]+part.size[2];let location:THREE.Vector3|undefined;
 // Search material on the real cap and a 2 mm radius ring, not just the bounding box.
 outer: for(let y=min[1]+3;y<min[1]+part.size[1]-3;y+=2)for(let x=min[0]+3;x<min[0]+part.size[0]-3;x+=2){
  const p=new THREE.Vector3(x,y,z);if(!capHit(base,part,p,2))continue;
  let clear=true;for(let k=0;k<16;k++){const angle=k/16*2*Math.PI;if(!capHit(base,part,new THREE.Vector3(x+2*Math.cos(angle),y+2*Math.sin(angle),z),2)){clear=false;break;}}
  if(clear){location=p;break outer;}
 }
 assert(location,'No cap location with sampled 2 mm material clearance');const feature:Feature={primitiveId:part.primitiveId,route:part.route,anchor:'origin',face:'z+',kind:'circle',u:location.x,v:location.y,width:2,height:2,diameter:2,depth:2};
 const edited=await renderProject({source,features:[feature]});const delta=measure(base.stl).volume-measure(edited.stl).volume;assert(delta>1,'Actual material must be removed');
 const saved=await save('drlex-phone-holder','cap-hole',source,feature,edited);attempts.push({model:'DrLex smartphone holder',result:'passed',configuration:'Original unchanged',feature,base:measure(base.stl),edited:measure(edited.stl),delta,saved});
} catch(e){attempts.push({model:'DrLex smartphone holder',result:'failed',error:String(e),note:'Bounded 2 mm-grid search required a 2 mm-radius material-clearance ring for a proposed 2 mm-diameter hole. No certified point found; this does not establish that every possible cap position is unusable.'});console.error('DrLex',e);}
if (!retryDrLex && !refreshShell) try {
 const source=await readFile(resolve(external,'t-paul-phone-stand/simple-phone-and-tablet-stand.scad'),'utf8');const base=await renderProject({source,features:[]});const editable=base.parts.filter(p=>p.editable);attempts.push({model:'Torsten phone stand',result:editable.length?'rendered; no edit attempted':'unsupported for editing',base:measure(base.stl),parts:base.parts,diagnostics:base.diagnostics,note:'No geometry rewrite or offset bypass attempted.'});
} catch(e){attempts.push({model:'Torsten phone stand',result:'failed to render',error:String(e)});console.error('Torsten',e);}
await writeFile(resolve(external,'imported-workflow-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(attempts.filter(a=>a.model==='Erlan enclosure').at(-1)?.result!=='passed')process.exitCode=1;
