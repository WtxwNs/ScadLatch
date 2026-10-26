import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import type { Face, Part, RenderResult, Feature } from '../shared/types';

export interface Selection { part: Part; face: Face; u: number; v: number }
export const partMinimum = (part: Part) => part.boundsMin ?? part.size.map(size => part.center ? -size / 2 : 0);
export const usesLocalOrigin = (part: Part) => part.kind === 'hull' || part.kind === 'linear_extrude';
export const axesForFace = (face: Face) => face[0] === 'x' ? [1, 2, 0] : face[0] === 'y' ? [0, 2, 1] : [0, 1, 2];
export function stlBytes(stl: string): Uint8Array {
  if (stl.trimStart().startsWith('solid ') && stl.includes('facet ')) return new TextEncoder().encode(stl);
  const decoded = atob(stl.replace(/^data:[^,]+,/, ''));
  return Uint8Array.from(decoded, char => char.charCodeAt(0));
}
export function selectFace(point: THREE.Vector3, normal: THREE.Vector3, parts: Part[]): Selection | undefined {
  const hits: {selection: Selection; distance: number}[] = [];
  for (const part of parts) {
    if (!part.editable) continue;
    const matrix = new THREE.Matrix4().fromArray(part.matrix);
    if (Math.abs(matrix.determinant()) < 1e-10) continue;
    const local = point.clone().applyMatrix4(matrix.clone().invert());
    const localNormal = normal.clone().applyMatrix3(new THREE.Matrix3().setFromMatrix4(matrix).transpose()).normalize();
    const min = partMinimum(part);
    const tolerance = Math.max(.05, Math.max(...part.size) * .0008);
    for (let axis = 0; axis < 3; axis++) {
      for (const sign of [-1, 1]) {
        const edge = min[axis] + (sign > 0 ? part.size[axis] : 0);
        const distance = Math.abs(local.getComponent(axis) - edge);
        if (distance > tolerance || localNormal.getComponent(axis) * sign < .9995) continue;
        if ([0, 1, 2].some(index => index !== axis && (local.getComponent(index) < min[index] - tolerance || local.getComponent(index) > min[index] + part.size[index] + tolerance))) continue;
        const face = `${'xyz'[axis]}${sign > 0 ? '+' : '-'}` as Face;
        const [uAxis, vAxis] = axesForFace(face);
        hits.push({selection: {part, face, u: local.getComponent(uAxis) - (usesLocalOrigin(part) ? 0 : min[uAxis]), v: local.getComponent(vAxis) - (usesLocalOrigin(part) ? 0 : min[vAxis])}, distance});
      }
    }
  }
  hits.sort((a, b) => a.distance - b.distance || Math.max(...a.selection.part.size) - Math.max(...b.selection.part.size));
  return hits[0]?.selection;
}

interface SceneProps {
  result: RenderResult | null;
  selection: Selection | null;
  preview: Feature | null;
  onSelect: (selection: Selection | null, message?: string) => void;
  onError: (message: string) => void;
  fitToken: number;
  view: 'perspective' | 'front' | 'top';
  wireframe: boolean;
}

