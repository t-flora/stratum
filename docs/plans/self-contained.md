# Plan: self-contained shrines (no hunting for outside material)

*Asked for by Tiago on 2026-10-06, after noticing that* Regular types *says "redesign a reference-heavy API" without saying which. Status: audit done, fixes proposed and awaiting his approval. The world's prose is his, so nothing in world-seed.yaml has been changed.*

## The problem

A shrine should be startable the moment you set out. When a prompt says "a real program", "an API", "a small model" or "a parallel benchmark suite", the first hour goes on finding something to work on: a different kind of task, and the one most likely to stall a session before it starts.

## Audit (2026-10-06, all 217 shrines)

Three reviewers read every prompt and `done` against one rubric:
- **self-contained:** the prompt defines what to build, or names a specific, free thing;
- **own artefact:** reuses something built in an earlier shrine;
- **vague:** needs outside material that isn't specified;
- **heavy:** specified, but costly to obtain or set up on this hardware.

| | Self-contained | Own artefact | Vague | Heavy |
|---|---|---|---|---|
| Surface (119) | 69 | 26 | 21 | 3 |
| Sky (38) | 17 | 9 | 12 | 0 |
| Depths (60) | 41 | 13 | 1 | 5 |
| **All (217)** | **127 (59%)** | **48 (22%)** | **34 (16%)** | **8 (4%)** |

**The picture:**
- **The depths are almost clean**, because `below` chains each one to the surface shrine it measures. Their problems are platform tags, not missing material.
- **The sky is worst** (12 of 38 vague). Sky shrines argue about "a system", "a codebase" or "a model" in the abstract. Five of the eight Design Archipelago shrines say "a/an X".
- **Surface problems cluster in three places:**
  - Instrument Ridge's tool shrines need a target program ("profile a real program").
  - Activation Marsh never names a model or a corpus.
  - Agent Workshops is a chain with no seed: every shrine reuses "the task" or "your oracle", but nobody defines the first one.
- **Of the 48 own-artefact shrines, about 15 are implicit:** "your toy model" or "your kernels" with no `after` pointing to it. So the map can't sequence them, and the learner can't tell what's expected.
- **The opening shrine, *Zero-cost, verified*, is self-contained.** *Regular types* is one of the 34 vague ones.

