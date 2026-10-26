// ScadLatch starter: a rounded electronics shell.
// Select the right wall, add an opening, then change width.
width = 100;
depth = 65;
height = 30;
wall = 3;
radius = 5;
$fn = 48;

module rounded_body(w, d, h, r) {
  hull()
    for (x = [r, w-r], y = [r, d-r])
      translate([x, y, 0]) cylinder(r=r, h=h);
}

difference() {
  rounded_body(width, depth, height, radius);
  translate([wall, wall, wall])
    rounded_body(width-2*wall, depth-2*wall, height, radius-wall);
}
