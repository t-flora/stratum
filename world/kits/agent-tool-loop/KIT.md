# Kit: the task for Agent Workshops

`rolling_median.cpp` is one slow but correct function, specified in `rolling_median.hpp`. `test_rolling_median.cpp` is the oracle (hand cases plus differential tests against an independent reference); `bench_rolling_median.cpp` prints one median time.

Build: `cmake -S . -B build && cmake --build build`. Run: `./build/tests` (or `ctest --test-dir build`), then `./build/bench [n] [w] [reps]`.

This is the starting point; your work goes alongside it. The agent's tools (compile, run_tests, run_benchmark) map onto these three commands; later shrines reuse this as "the task" and "the oracle".
