// bench_rolling_median.cpp: the benchmark. One line per (input, window), then the score: the geometric mean of the
// per-cell median times, in ms (lower is better). Usage: ./bench [n] [reps]   (default: n = 50000, reps = 3)
#include "rolling_median.hpp"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <random>

namespace {

// Prices in ticks around 100.00. `calm` is a quiet random walk. `jumpy` is the same walk with what real feeds
// also do: rare gaps (a halt, then a reopen far away) and bad prints (one wild tick that reverts at once).
std::vector<std::int64_t> make_input(std::size_t n, bool jumpy) {
    std::mt19937_64 rng(jumpy ? 777 : 12345);
    std::uniform_int_distribution<int> step(-3, 3);
    std::uniform_int_distribution<int> one_in(0, 1999);
    std::uniform_int_distribution<std::int64_t> gap(100'000, 10'000'000);
    std::uniform_int_distribution<std::int64_t> wild(-1'000'000'000, 1'000'000'000);
    std::vector<std::int64_t> xs(n);
    std::int64_t price = 1'000'000;
    for (auto& x : xs) {
        price += step(rng);
        if (jumpy && one_in(rng) == 0) price += (rng() & 1) ? gap(rng) : -gap(rng);
        x = (jumpy && one_in(rng) < 2) ? price + wild(rng) : price;
    }
    return xs;
}

}  // namespace

int main(int argc, char** argv) {
    const std::size_t n = argc > 1 ? std::strtoull(argv[1], nullptr, 10) : 50'000;
    int reps = argc > 2 ? std::atoi(argv[2]) : 3;
    if (reps < 1) reps = 1;
    const std::size_t windows[] = {15, 63, 255, 1023};

    double log_sum = 0;
    int cells = 0;
    std::int64_t sink = 0;
    for (bool jumpy : {false, true}) {
        const auto xs = make_input(n, jumpy);
        for (std::size_t w : windows) {
            std::vector<double> ms;
            for (int r = 0; r < reps; ++r) {
                auto t0 = std::chrono::steady_clock::now();
                auto out = rolling_median(xs, w);
                auto t1 = std::chrono::steady_clock::now();
                ms.push_back(std::chrono::duration<double, std::milli>(t1 - t0).count());
                if (!out.empty()) sink ^= out[out.size() / 2];
            }
            std::sort(ms.begin(), ms.end());
            const double med = ms[ms.size() / 2];
            std::printf("input=%s w=%zu median_ms=%.3f\n", jumpy ? "jumpy" : "calm", w, med);
            log_sum += std::log(std::max(med, 1e-6));
            ++cells;
        }
    }
    std::printf("score n=%zu reps=%d geomean_ms=%.3f (sink %lld)\n", n, reps, std::exp(log_sum / cells),
                static_cast<long long>(sink));
}
