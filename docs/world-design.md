# Designing a Stratum world: the craft, for agents

*For any agent (or person) designing, extending or reviewing a world: read this before writing a shrine. It distils what was learned building and playtesting the first world. Every rule here exists because breaking it broke the experience. `DESIGN.md` is the spec for the engine; this is the craft of the content.*

Stratum is a **knowledge game**. The learner explores a map by doing real work, and the map only changes when real work is done. Your job isn't to list topics. It's to build a place the learner *wants to go back to*, where every visible thing is an invitation, every task can be started in the next five minutes, and finishing one opens the way to the next.

## 1. What keeps a learner coming back

Seven forces do the work. Design for all of them, and check your world against them when you're done.

1. **Pull: visible goals.** People go to what they can see. Towers are seen from everywhere, tall landmarks (p ≥ 4) peek over ridges, silhouettes with names (p ≥ 3) hint at what's there, and a sealed temple shows what it needs. A fresh map should show **15–25%** of the world: enough to choose between, little enough that most is still a promise.
2. **Few choices, all good.** The Horizon offers three next steps (continue nearby, change layer, head far). That only works if every shrine near the learner is startable *now*: concrete, self-contained, the right size. One vague shrine in the Thread slot breaks the whole loop.
3. **Finishable units.** S is 2–3 h, M 4–6 h, L 8–12 h, and the `done` can be checked without judging "understanding". A learner who finishes something in a sitting comes back. One who stalls on "what am I supposed to do?" doesn't.
4. **Payoff moments.** The engine provides them: the descent from the sky island, a glow lighting under a shrine you've started, fog lifting from where you stood, a padlock opening ("Unlocked: …"), the trail growing. Your content has to *set them up*: a glow needs a depths shrine `below`, an unlock needs a lock in view, a far landmark needs a ridge to peek over.
5. **Continuity: your work comes back.** The best follow-ups reuse what the learner built: their hash map becomes an LRU cache, their order book gets profiled, their SAE gets a dashboard. It turns a list into a journey, and it's what makes locks feel like abilities rather than gates.
6. **Curiosity gaps.** "???" silhouettes, names glimpsed across a ridge, a depths layer that's dark until lit. Never explain what the map will show. Never spoil a region before it's reached.
7. **No guilt.** No streaks, XP or nagging. An old camp burns down to embers; it doesn't send warnings. Don't write prompts that scold, and don't make anything mandatory except what a lock or temple genuinely needs.

## 2. The rules for a single shrine

A shrine is a **specific problem with an open solution, startable in five minutes, checkable when done.**

### 2.1 Hand over a problem, not the job of finding one

The learner should solve problems, not pose them. Choosing *what* to work on is a different, open-ended task, and it stalls a session before it starts.

- ✗ *"Design an abstraction that claims to be zero-overhead (e.g. strong typedefs for prices and quantities) and prove it with asm and benchmarks."* Which abstraction? The "e.g." is the real task, offered as optional.
- ✗ *"Write a parser for a small format."* · *"Parallelise an irregular loop."* · *"Pick one of your kernels."* · *"Explore memory ordering."*
- ✓ *"Write a parser for order lines like `B,100,101.25` twice, once with exceptions and once with std::expected (C++23). Measure the cost per line on 1e6 lines at 0, 0.1, 1, 10 and 50% error rates."*
- ✓ *"Parallelise the rows of a 4096×4096 Mandelbrot image over [−2, 1] × [−1.5, 1.5] (max 1,000 iterations) with OpenMP… Compare the static, dynamic and guided schedules."*

Name the exact thing to build or answer, its inputs and sizes, and what to compare against. Leave *how* to the learner. When you'd write "(e.g. X)", write X.

### 2.2 No hunting for outside material

Every input is one of:
- built in the prompt itself;
- an earlier shrine's artefact, named by title ("your order book (*The order book* shrine)");
- a specific, free resource named outright (GPT-2 small, `NeelNanda/pile-10k`, Compiler Explorer);
- a **starter kit** shipped in `world/kits/<id>/` and copied in by `stratum start`.

- ✗ *"Profile a real program."* · *"Redesign a reference-heavy API."* (which?) · *"a small model"* · *"a realistic workload"* · *"your matching engine"*, when no shrine builds one.
- ✓ *"Profile your order book (*The order book* shrine) replaying its synthetic stream with perf stat/record…"*
- ✓ *"Redesign the starter in this folder (a ~100-line reference-heavy order-book API) around values."* The kit holds the smells, unlabelled.

When a whole region needs a common subject, name **one canonical choice once**, early in the region, and refer back to it. Activation Marsh uses GPT-2 small and one corpus throughout. Agent Workshops reuses one starter task.

### 2.3 Make it need doing, not remembering

A task a well-read solver can answer from memory teaches nothing, and to an AI-assisted learner it's a one-line prompt away. Make the answer come from **construction or measurement**, on a specified matrix where there's a real trade-off:

