# Kit: the OOP simulation for Data-oriented design

`sim.hpp` is a particle simulation built the object-oriented way: a virtual `Entity` hierarchy, one heap object per entity, a fixed-step loop. `main.cpp` times it in ns/entity/step and prints a checksum.

Build and run: `cmake -S . -B build && cmake --build build && ./build/particles [steps] [N...]`

This is the starting point; your work goes alongside it. Keep this version as the baseline, and check your version against its checksum (equal up to float rounding).
