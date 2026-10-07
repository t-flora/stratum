cmake_minimum_required(VERSION 3.24)
project(agent_tool_loop LANGUAGES CXX)

if(NOT CMAKE_BUILD_TYPE AND NOT CMAKE_CONFIGURATION_TYPES)
  set(CMAKE_BUILD_TYPE Release CACHE STRING "Build type" FORCE)
endif()

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

set(WARNINGS -Wall -Wextra -Wpedantic -Wshadow -Wconversion)

add_library(rolling_median STATIC rolling_median.cpp)
target_include_directories(rolling_median PUBLIC ${CMAKE_CURRENT_SOURCE_DIR})
target_compile_options(rolling_median PRIVATE ${WARNINGS})

add_executable(tests test_rolling_median.cpp)
target_link_libraries(tests PRIVATE rolling_median)
target_compile_options(tests PRIVATE ${WARNINGS})

add_executable(bench bench_rolling_median.cpp)
target_link_libraries(bench PRIVATE rolling_median)
target_compile_options(bench PRIVATE ${WARNINGS})

enable_testing()
add_test(NAME rolling_median COMMAND tests)