- ✗ A single-size benchmark of "sliding window median". It's a textbook problem, and the two-heap answer can be recalled.
- ✓ Score it over **two inputs** (a calm tick walk, and one with gaps and bad prints) and **four window sizes** (15 to 1023), by geometric mean. Measured: the textbook O(log w) answer loses 2–3× at small windows to a sorted window and wins at 1023. The crossover has to be found by measuring, and a fast path tuned to calm data has to survive the jumpy input.

Ask: could someone who's read the canonical reference finish this without running anything? If yes, add the measurement that makes it real.

### 2.4 A `done` you can check

- **A table, a plot, a benchmark with named sizes, passing tests,** or a write-up that answers a stated question. Never "understand X", "be familiar with Y" or "learn Z".
- `stratum clear` checks the write-up's three sections, the word count and that an artefact exists. The `done` is the learner's own checklist on top, so make it concrete enough to tick.

### 2.5 Size, honesty and voice

- **Size it to the timebox,** and give every theme an S entry point.
- **Be honest about hardware.** Add a `requires` tag for anything that can't run on the learner's main machine: Linux-only tools (futex, ELF/PLT, glibc malloc, perf), x86-only features (SMT, AVX-512, pdep), a GPU, an API key. Where only one step needs another machine, say so in the prompt ("MSan on the Linux server") rather than gating the whole shrine.
- **Keep the voice:** terse, imperative, 1–3 sentences. Specific beats long, but specific usually means a few more words, not a paragraph.
- **Never write paths or CLI commands into prose.** The engine derives the exact folder and command for the learner's setup and shows them in the panel. A prompt that says "run `stratum clear x`" is wrong in someone's copy.
- **Personalise.** Use the learner's domain where it's natural: prices in ticks, order books, Monte Carlo, if the learner is in finance. The brief (`world/brief.md`) says who they are. Flavour raises pull; it should never add prerequisites.

## 3. The rules for the world

### 3.1 Layers mean levels

The **sky** holds frameworks and big ideas: design and argument, a small prototype, the write-up doing most of the work. The **surface** holds concrete practice: build it, test it, benchmark it. The **depths** hold the mechanism under a specific surface shrine: counters, disassembly, profilers. Every depths shrine sits `below` the surface shrine whose machinery it explains, and it glows once that shrine is started.

A sky shrine still needs a concrete subject and a concrete question. "Argue about X" isn't a task; "Argue *whether* Y, using your measurements of Z" is.

### 3.2 The opening area is the tutorial

There is no separate tutorial. Teach the way good games do, **by placement, not instruction**: a tower seen from everywhere needs no arrow pointing at it, and a tool lying next to a demonstration of what it does needs no explanation. Within reach of where the learner lands, they should *see* every mechanic before they need it:

| Mechanic | What to place near the start |
|---|---|
| The descent | One **self-contained, small** opening shrine on a sky island above the plateau (`start.sky`): a big idea with a concrete build, clearable in a sitting or two. Clearing it is the descent. |
| Towers | The start region's tower, revealed and close: a natural first Thread. |
| Locks | One shrine in plain sight with `needs`, whose key is **seen** (even as a named silhouette) a ridge or so away. The padlock primes the rule; walking to the key and back teaches it. |
| Glows | A few start shrines with a depths shrine `below`, so an early set out lights something underneath. |
| The triangle rule | Low ridges (h = 1) around the start, and a few p ≥ 4 landmarks just beyond them. |
| Temples | One sealed capstone on the horizon, whose panel lists what opens it. |

A test checks this for the shipped world (`core/test/explore.test.ts`, "the opening area shows each mechanic"). Playtest your opening in `npm run sandbox`.

### 3.3 Shape and pacing

- **6–12 surface regions of 8–14 shrines,** each with **one tower** (its survey prompt asks for proposals, which is how the world grows). Sky islands and depths veins mirror the surface's topics.
- **Ridges set the pace.** Use low ridges (1) between regions that belong together. The default (2) means landmarks peek over. Use high ridges (3–4) where the learner should go around or climb a tower.
- **A few p ≥ 4 landmarks per region** pull from afar. Keep most shrines at p = 2.
- **Themes:** 2–5 shrines each, clustered on the map, each with a small entry point.
- **`after`** only where one shrine's artefact or idea is real preparation for another. Follow-ups are placed next to their predecessors, and the Horizon's Thread follows placement, so `after` *is* the learning path.
- **Temples:** 0–2 per region, each needing 3–4 shrines, ideally from different themes.

### 3.4 Locks are abilities, and rare

`needs` on an ordinary shrine makes it **locked**: seen and readable, a padlock on the map, not startable until its needs are cleared. Then it opens by itself. This is the metroidvania beat: go somewhere, notice you don't have what it takes, come back when you do. It works only if it's rare and earned:
- **About 5% of shrines.** The first world has 13 of 217.
- **Only where the task literally works on the earlier artefact:** "add SwissTable control bytes to *your* hash map". Anything a quick stand-in could satisfy is an `after`, with the stand-in named in the prompt.
- **Keep the key findable.** It should be seen before it's needed, ideally near the lock.
- **No chains longer than two locks,** and never a cycle (the loader rejects one).

### 3.5 Spoilers and discovery

The learner is meant to discover the world. When you hand off a generated world, tell them only the region names and what's on the plateau. Don't summarise what's ahead, and don't quote shrines they haven't seen. The public site (`stratum build --static --public`) shows the fresh view and nothing hidden.

