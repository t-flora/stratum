// test_rolling_median.cpp: correctness tests, the oracle. Exit code 0 means every check passed.
// Works in Release builds: it uses its own CHECK, not assert().
#include "rolling_median.hpp"

#include <cstdio>
#include <limits>
#include <random>

static int failures = 0;
static int checks = 0;

#define CHECK(cond)                                                              \
    do {                                                                         \
        ++checks;                                                                \
        if (!(cond)) {                                                           \
            ++failures;                                                          \
            std::fprintf(stderr, "%s:%d: CHECK failed: %s\n", __FILE__, __LINE__, #cond); \
        }                                                                        \
    } while (0)

using V = std::vector<std::int64_t>;

// Reference: a different algorithm from the one under test. out[i] is the window element x with
// count(< x) <= k < count(<= x). Quadratic per window, but obviously correct.
static V reference(const V& xs, std::size_t w) {
    V out;
    if (w == 0 || w > xs.size()) return out;
    const std::size_t k = (w - 1) / 2;
    for (std::size_t i = 0; i + w <= xs.size(); ++i) {
        for (std::size_t j = i; j < i + w; ++j) {
            std::size_t less = 0, less_eq = 0;
            for (std::size_t m = i; m < i + w; ++m) {
                less += xs[m] < xs[j];
                less_eq += xs[m] <= xs[j];
            }
            if (less <= k && k < less_eq) { out.push_back(xs[j]); break; }
        }
    }
    return out;
}

static V run(const V& xs, std::size_t w) { return rolling_median(xs, w); }

int main() {
    constexpr auto lo = std::numeric_limits<std::int64_t>::min();
    constexpr auto hi = std::numeric_limits<std::int64_t>::max();

    // Hand-checked cases.
    CHECK(run({}, 1).empty());
    CHECK(run({1, 2, 3}, 0).empty());
    CHECK(run({1, 2, 3}, 4).empty());
    CHECK(run({5, 1, 4}, 1) == (V{5, 1, 4}));
    CHECK(run({5, 1, 4}, 3) == (V{4}));
    CHECK(run({3, 1, 4, 1, 5, 9, 2, 6}, 3) == (V{3, 1, 4, 5, 5, 6}));
    CHECK(run({4, 1, 3, 2}, 2) == (V{1, 1, 2}));          // even w: lower middle
    CHECK(run({4, 1, 3, 2}, 4) == (V{2}));
    CHECK(run({7, 7, 7, 7, 7}, 3) == (V{7, 7, 7}));
    CHECK(run({-5, -1, -3, 0}, 3) == (V{-3, -1}));
    CHECK(run({lo, hi, 0, lo, hi}, 3) == (V{0, 0, 0}));
    CHECK(run({hi, hi, lo, lo}, 2) == (V{hi, lo, lo}));

    // Randomised differential tests against the reference.
    std::mt19937_64 rng(20261007);
    for (int trial = 0; trial < 2000; ++trial) {
        std::size_t n = rng() % 64;
        std::size_t w = rng() % 70;
        std::int64_t spread = (trial % 3 == 0) ? 4 : (trial % 3 == 1) ? 1000 : hi;
        std::uniform_int_distribution<std::int64_t> d(spread == hi ? lo : -spread, spread);
        V xs(n);
        for (auto& x : xs) x = d(rng);
        V got = run(xs, w), want = reference(xs, w);
        CHECK(got == want);
        if (got != want) {
            std::fprintf(stderr, "  trial %d: n=%zu w=%zu\n", trial, n, w);
            break;
        }
    }

    std::printf("%s: %d/%d checks passed\n", failures ? "FAIL" : "PASS", checks - failures, checks);
    return failures ? 1 : 0;
}
