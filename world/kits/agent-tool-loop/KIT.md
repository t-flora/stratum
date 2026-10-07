# Kit: the task for Agent Workshops

`rolling_median.cpp` is one slow but correct function, specified in `rolling_median.hpp`. `test_rolling_median.cpp` is the oracle: hand cases, plus differential tests against an independent reference, on random and price-shaped inputs. `bench_rolling_median.cpp` times it on two inputs and four window sizes and prints one line per cell, then a single score (the geometric mean, in ms; lower is better).

Build: `cmake -S . -B build && cmake --build build`. Run: `./build/tests` (or `ctest --test-dir build`), then `./build/bench [n] [reps]`.

This is the starting point; your work goes alongside it. The agent's tools (compile, run_tests, run_benchmark) map onto these three commands. Later shrines reuse it as "the task": *What context helps the agent?* and *Letting the agent optimise a kernel*.