## 4. Process: from a learner to a world

1. **Interview** (write `world/brief.md`):
   - the goal and why;
   - current level, and time per week;
   - the end state;
   - preferred artefacts;
   - the machines and tools available (they become `requires` tags);
   - the domain they care about (for flavour);
   - what to avoid.
2. **Skeleton:** regions and their topics, the three layers, ridges and the plateau. Choose the opening shrine and island.
3. **Shrines, region by region.** Write each one to §2. Parallel agents work well here, each given the brief, this guide and its neighbours.
4. **Links:** `after` paths, `below` for every depths shrine, `links` across layers (launch points), a few locks (§3.4), temples.
5. **Audit passes** (§5). Run all of them. Each one found real problems in the first world after it was "finished".
6. **Validate:** `stratum lint` must be clean; `stratum build`; then `stratum lint --design`, explaining every check out of range (the opening area, §3.2, is one of them).
7. **Playtest the opening** in `npm run sandbox`: land, read the first three Horizon cards, open the panels. Every card should be startable without a question.
8. **Hand off, spoiler-safe** (§3.5). Changes to placement are cheap only before the first `stratum start`; after that, positions are fixed for good.

## 5. Audit passes

Run each pass over every shrine. Classify, then fix the failures with the smallest change that keeps the voice. In the first world:
- pass A found 34 of 217 prompts needing outside material;
- pass B found 104 of 217 problems that were posed (32) or loosely scoped (72);
- pass C found 8 that were heavy on the learner's hardware.

They're cheap to rerun after any edit, and should be rerun after the world grows (towers add proposals).

**A. Outside material** (§2.2). *SELF*: everything needed is in the prompt, a named earlier artefact, a named free resource, or a kit. *VAGUE*: needs unspecified external material. Flag phrasings: "a real", "a small", "an API", "a codebase", "a system", "a model", "a dataset", "a realistic workload", "of your choice", and "your X" with no shrine that builds X.

**B. Problem-posing** (§2.1). *SPECIFIC*: the problem, its inputs, sizes and comparison are given. *POSING*: the learner must choose or invent the problem ("design a/an …", "(e.g. …)" as the real task, "pick/choose", "one of your …", "explore/investigate", an essay with no question). *LOOSE*: chosen, but the scope or measurement is left open ("benchmark it", "compare", "realistic"). Fix: make the problem specific and keep the solution open.

**C. Platform honesty** (§2.5). For each shrine: can the learner's main machine do every step? If not, add a tag, or name the other machine for that step.

**D. Recall** (§2.3). For each shrine that asks for an optimisation or an answer: could a well-read solver finish it without measuring? If so, add the matrix that makes the answer empirical.

**E. Engagement** (§1, §3). Check the world as a whole:
- Does the fresh map show 15–25%?
- Does every theme have an S entry point?
- Is any region more than 50% hardware-gated?
- Are locks about 5%, each with a findable key?
- Does every depths shrine sit under something an early learner would start?
- Is there an island of content with no links, follow-ups or depths?

`stratum lint --design` measures most of these, and flags §5 A and B phrasings for review: run it after every pass. A proposed `stratum simulate` will measure the discovery curve and reachability (`docs/plans/template.md`, M14).

## 6. Worked examples

Each pair is a real fix from the first world.

| Before | After | Rule |
|---|---|---|
| "Design an abstraction that claims to be zero-overhead (e.g. strong typedefs for prices and quantities) and prove it with asm and benchmarks." | "Build `Price` and `Quantity` strong typedefs over int64 ticks that only allow unit-correct arithmetic (Price × Quantity → Notional), and prove them zero-overhead against the raw `int64_t` version: -O2 asm from Clang and GCC (Compiler Explorer) and a benchmark, on a VWAP over 1e6 fills." | §2.1: the opening shrine, a specific problem with an open solution |
| "Profile a real program (e.g. your matching engine or a JSON parser) with perf…" | "Profile your order book (*The order book* shrine) replaying its synthetic stream with perf stat/record…" | §2.2: name the input, and reuse the learner's own work |
| "Explain Stepanov's regular types…, then redesign a reference-heavy API around values." | "…then redesign the starter in this folder (a ~100-line reference-heavy order-book API) around values." (with a kit) | §2.2: ship the material |
| "Implement Sean Parent-style runtime polymorphism (e.g. any_callable…)…" | "…a value-type `instrument` over any type with `double price() const`, with a small-buffer optimisation, tested on types of 8, 24 and 64 bytes." | §2.1: the e.g. becomes the spec |
| "Benchmark the rolling median." | "Two inputs (calm, jumpy) × windows 15–1023, scored by geometric mean." | §2.3: make the answer empirical |
| *Contracts in C++26*, unlocked from the start | `needs: [concepts-constraints]`: a padlock on the plateau, its key a named silhouette across the ridge | §3.2, §3.4: prime the lock mechanic by sight |
| "…then run `stratum clear tut-first-steps`." | "…then clear it from a terminal with the command the panel gives you." | §2.5: no paths or commands in prose |
