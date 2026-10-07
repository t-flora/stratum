// main.cpp: time the simulation. Usage: ./particles [steps] [N...]  (default: 200 steps, N = 1e5 3e5 1e6)
#include "sim.hpp"

#include <chrono>
#include <cstdio>
#include <cstdlib>

int main(int argc, char** argv) {
    int steps = argc > 1 ? std::atoi(argv[1]) : 200;
    std::vector<std::size_t> sizes;
    for (int i = 2; i < argc; ++i) sizes.push_back(std::strtoull(argv[i], nullptr, 10));
    if (sizes.empty()) sizes = {100'000, 300'000, 1'000'000};

    constexpr float dt = 1.0f / 120.0f;
    for (std::size_t n : sizes) {
        World world(n);
        world.step(dt);  // warm-up
        auto t0 = std::chrono::steady_clock::now();
        for (int s = 0; s < steps; ++s) world.step(dt);
        auto t1 = std::chrono::steady_clock::now();
        double ns = std::chrono::duration<double, std::nano>(t1 - t0).count();
        std::printf("N=%-8zu steps=%d  %.3f ns/entity/step  checksum=%.6e\n", n, steps,
                    ns / (static_cast<double>(n) * steps), world.checksum());
    }
}
