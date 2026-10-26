# Source-release reproduction — 26 October 2026

An agent that did not implement ScadLatch extracted the 0.1.0 source ZIP into a
new directory, read README first, installed its locked dependencies, and used the
included Rounded shell. This is an engineering reproduction, not human adoption
or independent browser usability validation.

Environment: Windows, Node 24.18.0, npm 11.16.0, official OpenSCAD 2021.01.
The original application and its preview server were not reused for rendering.
No reproduction server was started.

## Installation outcome

- `npm ci`: passed, 111 packages installed, audit reported no vulnerabilities.
  npm warned about approval of two esbuild installation scripts; the following
  build nevertheless succeeded without changing package files.
- `npm run build`: passed. Vite emitted its large-bundle advisory (775.79 kB
  uncompressed JavaScript, 211.77 kB gzip).
- Initial `npm run setup`: **failed** after the download's 300-second timeout.
  It printed an uncaught `DOMException [TimeoutError]` and no actionable recovery
  instruction. A separate Windows HEAD request to the official ZIP returned
  HTTP 200 and Content-Length 21,884,613 in about two seconds. This establishes
  reachability at that moment, not why Node's download stalled.
- The README-supported `OPENSCAD_BIN` fallback to an already installed official
  OpenSCAD 2021.01 then configured successfully. The geometry results below used
  that engine with the freshly extracted application. This fallback is **not** a
  successful clean automatic-download check.
- With the engine configured, `npm test` passed all 32 checks with none skipped.

The installer was then changed to use Windows networking for the download and
to give a recovery message on failure. For an independent recheck, the same
original ZIP was extracted again into a second new directory; **only**
`scripts/setup-openscad.mjs` was replaced with the revised file. There was no
`.runtime` directory, no copied download cache, and `OPENSCAD_BIN` was cleared.
After a fresh `npm ci`, setup downloaded and extracted the official build in
**14.75 seconds**. The resulting configuration pointed inside the new directory,
and its executable reported OpenSCAD 2021.01. That newly downloaded engine then
rendered a 2 x 3 x 4 mm cube through the extracted runtime: 12 STL triangles,
24 mm3 measured volume, one editable part, no diagnostics, 277 ms. This revised
clean automatic-install path passed. The original timeout is retained above.

## Actual Rounded shell result

After setup, reproduce the same checks with
`node --import tsx scripts/check-release-workflow.ts`; its SCAD, STL, project and
JSON results are written to `.cache/release-workflow/`. The published checker is
the independently executed checker below, with only its output path changed.

The runtime was invoked directly from the extracted source, using the README's
18 × 10 mm rectangular opening on X+, local Y=32, Z=17, depth=5. No product mesh
measurement helper was reused. The checker read actual ASCII STL triangles,
computed signed tetrahedral volume, intersected rays with triangles, and counted
undirected mesh-edge incidences.

| Width | Before volume (mm³) | After volume (mm³) | Material removed (mm³) | Edited triangles |
| --- | ---: | ---: | ---: | ---: |
| 100 | 44,701.140591 | 44,161.140591 | 540.000000 | 432 |
| 140 | 58,981.139823 | 58,441.139823 | 540.000000 | 432 |

540 mm³ is the expected 18 × 10 × 3 mm wall removal. At the opening center,
an X-directed ray intersected the original 100 mm body at X=[0, 3, 97, 100]
and the edited body only at [0, 3]. At width 140, the original intersections
were [0, 3, 137, 140], with the edited result again [0, 3]. Thus the right wall
opened after resizing while the opposite wall remained. At Y=20, outside the
opening, both walls remained in each result. Every edited mesh edge had two
incident triangles; this check alone does not certify printability.

Baseline native builds took 0.91–0.93 seconds and edited builds 1.82–1.83 seconds
in this run, with no render diagnostics. These are observed local timings.

Each generated SCAD was saved and compiled in a separate native OpenSCAD process
using `--export-format asciistl -o independent.stl exported.scad`. Both outputs
had 432 triangles, the same opening and closed-edge result, and the same volume
within 0.000001 mm³. The output does not require the ScadLatch server to compile.

Local reproduction evidence is retained under
`.cache/release-repro-20261026-210942/scadlatch/.cache/`: the independent
`repro-check.ts`, `release-reproduction-output/results.json`, both exported SCAD
and STL pairs, and separately compiled STLs. The source ZIP itself is retained
under `.cache/releases/`. The revised installer check and smoke result are under
`.cache/release-repro-fixed-20261026-212040/scadlatch/.cache/`.

## Package inspection and limits

The inspected initial ZIP contained 74 entries. There were no `.runtime`,
`.cache`, `node_modules`, `.git`, `.env`, private-key or log paths. A bounded scan
found no common private-key blocks or GitHub/OpenAI-style secret-token patterns;
this is not a universal secret-detection guarantee. Third-party example sources
retained their license files. Eight unnecessary video-editing text files were
included in the initial package. The repacked release candidate was inspected:
70 entries; all eight intermediate text files were absent; the revised setup
script was byte-for-byte identical to the checked source; the public reproduction
checker, Rounded shell screenshot and this report were included. No runtime,
cache, dependency directory or secret-file paths from the checks above appeared.
The packaging issue is fixed.

The direct-runtime workflow passed. Clean automatic engine installation failed
on its first attempt and passed after the installer fix in a new directory. This run did not
independently test browser interactions, macOS/Linux installation, unfamiliar
human use, physical printing or general compatibility with arbitrary SCAD files.

