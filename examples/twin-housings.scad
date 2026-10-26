// Two calls to the same module. Pick one housing: only that instance changes.
width = 64;
depth = 46;
height = 28;
wall = 3;

module housing(w, d, h) {
    difference() {
        cube([w, d, h], center=true);
        translate([0,0,wall]) cube([w-2*wall,d-2*wall,h],center=true);
    }
}
translate([-width/2-8,0,height/2]) housing(width,depth,height);
translate([width/2+8,0,height/2]) rotate([0,0,18]) housing(width,depth,height);
