# Zombies performance: profile, fixes, before / after

Branch `perf-hotpaths` (2026-10-20). The goal is a smoother Zombies without losing the look. What matters is the **p95 and the worst frame**
(you feel the jaggedness, not the average). Measured on the user's laptop: i9-14900HX with an Intel UHD iGPU, an RTX 4070 Laptop and a
2560×1600 240 Hz panel. All runs are headless Edge.

## Tools

- `node tools/zombies-profile.mjs [w1,w28,boss,storm,snow,night,dust,rain,fog,scattered,fx] [--sec=4] [--json=f] [--w= --h= --dpr=] [--no-ablate]`
  For each scenario it reports:
  - frame pacing (avg / p50 / p95 / p99 / worst interval, frames over 20 ms) and frame CPU (all rAF callbacks);
  - GPU time per frame (`EXT_disjoint_timer_query_webgl2` around `composer.render`);
  - draw calls and triangles, split into shadow / main / post passes and grouped by top-level object;
  - programs, objects, transparent objects and materials;
  - the GPU cost of each big feature, by switching it off for a moment (shadow map, forest, clouds, bloom, Zombies effects);
  - GC pauses, long tasks and style / layout / paint time from a Chrome trace;
  - JS self time and inclusive time per game function (CDP profiler);
  - **allocations per frame**, garbage included (sampling heap profiler with `includeObjectsCollectedByMinor/MajorGC`).
- `node tools/zombies-profile.mjs --events [--cpu]`: one 15 s timeline through the moments that used to hitch: the boss wave starting,
  weather changing to storm, snow, night, dust and golden, a 12-burst barrage, and a crash and relaunch. It lists every frame over 12 ms of
  CPU or 25 ms of interval, with the event before it, and **every shader compile over 20 ms with the material and object that caused it**.
- `node tools/zombies-perf-shots.mjs OUTDIR [views]` and `--diff A B`: same-seed, fixed-camera screenshots (forest, sites, high, smoke, burn,
  storm, snow, overcast, night, thermal) to compare two builds picture for picture.
- `DL_HIGHGPU=1` (tools/browser.mjs) starts headless Edge with `--force_high_performance_gpu`. Without it, headless Edge on this laptop
  draws on the **Intel iGPU**.
- `DL_NORENDER=1` skips draw calls: use it for the CPU side only.

Caveat: the GPU and CPU were shared with up to five other agents' browsers during these runs. Frame intervals (especially p95 / worst)
were noisy from run to run. Frame CPU, allocations, draw calls, GC and the event timeline are the steadier numbers. Before / after runs
were interleaved (before, after, before, after) and the medians are reported.

RESULTS_PLACEHOLDER
