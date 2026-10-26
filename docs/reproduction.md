# Independent clean-directory reproduction

2026-10-26. Performed by an agent that did not implement ScadLatch. This is engineering reproduction on bundled fixtures, not a human usability or market study.

## Setup and scope

Started with the project README. Copied source into `D:/0work/Repo/1019Impact/.probe/scadlatch-clean`, excluding `.git`, `node_modules`, `.runtime`, `.cache`, `dist` and logs. Node.js was v24.18.0. No existing OpenSCAD runtime or installed dependencies were copied.

Ran these commands in the clean directory:

```powershell
npm.cmd install
npm.cmd run setup
npm.cmd run build
npm.cmd test
node --import tsx scripts/check-workflow.ts
$env:PORT='4183'; npm.cmd run dev
```

Install completed (111 packages). Setup downloaded the official approximately 22 MB portable OpenSCAD build and reported version 2021.01. Build passed. The final test run passed 13/13, with no skips; an earlier run while setup was still downloading correctly skipped three native tests. The README's actual STL workflow independently passed: 1,056 mm³ removed both before and after width changed to 140.

No browser was opened. README describes browser use, not the API contract; for the specifically requested terminal-only test I inspected `src/server/index.ts` and `src/shared/types.ts` after setup to obtain endpoint/request fields. This should not be described as an unfamiliar user's complete UI reproduction.

## Actual API, geometry and export results

`GET http://127.0.0.1:4183/api/examples` returned Cable tray, Twin housings and Mounting plate. Posted the returned Twin housings source to `/api/render` with `features: []`; HTTP 200 returned two distinct editable routes and a real 56-triangle STL.

Selected only the first route, `/n4/n5/n0/n1` (primitive `n1`, left housing), and posted this feature:

```json
{"primitiveId":"n1","route":"/n4/n5/n0/n1","face":"x+","kind":"rectangle","u":20,"v":14,"width":12,"height":8,"diameter":8,"depth":4}
```

Repeated both unedited and edited render requests after changing the original `width = 64` assignment to `width = 84`. All requests returned HTTP 200 with empty diagnostics. Parsed the resulting actual STL geometry rather than trusting response status:

| Source | Left volume mm³ | Right volume mm³ | Triangle counts left/right |
| --- | ---: | ---: | ---: |
| width 64, unedited | 24,432 | 24,432.018087 | 28 / 28 |
| width 64, edited | 24,144 | 24,432.018087 | 48 / 28 |
| width 84, unedited | 30,192 | 30,192.021814 | 28 / 28 |
| width 84, edited | 29,904 | 30,192.021814 | 48 / 28 |

The selected housing loses exactly 288 mm³ (12 × 8 opening through a 3 mm wall) at both widths. The unselected right housing's canonicalized triangle-coordinate set is identical before/after at each width. Small fractional right volumes arise from STL coordinates for the rotated instance. All four STLs have finite coordinates and every undirected mesh edge belongs to exactly two triangles.

Saved the edited response's `exportSource` as `edited.scad`, then compiled independently of the server:

```powershell
& .\.runtime\openscad-2021.01\openscad.com -o independently-compiled.stl edited.scad
```

OpenSCAD reported `Simple: yes`. Independently parsed output has 76 triangles, volume 48,576.018087 mm³, and zero edges with incidence other than two, matching the API solid. This establishes a nonempty closed triangulated export; it is not a physical printability certification.

Probe scripts and outputs are retained only in the clean directory (`probe-base.mjs`, `probe-edit.mjs`, `verify-stl.mjs`, `probe-results.json`, SCAD/STL files). The test server was stopped after testing; port 4183 had no remaining listener.

## Findings

- **Core path passed:** clean dependency installation, genuine runtime download, build, all tests, API instance-isolated edit, parameter change and independent native export compilation.
- **Parallel development instance issue:** starting with `PORT=4183` still emitted `WebSocket server error: Port 24678 is already in use` because the other development instance uses Vite's default hot-reload port. HTTP/API rendering worked. A separate configurable HMR port or production mode avoids this development-only conflict.
- **Dependency advisory:** the copied lockfile installed fflate 0.8.2. `npm audit` reported one moderate vulnerability, [GHSA-px8p-9vwx-vf98](https://github.com/advisories/GHSA-px8p-9vwx-vf98), malformed ZIP64 handling in unzipSync; patched 0.8.3 is available. No exploit or reachability audit was performed. Upgrade and rerun setup as appropriate.
- Build warned about a 771.49 kB minified JS chunk. npm warned that esbuild install scripts were not yet covered by allowScripts; neither warning blocked this observed run.

No original product files were changed by this reviewer except this report. Independent imported-model breadth, browser usability, cross-platform setup and user benefit remain outside this check.

## Implementer follow-up

After this reproduction, the implementing agent reported updating fflate to 0.8.3 with the lockfile and assigning Vite's HMR port to `PORT + 1`. Those changes address the two reported issues in principle. They were made after the clean-directory snapshot above; this reviewer did not rerun their validation. Verification of the revised extraction path and HMR configuration belongs to the implementing agent. The historical observations above remain unchanged.
