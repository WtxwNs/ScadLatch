# Independent source models

These are existing models by their named authors, retrieved on 2026-10-26. They
were not authored for ScadLatch. Their licenses remain separate from the app's
license. Inclusion is not an endorsement by the original authors.

| Folder | Author and original | Version recorded | License |
| --- | --- | --- | --- |
| `drlex-phone-holder` | DrLex, [Customizable Smartphone Holder](https://github.com/DrLex0/print3d-customizable-smartphone-holder) | Header version 2.1; repository commit `5adda1d88cf44408e3af113c6e00a458abe11cf8` | CC BY 4.0; included `LICENSE.md` |
| `t-paul-phone-stand` | Torsten Paul, [Simple Phone and Tablet Stand](https://t-paul.openscad.org/simple-phone-and-tablet-stand/) | Source header: October 2015; retrieved 2026-10-26 | CC BY-SA 4.0; included `LICENSE.txt` |
| `erlancassiano-enclosure` | Erlan Rodrigo de Souza Cassiano, [Enclosure-CAD](https://github.com/erlancassiano/Enclosure-CAD) | Repository commit `4b67ba7f7afc2e91bfb699b52fdf7bb464309427` | MIT; included `LICENSE` |

The original `.scad` files retain their code and attribution. For the Erlan
enclosure, `lid-with-hole.scad` and `lid-with-hole.scadlatch.json` are modifications
made with ScadLatch: the existing `show_base` setting is false, and a 2 mm through
hole has been added to the lid's registration lip. The modified files retain the
original model's MIT license. The later `shell-side-opening` and `shell-side-opening-wide` projects/SCAD/STL are also MIT-licensed modifications of that enclosure: `show_lid=false`, one 12 × 6 mm right-wall opening at local Y=25, Z=10, depth 4, and additionally `pcb_len=110` in the wide variant. The original files remain unchanged. No phone-holder derivative was produced.

The current recheck also exposes DrLex's main extrusion, but its conservative cap-material search did not certify a point for the attempted hole. Torsten's full render timed out at 90 seconds, with no offset workaround. Both failures are retained. The enclosure's rounded shell now supports the demonstrated side opening; baseline and edited shell meshes both retain non-manifold warnings. See [the complete import result](../../docs/imported-model.md) and [raw attempts](imported-workflow-results.json).

For the current workflow, open `erlancassiano-enclosure/shell-side-opening.scadlatch.json`, then change `pcb_len` from 80 to 110 and rebuild. Local Y/Z positions are coordinates from the original call origin, not automatic edge margins. `shell-side-opening-wide.scadlatch.json` saves the resulting size change. These supplied exports are geometric checks, not certified printable parts.

Open `erlancassiano-enclosure/lid-with-hole.scadlatch.json` in ScadLatch to load
the configured source and feature. The exported `.scad` runs independently in
OpenSCAD; continue editing in ScadLatch from the project JSON or original source,
not by re-importing the instrumented export.
