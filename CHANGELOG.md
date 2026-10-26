# 0.1.0 alpha — 26 October 2026

Windows setup uses the system downloader after a clean-install check exposed a
Node download timeout. Valid ZIP caches can be reused; failed downloads leave no
partial cache and show an official-install recovery path.

Open a self-contained OpenSCAD model, select a supported flat outer face, add a
circular hole or rectangular opening, change the original parameters, and export
SCAD/STL or save a project. Explicit module instances keep separate edits.

- Supports whole `hull()` and `linear_extrude()` bodies alongside `cube()`.
  Compound edits retain fixed local-origin coordinates; cube edits retain offsets
  from lower edges. The selected outer plane follows parameter changes.
- Includes a Rounded shell starter for adding a side opening and resizing the body.
- Blind cuts use the selected outer plane, preserving lower ledges on concave
  bodies. Through cuts cross the complete selected body.
- Only exposed flat faces at local bounding limits are selectable. Curved and
  sloping faces, recessed ledges, loop-generated repeated instances, external
  source dependencies, offset profiles, twisted extrusions and nonuniform scaling
  remain outside the direct-editing scope.
- Invalid edits and failed builds retain the previous result. The interface
  reports a new cut that removes no measurable material.

Native-engine checks cover resizing rounded bodies, editing only one explicit
instance, rotated extrusions, and standalone SCAD export. An external rounded
enclosure wall edit survives resizing; inherited non-manifold mesh warnings remain.
A second external model's hole placement remains incomplete, and a third timed
out. See the [full import record](docs/imported-model.md).

The implementer checked the Rounded shell browser workflow. A separate agent
reproduced the source ZIP on Windows, including clean automatic installation
after the downloader fix, the 100-to-140 mm resize, and standalone SCAD exports.
Both widths removed 540 mm³ through the right wall while preserving the opposite
wall. See the [source-package reproduction](docs/release-reproduction.md).
This terminal reproduction does not establish independent browser usability.
Arbitrary-model compatibility, real user adoption and repeat use are unverified.