export default function Scene(props: SceneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const callbacks = useRef(props); callbacks.current = props;
  const internals = useRef<{scene: THREE.Scene; camera: THREE.PerspectiveCamera; controls: OrbitControls; model: THREE.Mesh; overlay: THREE.Group; grid: THREE.GridHelper; renderer: THREE.WebGLRenderer; fit: (view?: string, keepDirection?: boolean) => void} | null>(null);

  useEffect(() => {
    const host = hostRef.current!;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); }
    catch { callbacks.current.onError('3D graphics could not start. Enable hardware acceleration in your browser, then reload.'); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0xeeeDE7, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    host.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, .01, 100000);
    camera.up.set(0, 0, 1);
    camera.position.set(150, -210, 165);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = .08; controls.target.set(0, 0, 20);
    const ambient = new THREE.HemisphereLight(0xffffff, 0x7d8d94, 2.4); scene.add(ambient);
    const key = new THREE.DirectionalLight(0xfff6e5, 3.5); key.position.set(-100, -160, 260); scene.add(key);
    const rim = new THREE.DirectionalLight(0xc9e3ef, 2); rim.position.set(140, 110, 160); scene.add(rim);
    const material = new THREE.MeshStandardMaterial({color: 0xd5d8cb, roughness: .46, metalness: .08, side: THREE.DoubleSide, flatShading: true});
    const model = new THREE.Mesh(new THREE.BufferGeometry(), material); scene.add(model);
    const grid = new THREE.GridHelper(1000, 100, 0xc5c9c0, 0xd9dcd3); grid.rotation.x = Math.PI / 2; grid.position.z = -.15;
    const gridMaterial = grid.material as THREE.LineBasicMaterial; gridMaterial.transparent = true; gridMaterial.opacity = .48; scene.add(grid);
    const overlay = new THREE.Group(); scene.add(overlay);
    const fit = (view = 'perspective', keepDirection = false) => {
      model.geometry.computeBoundingBox();
      const box = model.geometry.boundingBox;
      if (!box || box.isEmpty()) return;
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const direction = keepDirection ? camera.position.clone().sub(controls.target).normalize() : view === 'front' ? new THREE.Vector3(0, -1, .001) : view === 'top' ? new THREE.Vector3(0, -.001, 1) : new THREE.Vector3(1.2, -1.65, 1.2).normalize();
      direction.normalize();
      const right = new THREE.Vector3().crossVectors(camera.up, direction).normalize();
      const up = new THREE.Vector3().crossVectors(direction, right).normalize();
      const halfFov = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      let distance = 1;
      for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
        const corner = new THREE.Vector3(x * size.x / 2, y * size.y / 2, z * size.z / 2);
        const near = corner.dot(direction);
        distance = Math.max(distance, near + Math.abs(corner.dot(right)) * 1.18 / (halfFov * camera.aspect), near + Math.abs(corner.dot(up)) * 1.18 / halfFov);
      }
      camera.position.copy(center).addScaledVector(direction, distance);
      camera.near = Math.max(distance / 10000, .001); camera.far = distance * 100; camera.updateProjectionMatrix();
      controls.target.copy(center); controls.update();
      grid.position.set(center.x, center.y, box.min.z - Math.max(.15, size.z * .002));
      const gridScale = Math.max(size.x, size.y, size.z) / 150; grid.scale.setScalar(Math.max(gridScale, .05));
    };
    internals.current = {scene, camera, controls, model, overlay, grid, renderer, fit};
    const resize = new ResizeObserver(() => { const width = host.clientWidth; const height = host.clientHeight; if (width && height) { camera.aspect = width / height; camera.updateProjectionMatrix(); renderer.setSize(width, height); } }); resize.observe(host);
    let frame = 0; const draw = () => { frame = requestAnimationFrame(draw); controls.update(); renderer.render(scene, camera); }; draw();
    let down = {x: 0, y: 0};
    const pointerDown = (event: PointerEvent) => { down = {x: event.clientX, y: event.clientY}; };
    const pointerUp = (event: PointerEvent) => {
      if (event.button !== 0 || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5 || !callbacks.current.result) return;
      const bounds = renderer.domElement.getBoundingClientRect();
      const pointer = new THREE.Vector2((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1);
      const ray = new THREE.Raycaster(); ray.setFromCamera(pointer, camera);
      const hit = ray.intersectObject(model)[0];
      if (!hit || !hit.face) { callbacks.current.onSelect(null); return; }
      const selection = selectFace(hit.point, hit.face.normal, callbacks.current.result.parts);
      callbacks.current.onSelect(selection || null, selection ? undefined : 'That surface cannot be edited yet. Select a flat outer face aligned with the local axes of an editable part. Curved and sloping surfaces are not selectable.');
    };
    renderer.domElement.addEventListener('pointerdown', pointerDown); renderer.domElement.addEventListener('pointerup', pointerUp);
    return () => { cancelAnimationFrame(frame); resize.disconnect(); controls.dispose(); model.geometry.dispose(); material.dispose(); grid.geometry.dispose(); gridMaterial.dispose(); renderer.dispose(); renderer.domElement.remove(); internals.current = null; };
  }, []);

  const firstModel = useRef(true);
  useEffect(() => {
    const state = internals.current; if (!state || !props.result) return;
    try {
      const bytes = stlBytes(props.result.stl);
      const geometry = new STLLoader().parse(bytes.buffer as ArrayBuffer);
      geometry.computeVertexNormals(); geometry.computeBoundingBox();
      if (!geometry.getAttribute('position')?.count) throw new Error('No printable geometry was returned.');
      const oldBounds = state.model.geometry.boundingBox;
      const newBounds = geometry.boundingBox!;
      const tolerance = newBounds.getSize(new THREE.Vector3()).length() * .02;
      const boundsChanged = !oldBounds || oldBounds.isEmpty() || oldBounds.min.distanceTo(newBounds.min) > tolerance || oldBounds.max.distanceTo(newBounds.max) > tolerance;
      state.model.geometry.dispose(); state.model.geometry = geometry;
      if (firstModel.current) { state.fit(); firstModel.current = false; }
      else if (boundsChanged) state.fit(callbacks.current.view, true);
    } catch (error) { props.onError(`The generated model could not be displayed: ${error instanceof Error ? error.message : String(error)}`); }
  }, [props.result]);

  useEffect(() => { internals.current?.fit(props.view); }, [props.fitToken, props.view]);
  useEffect(() => { if (internals.current) (internals.current.model.material as THREE.MeshStandardMaterial).wireframe = props.wireframe; }, [props.wireframe]);
  useEffect(() => {
    const state = internals.current; if (!state) return;
    state.overlay.traverse(object => { if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments || object instanceof THREE.Line) { object.geometry.dispose(); const mats = Array.isArray(object.material) ? object.material : [object.material]; mats.forEach(material => material.dispose()); } }); state.overlay.clear();
    const selection = props.selection; if (!selection) return;
    const {part, face} = selection; const [uAxis, vAxis, nAxis] = axesForFace(face);
    const min = partMinimum(part);
    if (usesLocalOrigin(part)) {
      const bounds = new THREE.BoxGeometry(...part.size);
      bounds.translate(...part.size.map((size, axis) => min[axis] + size / 2) as [number, number, number]);
      const outline = new THREE.LineSegments(new THREE.EdgesGeometry(bounds), new THREE.LineBasicMaterial({color: 0x6e8733, transparent: true, opacity: .35}));
      bounds.dispose(); outline.applyMatrix4(new THREE.Matrix4().fromArray(part.matrix)); state.overlay.add(outline);
    }
    const position = new THREE.Vector3(...min as [number, number, number]);
    position.setComponent(uAxis, min[uAxis] + part.size[uAxis] / 2); position.setComponent(vAxis, min[vAxis] + part.size[vAxis] / 2);
    position.setComponent(nAxis, min[nAxis] + (face[1] === '+' ? part.size[nAxis] + .055 : -.055));
    const u = new THREE.Vector3().setComponent(uAxis, 1); const v = new THREE.Vector3().setComponent(vAxis, 1); const n = u.clone().cross(v);
    const transform = new THREE.Matrix4().fromArray(part.matrix).multiply(new THREE.Matrix4().makeBasis(u, v, n).setPosition(position));
    const geometry = new THREE.PlaneGeometry(part.size[uAxis], part.size[vAxis]);
    const fill = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({color: 0xdbf872, transparent: true, opacity: .14, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2}));
    fill.applyMatrix4(transform); state.overlay.add(fill);
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({color: 0x6e8733, transparent: true, opacity: .85})); edge.applyMatrix4(transform); state.overlay.add(edge);
    if (props.preview) {
      const feature = props.preview; const offsetU = feature.anchor === 'origin' ? min[uAxis] : 0; const offsetV = feature.anchor === 'origin' ? min[vAxis] : 0; const points: THREE.Vector3[] = [];
      if (feature.kind === 'circle') { for (let i = 0; i <= 64; i++) { const angle = i / 64 * Math.PI * 2; points.push(new THREE.Vector3(feature.u - offsetU - part.size[uAxis] / 2 + Math.cos(angle) * feature.diameter / 2, feature.v - offsetV - part.size[vAxis] / 2 + Math.sin(angle) * feature.diameter / 2, .08)); } }
      else { const x = feature.u - offsetU - part.size[uAxis] / 2; const y = feature.v - offsetV - part.size[vAxis] / 2; const w = feature.width / 2; const h = feature.height / 2; points.push(...[[x-w,y-h],[x+w,y-h],[x+w,y+h],[x-w,y+h],[x-w,y-h]].map(([x,y]) => new THREE.Vector3(x,y,.08))); }
      const outline = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({color: 0xf3674d, depthTest: false})); outline.renderOrder = 3; outline.applyMatrix4(transform); state.overlay.add(outline);
    }
  }, [props.selection, props.preview]);
  return <div className="scene" ref={hostRef} aria-label="Interactive 3D model. Drag to orbit, scroll to zoom, click a flat outer face to select it." />;
}