**Phrasings that cause it:** "a real …", "a small …", "a realistic workload", "an API/codebase/system", "rewrite/redesign a …" (rewrite what?), "your X" when no shrine builds X (e.g. `perf-basics`' "your matching engine"), and "of your choice" when the choice is wide open.

## How to minimise it: four moves, in order of preference

1. **Chain to your own work.** Most vague prompts have a natural input the learner has already built. *Ports and adapters for trading* can restructure the tick-to-trade temple, and `perf-basics` can profile the order book. This also adds continuity, since your own code comes back, which is the point of a map. Each chain gets an `after` edge, so placement and the Horizon know about it, plus a fallback for when the predecessor isn't done: "or the starter in this folder".
2. **Ship a starter.** Where nothing earlier fits, `stratum start` copies a small, purpose-written file into `work/<id>/`. Examples: a 60-line reference-heavy API for *Regular types*, an 80-line virtual-dispatch particle simulation for *Data-oriented design*, and a slow function plus tests and a benchmark to seed Agent Workshops. The engine change is small: `start` already scaffolds from `templates/`, and it would also copy `world/kits/<id>/` when it exists. Starters are world content, so a model writes them (as treasure will be) and the owner reviews them.
3. **Name one canonical thing per kind,** once, early in the region:
   - GPT-2 small and one small corpus (e.g. `NeelNanda/pile-10k`) for Activation Marsh, stated in `activation-store`;
   - Compiler Explorer's experimental compilers instead of building forks (P2996 reflection, contracts);
   - a named public dataset where a metric is needed (perplexity on WikiText-2 for quantization).
4. **Reword to generate its own input,** when the input is cheap: "first write abs, gcd, lerp and clamp as unconstrained templates", "write the branchy decoder first", "tokenise a generated 10 MB log".

**Separately, platform honesty.** The eight heavy shrines are mostly missing `requires` tags on this hardware: Linux-only tools (ELF/PLT, futex, glibc malloc, heaptrack, MSan), SMT and NUMA, which the M2 lacks, and Apple toolchain gaps (no libFuzzer, `std::generator`, `std::experimental::simd`, par backend or libomp). The fixes:
- add the tags so the Horizon routes these to the Linux server;
- add one toolchain note in `cmake-modern` (Homebrew LLVM, GCC and TBB, and libomp).

The 15 `gpu` shrines are tagged correctly, and stay unreachable until a CUDA GPU is in `stratum.local.yaml`.

**For generated worlds (M14 and M15),** the same rule becomes part of the craft: every input is built in the prompt, named earlier through `after`/`below`, a named free resource, or a shipped starter. `lint --design` warns on the phrasings above, and on "your X" without an `after`/`below` that builds X.

## Proposed fixes, shrine by shrine

The fix column uses the moves above: **chain** (to the named shrine), **starter**, **name**, **reword**, **tag**. Where a chain adds a new `after`, that's marked.

### Vague (34)

| Shrine | Missing | Proposed fix |
|---|---|---|
| perf-basics | "a real program"; no shrine builds the matching engine it mentions | chain `order-book` (replay its synthetic stream) |
| heaptrack-allocations | "a real program"; heaptrack is Linux-only | chain `order-book`; lead with the operator-new hook so it runs on the Mac |
| template-instantiation-cost | which template-heavy header | chain `expression-templates` |
| fuzzing | which parser; "until it finds a real bug" may never end | chain `std-expected-errors`; "or plant a bug after 30 min" |
| nsight-systems-intro | which PyTorch training step | chain `toy-superposition`, or name pytorch/examples `mnist` |
| contracts-26 | "a small numeric library"; which compiler | chain `concepts-constraints`; name Compiler Explorer's GCC trunk |
| concepts-constraints | the learner must invent the library first | reword: "first write abs, gcd, lerp, clamp, mean, dot unconstrained" |
| small-vector-sbo | "a realistic workload" | reword: tokenise a generated 10 MB log into `small_vector<string_view, 8>` per line |
| openmp-basics | "an irregular loop" | reword: Mandelbrot rows or a triangular all-pairs loop |
| activation-store | which corpus | name `NeelNanda/pile-10k` (the region's canonical corpus) |
| linear-probes | POS labels need a tagged corpus | name UD English-EWT, or reword to token position |
| feature-dashboard | "a large token corpus" | name the same corpus as `activation-store` |
| steering-vectors | no behaviour, pairs or model | name ActAdd's Love−Hate on GPT-2 small, layer 6 |
| induction-heads | "a small model" | name GPT-2 small (or TransformerLens attn-only-2l) |
| latency-measurement | "the same system" | reword: build a toy request loop with injected stalls |
| branch-free-decoder | "rewrite a decoder": no original | chain `binary-serialization` (its type dispatch) |
| agent-tool-loop | "one slow function" and its tests and bench | **starter**: a slow C++ function, a test file and a benchmark (seeds Agent Workshops) |
| bench-as-oracle | a reference and 5 candidates of what | chain `simd-intrinsics-dot` (scalar reference, accumulator variants) |
| differential-testing | which numeric kernels | chain `bench-as-oracle` |
| temple-kernel-forge | "10 kernels with references" | chain own Vector Coast and Kernel Jungle kernels, or name KernelBench level 1 |
| temple-lockfree-runtime | "a parallel benchmark suite"; which std::execution | chain `work-stealing-pool` (fib, quicksort); name NVIDIA `stdexec` |
| design-value-semantics | which reference-heavy API | **starter**: a 60-line reference-heavy OrderBook API (out-params, `shared_ptr<Order>`, observer refs) |
| design-dod | which OOP simulation | **starter**: an 80-line OOP particle sim with a virtual `Entity::update` |
| design-ownership | "a real codebase (yours or OSS)" | chain `temple-tick-to-trade` |
| design-error-philosophy | which "one system" | chain `temple-tick-to-trade` (feed handler, book, encoder) |
| design-hexagonal-trading | which trading system | chain `temple-tick-to-trade` |
| forge-failure-atlas | where the failures come from; no `llm-api` | chain `agent-tool-loop`: run it on 10 seeded tasks and log the failures; tag `llm-api` |
| theory-linear-representation | no model, concepts or data | chain `linear-probes` (GPT-2 small, its probe code) |
| theory-probing-limits | which model "provably doesn't use" the info | reword: train a tiny MLP with a provably unused input; probe it, then ablate |
| theory-amdahl | "a parallel program" | chain `threads-and-jthread` |
| theory-arith-intensity | "a small model" | name GPT-2 small |
| theory-memory-wall | "sourced data" | name Karl Rupp's microprocessor-trend-data plus Gholami et al., "AI and Memory Wall" |
| num-quantization | which model and metric | name GPT-2 small, perplexity on WikiText-2 |
| cc-pgo-lto | "a real program" | chain `perf-basics` (the program it profiled) |

### Heavy (8)

| Shrine | Problem on this hardware | Proposed fix |
|---|---|---|
| static-reflection-26 | building the clang-p2996 fork on the M2 | name Compiler Explorer's experimental P2996 clang |
| sanitizers | MSan doesn't exist on macOS | reword: run the MSan case on the Linux server, or split it out with `linux` |
| parallel-stl | Apple libc++ has no par backend | name Homebrew GCC + TBB, or tag `linux` |
| uarch-smt | the M2 has no SMT | tag `x86` |
| mem-numa | needs a multi-socket machine | tag `x86` if the server is dual-socket, else a new `numa` tag |
| linker-elf | ELF/PLT/GOT aren't on macOS (Mach-O) | tag `linux` |
| os-futex | futex(2) is Linux-only | tag `linux` |
| os-malloc-internals | glibc malloc is Linux-only; the workload is unspecified | tag `linux`; chain `arena-allocator` |

### Implicit own-artefact links (add `after`)

These already say "your X", but the map doesn't know where X comes from:

| Shrine | Proposed `after` |
|---|---|
| theory-superposition | toy-superposition |
| theory-circuits | induction-heads |
| theory-causal-abstraction | activation-patching (its current `after` points at theory-circuits) |
| theory-sae-limits | sae-training |
| theory-roofline | cpu-gemm-tiling, simd-intrinsics-dot (both `x86`; or name M2-friendly kernels) |
| theory-work-span | work-stealing-pool (`cuda-scan` needs `gpu`) |
| theory-interp-at-scale | temple-sae-engine |
| forge-division-of-labor, forge-economics | llm-kernel-optimization |
| core-pinning | spsc-ring-buffer |
| context-packing | agent-tool-loop |
| llm-kernel-optimization | simd-intrinsics-dot (name the kernel) |
| autotuner | agent-tool-loop, plus `requires: x86, llm-api` |
| claude-code-skill | `requires: llm-api` |
| gpu-tensor-cores | cuda-gemm-tiled (its `below` is flash-attention-mini) |
| temple-sae-engine | feature-dashboard, sae-encoder-kernel |
| temple-mini-flash | flash-attention-mini |
| temple-tick-to-trade | udp-multicast-feed, order-book, binary-serialization, plus `requires: linux` |
| temple-cpu-gemm | cpu-gemm-tiling |

**Smaller platform notes the reviewers flagged (check when touching those shrines):**
- `false-sharing`: perf c2c has no macOS equivalent.
- `raii-handles`: Valgrind doesn't run on Apple Silicon (ASan is already offered).
- `fuzzing`: Apple clang has no libFuzzer.
- `coroutines-generator` and `std-simd`: libc++ lacks them.
- `bits-integer-tricks`: pdep is x86 BMI2.
- `uarch-store-forwarding`: perf counters on the Mac.
- `mem-nontemporal`: x86-centric.
- `os-scheduler-jitter`: isolcpus and nohz_full need root and a reboot.

## Order and approvals

1. **Tags and `after` edges** are structural fields, so they need Tiago's OK.
   - Adding `after` to locked shrines doesn't move them. Placement only leans *new* shrines toward their predecessors.
   - Since nothing is started yet, regenerating the lockfile (with approval) would let these follow-ups sit next to their predecessors, as the 2026-10-01 review did.
   - So: do it **before the first `stratum start`**, or not at all.
2. **Rewordings and names** change prose. A session drafts them as one reviewable diff of world-seed.yaml, and Tiago approves or edits it in one pass.
3. **Starters** need the small engine change (`world/kits/<id>/`, copied by `start`) plus the files. Three are needed now (Regular types, Data-oriented design, the Agent Workshops seed). It fits naturally with M12, where templates move into the pack.
4. **The design-lint rule** joins M14's `lint --design`, and the generator (M15) follows it.

## Questions for Tiago

1. **Chains vs. starters.** Chaining adds prerequisites: you can't do *Ports and adapters for trading* until the tick-to-trade temple is done. Prefer chains with a starter fallback (recommended), or starters only, which keeps every shrine independent?
2. **May a session draft the rewordings** for the 34 vague prompts as one diff for you to review?
3. **Before the first start:** apply the tags and `after` edges, with a lockfile regeneration? This is the last cheap moment.
4. **GPU:** is there a CUDA machine in reach (the server, a cluster)? If not, should the 15 `gpu` shrines stay as they are (unreachable until `gpu` is in `stratum.local.yaml`), or get CPU or Metal fallbacks?
