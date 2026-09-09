---
name: shooosh-gpgpu-validation
description: Validate a shooosh WebGPU/WebGL2 simulation port, including real GPU state updates, parity limits, buffer hazards, lifecycle, GL state restoration and bundle isolation.
---

# Validate a GPU simulation port

Use after implementing or changing a compute/GPGPU fallback. Read
`docs/gpgpu-fallbacks.md` and the example's copy guide for the intended capability
and quality differences. A backend label or successful build is not proof that
a simulation ran.

## Evidence to collect

- Run the production-built example on each forced backend. Inspect pixels and
  compiler/validation logs. Check input repulsion, decay/restoration, pause,
  reset while paused, canvas resize and remount after switching demos/backends.
- In a test-only GPU harness, inspect state after initialization and integration.
  Verify finite values, expected grid/sphere bounds, nonzero movement, unchanged
  buffers when paused, and deterministic reset. Readback is permitted in tests,
  not in the animation path.
- Exercise both ping-pong directions. Assert that no pass reads its own output
  binding, and that render uses the newest state. On WebGL2, check `getError`
  only in validation and compare touched bindings/enables before/after a draw.
- Check partial compile/link/allocation failure and teardown during async init.
  Verify buffers, programs, VAOs, feedbacks or render targets are deleted and
  listeners/subscriptions are removed. Hidden/offscreen/paused views must stop
  requesting continuous frames; input and visibility can wake them.
- Compare counts, integration units, force/noise definitions, point sizes and
  depth conventions. Chaos and floating-point differences can diverge over time;
  report qualitative parity separately from deterministic single-backend reset.
- Use existing repo checks (`bun test package`, `bun run bin/build.ts`, the
  harness TypeScript check and website build). Verify no core/package changes,
  no fallback import on the WebGPU path and no new runtime dependency. Repeat
  performance measurements if claiming a measured speed or budget.

Keep meaningful, repeatable validation as a standalone harness where practical.
Do not substitute mocked API calls or a CPU reimplementation for proof that the
actual GPU shaders executed. Record what was checked and material limits; do not
claim unsupported algorithms or browsers work.
