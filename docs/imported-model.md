# Imported-model workflow recheck

2026-10-26. This recheck uses the **same three external originals** below; no new model search and no geometry rewritten to fit the supported subset. It calls the actual product runtime and face-selection logic from a terminal. The reviewer previously implemented the UI extension, so this is a separate reproduction task, **not an independent implementation audit or human usability test**.

## Current results

| Original | Current attempted workflow | Result |
| --- | --- | --- |
| Erlan Cassiano enclosure, MIT | Disable the lid, add a rectangular opening to the rounded shell's right wall, then lengthen the original enclosure parameter | Material-edit and standalone-export checks passed; inherited non-manifold warnings remain |
| DrLex SmartphoneHolder v2.1, CC BY 4.0 | Find real material on the main extrusion's positive local Z end cap for a small hole | Extrusion is selectable, but the bounded conservative material search found no certified point; no hole applied |
| Torsten Paul phone stand, CC BY-SA 4.0 | Render the unchanged original through the complete product path | Hit the 90-second OpenSCAD timeout; no edit, resolution reduction or offset workaround |

### Open and use the completed shell edit

Open [`shell-side-opening.scadlatch.json`](../examples/external/erlancassiano-enclosure/shell-side-opening.scadlatch.json) in ScadLatch. The source is the original enclosure with **only `show_lid=false`**. The saved feature targets the rounded outer shell's **local X+ wall**, uses **Local Y position 25 mm, Local Z position 10 mm**, and is a **12 × 6 mm rectangle, depth 4 mm**. These are local-origin coordinates, not lower-edge margins. A ray through the real STL confirmed exposed wall material at that point.

In Parameters, change `pcb_len` from **80 to 110**, then rebuild. The same feature follows the new right wall. A ready-made resized project is [`shell-side-opening-wide.scadlatch.json`](../examples/external/erlancassiano-enclosure/shell-side-opening-wide.scadlatch.json). Both have matching `.scad` and independently compiled `.stl` beside them.

| Geometry | Original volume mm³ | Edited volume mm³ | Actual removal |
| --- | ---: | ---: | ---: |
| pcb_len 80 | 24,657.500354 | 24,477.500354 | 180.000000 mm³ |
| pcb_len 110 | 31,482.520465 | 31,302.520465 | 180.000000 mm³ |

After the fixed-plane-cap correction, `node --import tsx scripts/check-imported-workflow.ts --refresh-shell` refreshed both shell projects/SCAD/STL and independently recompiled them: both volume removals remain exactly **180 mm³**. The two phone models were not rerun; their failed attempts remain in the result file.

Removal matches a 12 × 6 mm opening through the author's 2.5 mm wall. Each baseline has 3,424 STL triangles; each edit has 3,444. Standalone OpenSCAD recompilation of both exports reproduces the measured volume. **This is not a valid-mesh or printability certificate:** all four meshes have eight undirected edges whose triangle incidence is not two, and exported recompilation reports `Simple: no` and a non-manifold warning. The same edge anomalies are present before the edit. Repair and physical fabrication were not attempted.

### Retained unsuccessful attempts

DrLex's default source now exposes its positive `linear_extrude` body (local bounds minimum −20.3939, 0, 0; size 49.8889 × 66.7912 × 60 mm). A 2 mm grid search raycast the actual positive Z cap and checked 16 points on a conservative 2 mm-radius clearance ring for a proposed 2 mm-diameter, 2 mm-deep hole. No certified point was found. The first scan also contained a test-harness loop-label error that skipped X candidates; that error was corrected and the same original was tried once more, with the same negative result. Both failures are retained. This proves neither that the extrusion is wholly uneditable nor that no smaller or differently placed hole can work.

Torsten's unchanged original did not finish the complete product render within 90 seconds. Its previously observed unsupported offset/profile boundary remains unresolved; no success is inferred from source parsing alone.

## Reproduce the bounded check

After setup, from the project directory:

```sh
node --import tsx scripts/check-imported-workflow.ts
```

The script uses `renderProject`, tests actual STL intersections with the UI's strict planar-face selector, computes triangle volumes, writes the two shell projects/exports, and recompiles exported SCAD with the configured OpenSCAD executable. It records all attempts in [`imported-workflow-results.json`](../examples/external/imported-workflow-results.json), retaining previous runs. Its nonzero exit gate covers the required shell edit; consult the result JSON for unsupported/failed phone-stand attempts even when the command exits zero. The optional `--retry-drlex` flag was used only to correct the disclosed harness issue without re-running or replacing the other inputs.

