import { StrictMode, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowDownToLine, ArrowLeft, ArrowRight, Box, Check, ChevronDown, Circle, Code2, Crosshair, FileJson, FolderOpen, Layers3, LoaderCircle, Maximize, MousePointer2, Plus, RotateCcw, Save, ScanLine, Square, Undo2, X } from 'lucide-react';
import Scene, { axesForFace, partMinimum, usesLocalOrigin, stlBytes, type Selection } from './scene';
import type { Feature, RenderResult } from '../shared/types';
import { hasMaterialRemoval, measureStl } from '../shared/mesh';
import './style.css';

interface Example { name: string; description: string; source: string }
interface Snapshot { source: string; features: Feature[]; name: string }
interface Scalar { name: string; value: string; start: number; end: number }
function scalarParameters(source: string): Scalar[] {
  const masked = source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\r\n]*|"(?:\\.|[^"\\])*"/g, value => value.replace(/[^\r\n]/g, ' '));
  const matches = [...masked.matchAll(/(?<![A-Za-z0-9_$])([A-Za-z_][A-Za-z_0-9]*)\s*=\s*(-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*;/gi)];
  let cursor = 0; const depth = [0, 0, 0];
  const topLevel = matches.filter(match => {
    for (; cursor < match.index!; cursor++) {
      const char = masked[cursor];
      ['{}', '()', '[]'].forEach((pair, index) => {if (char === pair[0]) depth[index]++; else if (char === pair[1]) depth[index]--;});
    }
    return depth.every(value => value === 0) && !match[1].startsWith('_');
  });
  return topLevel.filter((match, index) => !topLevel.slice(index + 1).some(other => other[1] === match[1])).map(match => {
    const start = match.index! + match[0].indexOf('=') + 1 + match[0].slice(match[0].indexOf('=') + 1).search(/\S/);
    return {name: match[1], value: source.slice(start, start + match[2].length), start, end: start + match[2].length};
  });
}
function download(name: string, contents: string | Uint8Array, type: string) {
  const blob = new Blob([typeof contents === 'string' ? contents : contents.buffer as ArrayBuffer], {type});
  const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}
const cleanName = (name: string) => name.replace(/\.(scadlatch\.json|scad)$/i, '').replace(/[^a-z0-9_-]/gi, '-').replace(/-+/g, '-').toLowerCase() || 'my-model';
const friendlyFace = (face: string) => ({'x+': 'Right', 'x-': 'Left', 'y+': 'Back', 'y-': 'Front', 'z+': 'Top', 'z-': 'Bottom'}[face] || face);
const round = (value: number) => Math.round(value * 10) / 10;

