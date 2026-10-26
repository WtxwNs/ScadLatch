# ScadLatch positioning and evidence

Frozen working direction, 26 October 2026. This is a product hypothesis and
release-language boundary, not a market-validation report.

## Promise

For 3D-printing users who have a useful parametric OpenSCAD model but do not write
its code, select a face and add a missing feature that remains attached when the
original dimensions change. The initial scope is a self-contained file,
supported flat outer faces of cubes, hull bodies and straight extrusions,
circular holes and rectangular openings, with distinct
explicit module instances. General libraries and loop-created instances are
outside this first scope.

Short line: **Point to a face. Add a feature. Keep the parameters.**

The user-facing example is adding a cable opening to a downloaded enclosure,
resizing the enclosure, then saving the editable source and a compiled STL. A
successful demo must visibly include that resize and independent source use.

## Why this is more than a new viewport

The implemented mechanism associates a visible face and instance with a
source-program scope, then inserts a structural edit expressed in the original
local dimensions. Placement must follow an explicit rule, not a guessed fixed
world coordinate. The user need not discover the correct Boolean nesting or
manually derive a coordinate expression.

The difficult result is preservation of the edit's relation and instance scope
after parameter changes. A slider, STL Boolean or code-highlighting viewer alone
does not establish it. Neither does making the same mutation to every instance
when the user selected just one.

## Existing capabilities to acknowledge

Checked by reading primary descriptions; competitors were not executed.

| Alternative | Accepted scope | Implication for our claim |
| --- | --- | --- |
| [PurCad](https://purcad.app/guides/edit-scad-online), guide updated 21 October 2026 | Import SCAD and dependencies, AI changes to source, named parameters, compilation, source-operation inspection, SCAD/STL export | No claim that no-code modification or preserving source is new. Our proposed distinction is direct face/instance selection plus explicit parameter-aware structural attachment. |
| [Gonzalez et al.'s bidirectional CSG prototype](https://jfelipegonzalez.com/projects/introducing-bidirectionnal-programmin-in-csg/), page updated 21 September 2026 | Source/view navigation, related-instance highlighting, negative geometry ghosts, translate/rotate/scale with source changes | No claim to invent reverse source lookup or direct manipulation. The page limits its prototype to single-file models and excludes variable-based constraint edits. |
| [3dscad author's thread](https://www.reddit.com/r/openscad/comments/1tawj0o/im_building_a_visual_editor_for_openscad_with/) | Visual CSG hierarchy and code synchronization, followed by variable/loop work and module experiments | Basic visual CSG construction is already offered. This historical thread does not establish the exact feature set of today's repository. |

These descriptions do not prove global absence of our proposed whole workflow.
The working choice is to test that workflow, not to keep searching for a claim
of worldwide novelty.

## Demand evidence and its limits

A [user modifying an existing parametric mouthpiece](https://www.reddit.com/r/3Dprinting/comments/1tzt9hq/modifying_an_existing_parametric_design/)
already has a near-suitable design but cannot work out how to add missing
parameters or alter its overall shape. This is a direct workflow account. It
does not validate holes specifically, quantify an audience, or establish demand
for ScadLatch. Relative page dates and indexed dates disagree; no exact event
date is asserted.

The 3dscad thread includes independent use reports and requests for importing
real programs with BOSL2. These support taking existing-program compatibility
seriously. A missing supported function remains an upstream feature, not by
itself an independent product opportunity.

## What the first real demonstration must establish

1. The input is an independently authored, rights-cleared SCAD model, not only
   a fixture tailored to the implementation.
2. A new feature is added by selecting its intended face/instance.
3. Changing original dimensions preserves the declared placement relation.
4. An unselected explicit instance remains unchanged.
5. Exported SCAD compiles outside ScadLatch and produces the intended geometry.
6. Unsupported input is explained clearly, rather than silently approximated.

Physical fit, printing success, installation usability and adoption are separate
checks. An internally passing geometry experiment must not be described as
evidence of real user retention or broad impact.

## Natural reuse hypothesis

The useful shareable result is a remixed parametric model that another person
can resize again. The application should let people carry that result back to
their existing model-sharing and printing workflow. No new social network or
hidden usage tracking is required to test this hypothesis.

## Name

Working name: **ScadLatch**. Exact-name and GitHub-oriented searches on
26 October 2026 returned no results. This is a limited obvious-conflict check,
not trademark clearance. PartCrafter is already a structured 3D generation model;
SCADSplice also has an existing project and was not selected.
