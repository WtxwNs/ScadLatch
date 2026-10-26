# ScadLatch alpha launch drafts

Prepared 26 October 2026. **Nothing in this document has been published or sent.**
The proposed destination is a new public repository, `WtxwNs/ScadLatch`.
That repository and this project's public release still require authorization.
The GitHub URLs below are proposed destinations, not evidence of a live release.
The community post is a separate draft, not authorization to contact anyone.

## GitHub repository

Proposed repository: **WtxwNs/ScadLatch**, public, GPL-3.0-or-later.
Publish the `solid-edit` project and its included attribution notices; do not
publish the surrounding research workspace, caches or downloaded runtime.

Description:

> Add a missing port or hole to an existing parametric OpenSCAD model by selecting a flat face. Keep the edit attached when dimensions change.

Suggested topics: `openscad`, `parametric-design`, `3d-printing`, `cad`.

## GitHub release draft

Proposed tag: **v0.1.0-alpha.1**. Mark as a **pre-release**.

Title: **ScadLatch 0.1.0 alpha — add an opening, keep the parameters**

Copyable release body begins below.

---

ScadLatch adds a missing port or hole to an existing parametric OpenSCAD model.
Select a supported flat face, place the opening, then change the original model's
dimensions: the opening follows that outer face. Export editable SCAD and an STL
compiled by OpenSCAD, or save a project to continue editing.

