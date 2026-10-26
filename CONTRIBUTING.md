# Contributing

Install Node.js 22+, run `npm install`, then `npm run setup` and `npm run dev`.
Windows setup downloads official OpenSCAD; on Linux/macOS install OpenSCAD first.

The source of truth is the original SCAD plus a small list of feature edits.
`src/engine/source.ts` preserves expressions and adds instance-scoped cuts.
`src/server/csg.ts` maps the evaluated OpenSCAD tree back to selectable parts.
`src/ui` displays the actual STL and edits that project state. Do not substitute
preview primitives for the actual exported geometry. See [engine notes](engine-notes.md)
for source identity, placement rules and conservative bounds.

For changes to selection, transforms, instance scope or exported code, run:

```
npm test
node --import tsx scripts/check-workflow.ts
node --import tsx scripts/check-compound-workflow.ts
npm run build
```

Describe a bug with a minimal self-contained model, its license, the selected
face, intended edit and actual result. For broader model support, bring a real
input and desired task; adding support should preserve the program's parameters
and never silently modify every instance. Unsupported edits should remain clear.

No telemetry is included. Do not upload someone else's private model in an issue.

`npm run package` creates a source ZIP in `.cache/releases/`, including the
locked dependencies list, examples, license notices and demo. The runtime and
installed dependencies are acquired during setup, not bundled. The independent
Rounded shell output check is `node --import tsx scripts/check-release-workflow.ts`.
