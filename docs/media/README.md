# Actual interface captures

Captured from ScadLatch's local browser interface on 26 October 2026. The sequence
opens the included tray, selects the right face, applies a rectangular opening,
changes width from 100 to 140 mm, and shows export options. Native OpenSCAD
generated every displayed solid. Camera fitting and scrolling were performed to
show the result clearly.

`walkthrough.mp4` is a 42-second **edited sequence of screenshots**, with seven
seconds per step for reading. It is not a continuous screen recording and the
frame timing is not a performance measurement. Actual builds shown in this run
took about 0.3–0.4 seconds. Screenshots are unretouched; the video adds captions.

The separate reproducible geometry checks are in `scripts/check-workflow.ts` and
`docs/reproduction.md`. These screen captures are presentation material, not
independent adoption evidence.

`07-rounded-shell.jpg` shows the later compound-body workflow: the included
Rounded shell has an 18 × 10 mm opening, local Y32/Z17 and depth5, then width
changes from 100 to 140. This was completed in the actual browser; the build shown
took 1.8 seconds. Reapplying the same opening was rejected as removing no material,
with the previous model preserved. The screenshot was taken after dismissing
that error and clearing the selection. The older video still shows the cube tray.