![A side opening in the resized rounded-shell example](https://github.com/WtxwNs/ScadLatch/blob/v0.1.0-alpha.1/docs/media/07-rounded-shell.jpg?raw=true)

[42-second tray walkthrough](https://github.com/WtxwNs/ScadLatch/blob/v0.1.0-alpha.1/docs/media/walkthrough.mp4)
— an edit of actual interface screenshots, not continuous footage or a rendering-speed benchmark.
The video shows the earlier box-based tray; the image above shows the rounded shell.

### Try a side opening

Requires Node.js 22 or newer. Download and extract this release's source archive,
then run in the extracted directory:

```sh
npm install
npm run setup
npm run dev
```

Open `http://127.0.0.1:4173` and choose **Rounded shell**. Select its flat **X+**
outer wall. Add a rectangle with width **18**, height **10**, local Y position
**32**, local Z position **17**, and depth **5** mm. Apply, then change the
original `width` from **100 to 140** and rebuild. Inspect the side opening and
export the result.

Windows setup locates OpenSCAD or downloads its official portable build
(approximately 22 MB). On macOS/Linux, install OpenSCAD first or set
`OPENSCAD_BIN`; these platform installation paths have not yet been independently
checked. Source and rendering stay on your local server. No model API key or
account is needed.

### Alpha limits

- One self-contained `.scad` file. No `include`/`use` libraries or imported assets.
- Supported boxes, whole hulls and extruded profiles, with exposed flat faces at
  their local bounding limits. Curved faces, sloping faces and recessed ledges
  cannot be edited. Offset profiles, twist and nonuniform scaling are unsupported.
- Box edits keep lower-edge offsets. Hull/extrusion edits keep coordinates from
  the original local origin. Neither automatically recenters on resize.
- Explicit module instances can be edited separately; repeated instances from
  loops cannot. A through cut can also open the opposite wall.
- Inspect actual material removal, especially on concave shapes. A successful
  export is not a printability or fit check. Keep the project file for continued
  ScadLatch editing; generated SCAD is intended for OpenSCAD, not re-import here.

The [external-model record](https://github.com/WtxwNs/ScadLatch/blob/v0.1.0-alpha.1/docs/imported-model.md)
includes a rounded enclosure wall edited and resized successfully, with inherited
non-manifold mesh warnings. A phone-holder extrusion's hole placement was not
completed; another phone stand timed out. These checks do not establish broad
compatibility or user adoption.

To help improve this workflow, try a model you can legally share and
[open an issue](https://github.com/WtxwNs/ScadLatch/issues) with its license/source,
the desired opening, the parameter change it must survive, and what happened.
Successful second tasks are useful too: describe what you used the edit for.

GPL-3.0-or-later. Imported models and dependencies retain their own licenses.

---

## One community: r/openscad

Audience: people already creating, adapting or printing OpenSCAD models.
Show the concrete side-port edit and parameter change, link the runnable source,
and invite one real model/task. The intended next step is a completed edit on the
reader's own model, with an issue or a shared result if they choose; not a request
for stars or upvotes.

### Official rules checked

Checked on 26 October 2026, using the community's own pages and Reddit policy:

- The [community rules endpoint](https://www.reddit.com/r/openscad/about/rules.json)
  returned an empty community-rule list. The
  [rules page](https://www.reddit.com/r/openscad/about/rules/) did not expose rule
  text in its logged-out view. This does not establish that an account can post
  without restrictions.
- The [community description](https://www.reddit.com/r/openscad/about.json)
  covers news and practical help about programmable CAD. Its linked
  [wiki](https://www.reddit.com/r/openscad/wiki/index/) is disabled. No explicit
  ban on AI-assisted drafting was visible in these accessible community sources;
  no inference is made about unpublished moderation decisions.
- Reddit's [spam policy](https://support.reddithelp.com/hc/en-us/articles/360043504051-Spam),
  updated 22 October 2026, prohibits repeated or unsolicited mass engagement and
  tools used to proliferate spam. It asks affiliated contributors to consider
  posting frequency and leaves community spam decisions to moderators. The
  [site rules](https://redditinc.com/policies/reddit-rules) also apply.

Proposed format: one relevant text post, with the rounded-shell screenshot and
demo link. Disclose affiliation and AI assistance. No cross-post campaign, bulk
messages or repeated promotion. At posting time, check any additional rules shown
in the account's submission form; if it prohibits AI-written submissions, do not
submit this draft. No account-specific posting eligibility has been checked.

### Community draft — not sent

Title: **ScadLatch alpha: add a port to an existing SCAD model, then resize it**

Body:

I maintain ScadLatch, an open-source local workbench for a specific remix task:
you have an OpenSCAD enclosure, but its parameters do not include the cable port
you need. Select a flat outer face, add a round hole or rectangle, and keep the
edit attached when you change the original dimensions. Export both SCAD and STL.
The project and this post were developed with AI assistance.

The included rounded-shell example gets an 18 × 10 mm side opening, then grows
from 100 to 140 mm wide. The opening follows the right wall; its local Y/Z
coordinates stay fixed.

[Source and setup](https://github.com/WtxwNs/ScadLatch) ·
[Rounded-shell screenshot](https://github.com/WtxwNs/ScadLatch/blob/v0.1.0-alpha.1/docs/media/07-rounded-shell.jpg) ·
[42-second tray demo](https://github.com/WtxwNs/ScadLatch/blob/v0.1.0-alpha.1/docs/media/walkthrough.mp4)

The demo is edited actual interface screenshots, not continuous footage. This is
an alpha: single-file inputs, supported boxes/hulls/extrusions, and flat outer
faces only. Curved faces, libraries, offset profiles, twist, nonuniform scaling
and loop-generated repeated instances are outside scope. Hull/extrusion positions
use the original local origin; box positions use lower-edge offsets.

One external rounded enclosure's wall edit survived resizing, but its original
mesh defects remain. Two other external attempts were incomplete or timed out;
the repo includes those results too. It needs Node.js 22+ and local OpenSCAD;
Windows setup can download the engine. No hosted model API is involved.

If you have a self-contained model you are allowed to share, try one missing
opening and change a dimension afterward. An issue with the file's license,
desired cut and actual result would help identify where this workflow breaks—or
where it earns a place in your usual modeling work.

## Before an authorized publication

Verify the new repository URL and tag, preserve all model/third-party notices,
and check the links in the copyable text after upload. Attach the existing media
without describing the screenshot montage as a continuous recording. There is
no claimed public release, external trial, repeat use or spontaneous sharing yet.
