# Minimal stub. The `cmake-modern` shrine replaces this template with a real one.
cmake_minimum_required(VERSION 3.25)
project({{module}} LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

add_executable(main src/main.cpp)
target_compile_options(main PRIVATE -Wall -Wextra -Wpedantic)