Original author/version/license details remain in [external model notices](../examples/external/README.md). No adoption, comparative user benefit or compatibility percentage is established.

---

The earlier narrower implementation results below are retained as history, not the current support matrix.

# Historical cube-only check

Date: 2026-10-26. Runtime: official OpenSCAD 2021.01 Windows x64 CLI. This bounded
check tried **three public source files**, in the order below. There was no fourth
search after seeing the results, and no geometry was rewritten to fit the app.
It checks importing and modifying an existing model; it does not establish broad
model compatibility, physical fit, printing quality, or user adoption.

## All attempted inputs

| Existing input | Actual result |
| --- | --- |
| DrLex's `SmartPhoneHolder.scad`, version 2.1, CC BY 4.0 | Source parsed and OpenSCAD evaluated its CSG. There are 15 cube expressions in the source, but **zero selectable positive cubes** in the default model. Its main body is an extruded profile and its relevant cubes act as cutters. No feature was applied; no STL success is claimed. |
| Torsten Paul's `simple-phone-and-tablet-stand.scad`, CC BY-SA 4.0 | Source parsed and CSG evaluated. Two cube expressions, **zero selectable positive cubes**. Main shapes use profiles/spheres; cubes occur as subtraction operands. No feature was applied; no STL success is claimed. |
| Erlan Cassiano's `enclosure.scad`, MIT | Source parsed and CSG evaluated. Four cube expressions, **one selectable positive cuboid**, the lid registration lip. Rounded shell/plate geometry uses cylinder hulls and is not selectable. An edit to that one lip produced a changed STL and an independently executable SCAD export. |

Original inputs, authors, licenses and recorded versions are in
[`examples/external`](../examples/external/README.md). The unsupported files are
included, so this is not a success-only example set. Three targeted files are not
a representative sample or a basis for a compatibility percentage.

## The completed edit

The enclosure author provides a `show_base` parameter for exporting base and lid
separately. For this check it was changed from `true` to `false`; the original
file is retained unchanged. This is the only source configuration change before
adding the feature. The lid's existing cuboid registration lip is 79.4 × 49.4 ×
4 mm, translated to `[2.8, 2.8, 16.5]` by the original program.

Feature: a 2 mm round hole, through the lip's local X dimension, entering the
`x+` face at local lower-edge offsets `u=10 mm`, `v=2 mm`. The composed code keeps
the lip's size expression (`pcb_len - 2 * lid_clear`, etc.) and its original
coordinate frame. The route was
`/n48/n49/n40/n41/n43/n44`, primitive `n44`.

| Actual exported geometry | Triangles | Signed-mesh volume magnitude |
| --- | ---: | ---: |
| Configured original lid | 2,428 | 26,600.545757 mm³ |
| Lid with the added hole | 2,688 | 26,351.501509 mm³ |
| Standalone OpenSCAD rerender of the exported SCAD | 2,688 | 26,351.501509 mm³ |

Volume decreased by 249.044249 mm³; the exported file rerendered without warnings
or errors. This checks that material was actually removed and that the exported
file does not depend on a running ScadLatch server. The new hole uses a
64-segment cylinder. Volume is computed from the actual exported STL triangles,
not inferred from an exit code or UI success message.

The baseline application render took 6.190 seconds and the edited render took
7.303 seconds on the current machine. These are one observed run each, including
CSG tracing and STL rendering, excluding installation/startup; they are not a
benchmark or performance guarantee.

## Reproduce

1. Run the documented setup and start ScadLatch.
2. Open
   `examples/external/erlancassiano-enclosure/lid-with-hole.scadlatch.json`.
   It contains the original source with the disclosed setting change and the
   single feature above.
3. Build and inspect the lid. Export SCAD and STL. The modified SCAD is also
   included beside the project JSON for inspection.
4. Independently run OpenSCAD on the export, for example:

```sh
openscad -o independent-lid.stl examples/external/erlancassiano-enclosure/lid-with-hole.scad
```

On Windows use the `openscad.com` executable from the official portable package
or installed application. No external libraries/assets are required by these
three source files.

The practical limitation is substantial: familiar rounded and extruded designs
can render but expose no editable faces. Even the successful enclosure permits
editing only one structural cuboid, not its rounded outer walls. The current
product should describe this boundary clearly rather than advertise editing
arbitrary existing OpenSCAD models.
