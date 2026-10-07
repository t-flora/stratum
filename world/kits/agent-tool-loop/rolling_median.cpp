// rolling_median.cpp: the slow implementation. This is the function to optimise.
#include "rolling_median.hpp"

#include <algorithm>

std::vector<std::int64_t> rolling_median(std::span<const std::int64_t> xs, std::size_t w) {
    std::vector<std::int64_t> out;
    if (w == 0 || w > xs.size()) return out;

    const std::size_t k = (w - 1) / 2;
    for (std::size_t i = 0; i + w <= xs.size(); ++i) {
        std::vector<std::int64_t> window(xs.begin() + static_cast<std::ptrdiff_t>(i),
                                         xs.begin() + static_cast<std::ptrdiff_t>(i + w));
        std::sort(window.begin(), window.end());
        out.push_back(window[k]);
    }
    return out;
}