function App() {
  const [source, setSource] = useState('');
  const [features, setFeatures] = useState<Feature[]>([]);
  const [name, setName] = useState('Untitled model');
  const [result, setResult] = useState<RenderResult | null>(null);
  const [committed, setCommitted] = useState<Snapshot | null>(null);
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [examples, setExamples] = useState<Example[]>([]);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [draft, setDraft] = useState<Feature | null>(null);
  const [busy, setBusy] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [sourceOpen, setSourceOpen] = useState(false);
  const [editorSource, setEditorSource] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const [examplesOpen, setExamplesOpen] = useState(false);
  const [fitToken, setFitToken] = useState(0);
  const [view, setView] = useState<'perspective' | 'front' | 'top'>('perspective');
  const [wireframe, setWireframe] = useState(false);
  const [tab, setTab] = useState<'feature' | 'dimensions'>('feature');
  const [health, setHealth] = useState<'checking' | 'ready' | 'unavailable'>('checking');
  const fileInput = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);
  const current = useRef({committed, selection}); current.current = {committed, selection};
  const dirty = !!committed && source !== committed.source;
  const parameters = useMemo(() => scalarParameters(source), [source]);

  async function render(next: Snapshot, options: {reset?: boolean; undo?: boolean} = {}) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setSeconds(0); setError(''); setNotice('');
    try {
      const response = await fetch('/api/render', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({source: next.source, features: next.features})});
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || data.message || `The model could not be compiled (${response.status}).`);
      if (typeof data.stl !== 'string' || !data.stl.length || !Array.isArray(data.parts) || typeof data.exportSource !== 'string') throw new Error('The model service returned an incomplete result. Your previous model is still available.');
      const previous = current.current.committed;
      if (!options.reset && result && previous && next.source === previous.source && next.features.length > previous.features.length) {
        if (!hasMaterialRemoval(measureStl(result.stl), measureStl(data.stl))) {
          throw new Error('That opening did not remove measurable material. Move it onto solid material, change its size or depth, or select another face. Your last successful model and this draft are unchanged.');
        }
      }
      if (options.reset) setHistory([]);
      else if (!options.undo && previous) setHistory(items => [...items, previous].slice(-30));
      setResult(data); setSource(next.source); setFeatures(next.features); setName(next.name); setCommitted(next); setHealth('ready');
      if (options.reset) {setSelection(null); setDraft(null); setView('perspective'); setFitToken(token => token + 1);}
      else {
        const selected = current.current.selection;
        const part = selected && (data as RenderResult).parts.find(part => part.primitiveId === selected.part.primitiveId && part.route === selected.part.route);
        if (selected && part) setSelection({...selected, part}); else {setSelection(null); setDraft(null);}
      }
      if (next.features.length > (previous?.features.length || 0)) {setDraft(null); setNotice('Feature added. Your editable source is ready to export.');}
      return true;
    } catch (error) {setError(error instanceof Error ? error.message : String(error)); return false;}
    finally {inFlight.current = false; setBusy(false);}
  }

  useEffect(() => {
    fetch('/api/health').then(response => setHealth(response.ok ? 'ready' : 'unavailable')).catch(() => setHealth('unavailable'));
    fetch('/api/examples').then(async response => {if (!response.ok) throw new Error('Could not load the starter models. You can still open your own .scad file.'); return response.json();}).then((items: Example[]) => {
      setExamples(items); if (items[0]) void render({source: items[0].source, features: [], name: items[0].name}, {reset: true});
    }).catch(error => setError(error.message));
  }, []);
  useEffect(() => { if (sourceOpen) setEditorSource(source); }, [sourceOpen]);
  useEffect(() => { if (!busy) return; const timer = setInterval(() => setSeconds(value => value + 1), 1000); return () => clearInterval(timer); }, [busy]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 7000); return () => clearTimeout(timer); }, [notice]);

  function select(next: Selection | null, message?: string) {
    if (busy || dirty) {if (dirty) setNotice('Rebuild your parameter changes before selecting a face.'); return;}
    setSelection(next); setDraft(null); if (message) setNotice(message); else setNotice(''); if (next) setTab('feature');
  }
  function beginFeature(kind: Feature['kind']) {
    if (!selection) return;
    const [uAxis, vAxis] = axesForFace(selection.face);
    const w = selection.part.size[uAxis], h = selection.part.size[vAxis];
    const diameter = round(Math.min(12, w * .4, h * .4));
    const origin = usesLocalOrigin(selection.part), min = partMinimum(selection.part);
    const width = round(Math.min(22, w * .5)), height = round(Math.min(10, h * .4));
    const halfU = (kind === 'circle' ? diameter : width) / 2, halfV = (kind === 'circle' ? diameter : height) / 2;
    const clamp = (value: number, low: number, size: number, half: number) => Math.max(low + half, Math.min(low + size - half, round(value)));
    setDraft({primitiveId: selection.part.primitiveId, route: selection.part.route, face: selection.face, kind, anchor: origin ? 'origin' : 'edge', u: clamp(selection.u, origin ? min[uAxis] : 0, w, halfU), v: clamp(selection.v, origin ? min[vAxis] : 0, h, halfV), width, height, diameter, depth: 6});
  }
  async function openFile(file: File) {
    if (file.size > (/\.json$/i.test(file.name) ? 1_000_000 : 250_000)) {setError('Choose a self-contained .scad file under 250 KB or a ScadLatch project under 1 MB.'); return;}
    try {
      const text = await file.text();
      if (/\.json$/i.test(file.name)) {
        const project = JSON.parse(text);
        if (project.format !== 'scadlatch' || typeof project.source !== 'string' || !Array.isArray(project.features)) throw new Error('This is not a ScadLatch project. Open a .scad or a saved .scadlatch.json file.');
        await render({source: project.source, features: project.features, name: project.name || cleanName(file.name)}, {reset: true});
      } else if (/\.scad$/i.test(file.name)) await render({source: text, features: [], name: cleanName(file.name)}, {reset: true});
      else setError('Choose an OpenSCAD .scad file or a saved .scadlatch.json project.');
    } catch (error) {setError(error instanceof Error ? error.message : String(error));}
  }
  async function undo() { const previous = history[history.length - 1]; if (previous && !busy && await render(previous, {undo: true})) setHistory(items => items.slice(0, -1)); }
  const save = () => download(`${cleanName(name)}.scadlatch.json`, JSON.stringify({format: 'scadlatch', version: 1, name, source, features}, null, 2), 'application/json');
  const exportFile = (type: 'stl' | 'scad') => {if (!result) return; download(`${cleanName(name)}-latched.${type}`, type === 'stl' ? stlBytes(result.stl) : result.exportSource, type === 'stl' ? 'model/stl' : 'text/plain'); setExportOpen(false); setNotice(type === 'stl' ? 'STL downloaded.' : 'Editable OpenSCAD source downloaded. Your changes are included.');};
  const draftError = useMemo(() => {
    if (!draft || !selection) return '';
    const [u, v] = axesForFace(draft.face); const halfU = (draft.kind === 'circle' ? draft.diameter : draft.width) / 2; const halfV = (draft.kind === 'circle' ? draft.diameter : draft.height) / 2;
    if (![draft.u, draft.v, draft.width, draft.height, draft.diameter, draft.depth].every(Number.isFinite)) return 'Enter a number in every field.';
    if (halfU <= 0 || halfV <= 0 || draft.depth < 0) return 'Feature dimensions must be positive.';
    const min = partMinimum(selection.part); const minU = draft.anchor === 'origin' ? min[u] : 0, minV = draft.anchor === 'origin' ? min[v] : 0;
    if (draft.u - halfU < minU || draft.u + halfU > minU + selection.part.size[u] || draft.v - halfV < minV || draft.v + halfV > minV + selection.part.size[v]) return 'Keep the opening within the part bounds. Bounds may include empty areas; inspect the result on the model.';
    return '';
  }, [draft, selection]);
  const dims = selection ? axesForFace(selection.face).slice(0, 2).map(index => round(selection.part.size[index])) : [];
  const localPositions = draft?.anchor === 'origin';
  const currentCenter = selection ? axesForFace(selection.face).slice(0, 2).map(axis => (localPositions ? partMinimum(selection.part)[axis] : 0) + selection.part.size[axis] / 2) : [0, 0];
  const shapeName = selection?.part.kind === 'hull' ? 'Hull body' : selection?.part.kind === 'linear_extrude' ? 'Extruded body' : 'Box';
  const editableCount = result?.parts.filter(part => part.editable).length || 0;

  return <div className="app-shell" onDragOver={event => event.preventDefault()} onDrop={event => {event.preventDefault(); if (!busy && event.dataTransfer.files[0]) void openFile(event.dataTransfer.files[0]);}}>
    <header className="topbar">
      <div className="brand" aria-label="ScadLatch"><span className="brand-icon"><span/><i/></span><span>Scad<span className="brand-light">Latch</span><sup>α</sup></span></div>
      <span className="brand-tag">MAKE IT YOURS.</span>
      <div className="top-actions">
        <div className="dropdown-container"><button className="quiet-button" disabled={busy} onClick={() => setExamplesOpen(!examplesOpen)}><Layers3 size={15}/><span>Examples</span><ChevronDown size={13}/></button>{examplesOpen && <div className="dropdown examples-menu">{examples.map(example => <button key={example.name} onClick={() => {setExamplesOpen(false); void render({source: example.source, features: [], name: example.name}, {reset: true});}}><Box size={18}/><span><strong>{example.name}</strong><small>{example.description}</small></span></button>)}</div>}</div>
        <button className="quiet-button open-button" aria-label="Open model" disabled={busy} onClick={() => fileInput.current?.click()}><FolderOpen size={16}/><span>Open model</span></button>
        <span className={`runtime ${health}`}><i/>{health === 'ready' ? 'LOCAL WORKSPACE' : health === 'checking' ? 'CONNECTING' : 'ENGINE UNAVAILABLE'}</span>
      </div>
      <input ref={fileInput} type="file" accept=".scad,.scadlatch.json,.json" hidden onChange={event => {const file = event.target.files?.[0]; if (file) void openFile(file); event.target.value = '';}} />
    </header>
    <main className="workbench">
      <section className="stage" aria-label="Model workspace">
        <div className="stage-heading"><div><div className="eyebrow"><span className="tiny-square"/> PARAMETRIC / PLAYGROUND</div><h1>{name}<span>.scad</span></h1><p>Point at a part. Add a feature. Keep the source.</p></div><button className="icon-button source-shortcut" onClick={() => setSourceOpen(true)} title="Edit OpenSCAD source" aria-label="Edit source"><Code2 size={19}/></button></div>
        <Scene result={result} selection={selection} preview={draft} onSelect={select} onError={setError} fitToken={fitToken} view={view} wireframe={wireframe}/>
        <div className="stage-coordinate"><span>Z</span><svg width="42" height="42" viewBox="0 0 42 42" aria-hidden="true"><path d="M20 30V4M20 30L40 38M20 30L3 39" fill="none" stroke="currentColor" strokeWidth="1.4"/><circle cx="20" cy="30" r="3" fill="currentColor"/></svg><span>Y <i>X</i></span></div>
        {selection && <div className="selection-badge"><span className="green-dot"/><strong>{friendlyFace(selection.face)} face</strong><span>{dims.join(' × ')} mm</span>{draft && <em>CUT PREVIEW</em>}<button onClick={() => {setSelection(null); setDraft(null);}} aria-label="Clear selection"><X size={13}/></button></div>}
        {!result && !busy && <div className="empty-stage"><Box size={44} strokeWidth={1}/><h2>A starting point for your next thing.</h2><p>Open a self-contained .scad file, or choose an example.</p><button className="ink-button" onClick={() => fileInput.current?.click()}><FolderOpen size={16}/> Open a model</button></div>}
        {busy && <div className={`build-status ${result ? 'compact' : ''}`}><LoaderCircle size={18} className="spin"/><div><strong>{result ? 'Rebuilding your model' : 'Building the real geometry'}</strong><span>{seconds < 2 ? 'OpenSCAD is working locally' : `${seconds}s · ${result ? 'Your last result stays visible' : 'First render may take a moment'}`}</span></div></div>}
        <div className="stage-bottom"><div className="interaction-hint"><MousePointer2 size={14}/><span>Click a flat outer face</span><i/>Drag to orbit · Scroll to zoom</div><div className="view-controls"><button className={view === 'perspective' ? 'active' : ''} onClick={() => {setView('perspective'); setFitToken(token => token + 1);}} title="Perspective view">3D</button><button className={view === 'front' ? 'active' : ''} onClick={() => {setView('front'); setFitToken(token => token + 1);}}>Front</button><button className={view === 'top' ? 'active' : ''} onClick={() => {setView('top'); setFitToken(token => token + 1);}}>Top</button><span/><button className={wireframe ? 'active' : ''} onClick={() => setWireframe(!wireframe)} title="Toggle wireframe" aria-label="Toggle wireframe"><ScanLine size={16}/></button><button onClick={() => setFitToken(token => token + 1)} title="Fit model in view" aria-label="Fit model in view"><Maximize size={16}/></button></div></div>
        <div className="stage-footer"><span><span className="status-dot"/>{result ? 'REAL GEOMETRY' : 'WAITING FOR A MODEL'}</span><span>{editableCount} editable {editableCount === 1 ? 'part' : 'parts'}<i/>millimetres{result && <><i/>{(result.durationMs / 1000).toFixed(1)}s build</>}</span></div>
      </section>
      <aside className="inspector">
        <div className="inspector-title"><div><span className="eyebrow">THE GOOD PART</span><h2>Make a change.</h2></div><span className="step-number">01—03</span></div>
        <div className="inspector-tabs"><button className={tab === 'feature' ? 'active' : ''} onClick={() => setTab('feature')}><Plus size={15}/> Add a feature</button><button className={tab === 'dimensions' ? 'active' : ''} onClick={() => setTab('dimensions')}><Maximize size={14}/> Parameters</button></div>
        <div className="inspector-scroll">
          {tab === 'feature' ? <>
            <section className={`selection-card ${selection ? 'has-selection' : ''}`}><div className="section-label"><span>01</span> CHOOSE A SURFACE</div>{selection ? <><div className="selected-part"><Box size={28} strokeWidth={1.3}/><div><strong>{friendlyFace(selection.face)} face <small>{selection.face.toUpperCase()}</small></strong><span>{shapeName} · {dims.join(' × ')} mm</span></div><Check size={17}/></div><p>{usesLocalOrigin(selection.part) ? 'The cut follows this outer face. Its position across the face stays relative to the original local origin.' : 'The cut follows this face and keeps its offsets from the lower edges.'}</p></> : <><div className="choose-visual"><div className="mini-box"><i/><b/><span/></div><MousePointer2 size={23}/></div><h3>Start with a face.</h3><p>Click a flat outer surface on the model. Your change stays attached to that part.</p></>}</section>
            <section className="feature-section"><div className="section-label"><span>02</span> MAKE ROOM FOR SOMETHING</div><div className="feature-kinds"><button disabled={!selection || busy || dirty} className={draft?.kind === 'circle' ? 'selected' : ''} onClick={() => beginFeature('circle')}><Circle size={25} strokeWidth={1.4}/><strong>Round hole</strong><small>Cables, bolts, airflow</small><Plus size={13}/></button><button disabled={!selection || busy || dirty} className={draft?.kind === 'rectangle' ? 'selected' : ''} onClick={() => beginFeature('rectangle')}><Square size={25} strokeWidth={1.4}/><strong>Opening</strong><small>Ports, slots, access</small><Plus size={13}/></button></div></section>
            {draft && <section className="feature-editor"><div className="editor-top"><span>YOUR {draft.kind === 'circle' ? 'HOLE' : 'OPENING'}</span><button onClick={() => setDraft(null)} aria-label="Cancel feature"><X size={14}/></button></div><div className="number-grid">{draft.kind === 'circle' ? <NumberField label="Diameter" value={draft.diameter} onChange={diameter => setDraft({...draft, diameter})}/> : <><NumberField label="Width" value={draft.width} onChange={width => setDraft({...draft, width})}/><NumberField label="Height" value={draft.height} onChange={height => setDraft({...draft, height})}/></>}</div><div className="field-section"><div className="field-heading"><span>{localPositions ? 'LOCAL POSITIONS' : 'POSITION FROM LOWER EDGES'}</span><button onClick={() => setDraft({...draft, u: currentCenter[0], v: currentCenter[1]})}><Crosshair size={12}/> Current center</button></div><div className="number-grid"><NumberField label={localPositions ? `Local ${'XYZ'[axesForFace(draft.face)[0]]} position` : `${'XYZ'[axesForFace(draft.face)[0]]} offset`} value={draft.u} onChange={u => setDraft({...draft, u})}/><NumberField label={localPositions ? `Local ${'XYZ'[axesForFace(draft.face)[1]]} position` : `${'XYZ'[axesForFace(draft.face)[1]]} offset`} value={draft.v} onChange={v => setDraft({...draft, v})}/></div><p className="field-note position-note">{localPositions ? 'Coordinates use the original local origin and may be negative. They are not automatic margins from the lower edges. The outer face follows size changes; these positions stay fixed.' : 'Offsets measure from the lower edges to the opening center and stay fixed when dimensions change.'} Current center uses the current bounds only; it does not keep the opening centered after resizing.</p></div><div className="field-section"><NumberField label="Cut depth" value={draft.depth} onChange={depth => setDraft({...draft, depth})} disabled={draft.depth === 0}/><label className="check-field"><input type="checkbox" checked={draft.depth === 0} onChange={event => setDraft({...draft, depth: event.target.checked ? 0 : 6})}/>Through the whole selected part</label><p className="field-note">A shallow cut opens one wall. Through cuts can also open the opposite wall.</p></div>{draftError && <p className="inline-error">{draftError}</p>}<button className="lime-button" disabled={busy || !!draftError || dirty} onClick={() => void render({source, features: [...features, draft], name})}>{busy ? <LoaderCircle size={16} className="spin"/> : <Plus size={17}/>} Add {draft.kind === 'circle' ? 'hole' : 'opening'}<ArrowRight size={16}/></button><p className="preview-note">Coral outline is a preview. Apply to cut real geometry.</p></section>}
          </> : <section className="parameters-section"><div className="section-label"><span>↔</span> CHANGE THE ORIGINAL DIMENSIONS</div><h3>Still your parametric model.</h3><p>Edit numeric source parameters, then rebuild. Features follow their chosen face. Box edge offsets and compound-body local positions stay at the values you set; neither automatically recenters.</p>{parameters.length ? <div className="parameter-list">{parameters.map(parameter => <NumberField key={parameter.name} label={parameter.name.replace(/_/g, ' ')} unit="" value={Number(parameter.value)} onChange={value => setSource(text => text.slice(0, parameter.start) + value + text.slice(parameter.end))}/>)}</div> : <div className="no-params"><Code2 size={20}/><p>No top-level numeric parameters found. You can edit the original source directly.</p></div>}<button className="lime-button" disabled={busy || !source || !dirty} onClick={() => void render({source, features, name})}><RotateCcw size={15}/>{dirty ? 'Rebuild with changes' : 'Model is up to date'}<ArrowRight size={16}/></button>{dirty && <button className="text-button" disabled={busy} onClick={() => {if (committed) {setSource(committed.source); setError('');}}}><Undo2 size={14}/> Discard parameter changes</button>}<button className="text-button" onClick={() => setSourceOpen(true)}><Code2 size={14}/> Open source editor</button></section>}
          <section className="feature-history"><div className="section-label"><span>03</span> YOUR CHANGES <b>{String(features.length).padStart(2, '0')}</b></div>{features.length ? features.map((feature, index) => <div className="history-item" key={`${index}-${feature.route}`}>{feature.kind === 'circle' ? <Circle size={15}/> : <Square size={15}/>}<div><strong>{feature.kind === 'circle' ? `Ø ${feature.diameter} mm hole` : `${feature.width} × ${feature.height} mm opening`}</strong><span>{friendlyFace(feature.face)} face · {feature.depth === 0 ? 'through part' : `${feature.depth} mm deep`}</span></div><button disabled={busy || dirty} title="Remove feature" aria-label={`Remove feature ${index + 1}`} onClick={() => void render({source, features: features.filter((_, i) => i !== index), name})}><X size={13}/></button></div>) : <p className="history-empty">Your first modification goes here.</p>}</section>
          <div className="source-promise"><Code2 size={18}/><div><strong>Source comes with you.</strong><p>Export an STL and an editable .scad. No account. No cloud.</p></div></div>
        </div>
        <div className="inspector-bottom"><div className="secondary-actions"><button disabled={!history.length || busy} onClick={() => void undo()}><Undo2 size={15}/> Undo</button><button disabled={!source || busy} onClick={save}><Save size={14}/> Save project</button></div><div className="dropdown-container export-container"><button className="export-button" disabled={!result || busy || dirty} onClick={() => setExportOpen(!exportOpen)}><ArrowDownToLine size={18}/><span>Take it with you</span><ChevronDown size={16}/></button>{exportOpen && <div className="dropdown export-menu"><button onClick={() => exportFile('scad')}><Code2 size={18}/><span><strong>Editable OpenSCAD</strong><small>Original source + your modifications</small></span><ArrowDownToLine size={14}/></button><button onClick={() => exportFile('stl')}><Box size={18}/><span><strong>STL</strong><small>Real geometry for your slicer</small></span><ArrowDownToLine size={14}/></button><button onClick={() => {save(); setExportOpen(false);}}><FileJson size={18}/><span><strong>ScadLatch project</strong><small>Continue editing here later</small></span><ArrowDownToLine size={14}/></button></div>}</div>{dirty && <span className="dirty-hint">Rebuild changes before exporting.</span>}</div>
      </aside>
    </main>
    {(error || notice) && <div className={`toast ${error ? 'error' : ''}`} role={error ? 'alert' : 'status'}><span>{error ? <span className="alert-icon">!</span> : <Check size={17}/>}</span><div><strong>{error ? 'Couldn’t complete that change' : 'Workspace update'}</strong><p>{error || notice}</p>{error && result && <small>Your last successful model is still on the canvas.</small>}</div><button onClick={() => {setError(''); setNotice('');}} aria-label="Dismiss message"><X size={17}/></button></div>}
    {!!result?.diagnostics.length && <details className="diagnostics"><summary>Build notes ({result.diagnostics.length})</summary><pre>{result.diagnostics.join('\n')}</pre></details>}
    {sourceOpen && <div className="modal-backdrop" onClick={() => setSourceOpen(false)}><section className="source-modal" onClick={event => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="OpenSCAD source editor"><header><div><span className="eyebrow">THE ORIGINAL, ALWAYS EDITABLE</span><h2>Your source.</h2></div><button className="icon-button" onClick={() => setSourceOpen(false)} aria-label="Close source editor"><X size={20}/></button></header><p>Editing the original source here resets applied features, because structural changes can identify different parts. Use the Parameters panel to resize and keep your features.</p><textarea value={editorSource} onChange={event => setEditorSource(event.target.value)} spellCheck={false} aria-label="OpenSCAD source"/><footer><button className="quiet-button" onClick={() => setSourceOpen(false)}><ArrowLeft size={15}/> Back to model</button><button className="ink-button" disabled={busy || !editorSource.trim()} onClick={async () => {if (await render({source: editorSource, features: [], name})) {setSourceOpen(false); setSelection(null); setDraft(null);}}}>{busy ? <LoaderCircle size={15} className="spin"/> : <RotateCcw size={15}/>} Apply source &amp; reset edits</button></footer></section></div>}
  </div>;
}

function NumberField({label, value, onChange, disabled = false, unit = 'mm'}: {label: string; value: number; onChange: (value: number) => void; disabled?: boolean; unit?: string}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(Number.isFinite(value) ? String(value) : ''), [value]);
  return <label className="number-field"><span>{label}</span><div><input type="number" step="0.5" value={text} disabled={disabled} onBlur={() => {if (!text.trim() || !Number.isFinite(Number(text))) setText(String(value));}} onChange={event => {const next = event.target.value; setText(next); if (next.trim() && Number.isFinite(Number(next))) onChange(Number(next));}}/>{unit && <span>{unit}</span>}</div></label>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><App/></StrictMode>);
