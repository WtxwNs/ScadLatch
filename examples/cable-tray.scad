// ScadLatch example — parametric desktop tray, dimensions in millimetres.
// Change width after adding an opening to the right wall.
width = 100;
depth = 70;
height = 36;
wall = 4;

module tray(w, d, h, t) {
    difference() {
        cube([w, d, h]);
        translate([t, t, t]) cube([w-2*t, d-2*t, h]);
    }
}
tray(width, depth, height, wall);
