// rolling_median.hpp: the task. A correct but slow rolling median over integer prices.
#pragma once
#include <cstddef>
#include <cstdint>
#include <span>
#include <vector>

// Spec (any faster version must match it exactly):
//   Given prices xs[0..n) and a window length w, return out of length n - w + 1 where
//   out[i] is the median of the window xs[i], ..., xs[i + w - 1].
//   For even w the median is the LOWER middle element: the k-th smallest with k = (w - 1) / 2,
//   counting from 0. Values are exact integers (prices in ticks); no averaging, no rounding.
//   Duplicates count individually. Any int64_t value is allowed, including the extremes.
//   If w == 0 or w > n, return an empty vector.
std::vector<std::int64_t> rolling_median(std::span<const std::int64_t> xs, std::size_t w);
