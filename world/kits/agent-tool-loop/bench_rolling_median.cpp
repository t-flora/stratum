// bench_rolling_median.cpp: the benchmark. Prints one line with the median wall time.
// Usage: ./bench [n] [w] [reps]   (default: n = 100000, w = 255, reps = 7)
#include "rolling_median.hpp"

#include <algorithm>
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <random>

int main(int argc, char** argv) {
    std::size_t n = argc > 1 ? std::strtoull(argv[1], nullptr, 10) : 100'000;
    std::size_t w = argc > 2 ? std::strtoull(argv[2], nullptr, 10) : 255;
    int reps = argc > 3 ? std::atoi(argv[3]) : 7;
    if (reps < 1) reps = 1;

    // A random walk in ticks around 100.00, fixed seed so every run sees the same input.
    std::mt19937_64 rng(12345);
    std::uniform_int_distribution<int> step(-3, 3);
    std::vector<std::int64_t> xs(n);
    std::int64_t price = 1'000'000;
    for (auto& x : xs) x = price += step(rng);

    std::vector<double> ms;
    std::int64_t sink = 0;
    for (int r = 0; r < reps; ++r) {
        auto t0 = std::chrono::steady_clock::now();
        auto out = rolling_median(xs, w);
        auto t1 = std::chrono::steady_clock::now();
        ms.push_back(std::chrono::duration<double, std::milli>(t1 - t0).count());
        if (!out.empty()) sink ^= out[out.size() / 2];
    }
    std::sort(ms.begin(), ms.end());
    std::printf("rolling_median n=%zu w=%zu reps=%d median_ms=%.3f (sink %lld)\n", n, w, reps,
                ms[ms.size() / 2], static_cast<long long>(sink));
}
