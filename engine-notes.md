# How ScadLatch keeps an edit attached

The original SCAD plus the feature list is the authority. The app never reparses
its previous generated export to reconstruct a project. A structural source edit
resets features; changing top-level numeric parameters preserves them.

## Source and instance identity

`src/engine/source.ts` uses openscad-parser 0.6.3 for syntax and recursive token
ranges. A node's own span does not include all descendant tokens. Source calls
receive stable traversal IDs, and generated dynamic `let` scopes accumulate the
actual invocation route. Two explicit calls of the same module have different
routes. Repeated loop invocations with the same route are deliberately ambiguous.

A traced OpenSCAD compilation emits route keys and matching colors into the
native evaluated CSG tree. `src/server/csg.ts` reads that tree, composes affine
transforms and maps supported bodies back to their source route. Subtraction,
background geometry, inner parts of boundary-changing operations, and ambiguous
traces cannot become editable targets. Traces are never included in exported SCAD.

## Placement rules

Cube cuts retain the original size and center expressions. Their two in-plane
coordinates are distances from the lower local edges. The normal coordinate
follows the selected positive or negative face.

Hull and straight-extrusion cuts use fixed coordinates from the original local
origin; negative positions are valid. A through cut is a long cutting tube. For
a finite-depth cut, a convex envelope is expanded in the two in-plane directions
by four translated copies. Within the supported coordinate range its normal
extrema form flat planes. Subtracting an inward-translated copy makes a slab at
the selected outer plane; intersecting it with the tube produces the cutter.
This avoids baking a currently evaluated dimension into the exported source.

The lateral expansion is 2,000,000 local units. The tube spans +/-1,000,000.
The server rejects edited compounds reaching +/-900,000 in any local dimension.
The finite envelope is an implementation limit, not infinite geometry. Caps
suppress tracing dynamically even inside called user modules, and retain child
edits. Multiple cuts subtract from the same original body: depth is measured
from the outer plane, not from a previous hole's bottom.

## Selection and bounds

Bounds come from directional extrema of supported evaluated CSG nodes, not from
executing a second SCAD interpreter. Unsupported bounds operations reject the
whole compound. Difference uses the first operand's conservative envelope;
analytic round-primitive bounds can also exceed their faceted mesh.

The UI therefore requires a hit on the actual exported STL, at a bounds plane,
with a sufficiently aligned local normal. Sloping and curved faces are not
selectable. A bounding rectangle does not guarantee solid material everywhere
inside a concave face. The coral outline is a placement preview; inspect the
rebuilt result for partial cuts. Adding a feature that does not measurably remove
material is rejected by the UI, with the last successful model retained.

## Native geometry and maintenance

`src/server/runtime.ts` invokes the separately installed official OpenSCAD CLI
with argument arrays and no shell. Output must contain real STL triangles.
Warnings about unknown symbols or invalid arguments are errors, since OpenSCAD
can otherwise silently omit geometry. Other warnings remain visible; generating
an STL does not certify manifoldness or printability.

Each invocation has a 90-second limit. On Windows the owned process tree is
stopped because the official .com launcher starts a child .exe. Temporary files
are removed after the invocation. The local server accepts its own localhost
Host/Origin only; it is not a public rendering service.

Run `npm test`, both `scripts/check-workflow.ts` and
`scripts/check-compound-workflow.ts` with `node --import tsx`, then `npm run build`.
These check real material removal, resized attachment, unchanged sibling
instances, concave shallow-cut placement, and independent generated source.
The same external-source results, including failures and model licenses, live in
`docs/imported-model.md` and `examples/external/`.
