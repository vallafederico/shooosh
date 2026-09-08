---
id: 10
status: done
title: Render-phase nested scroll tracking
---

# 10 — Render-phase nested scroll tracking

User-requested follow-up to task 09 after observing scroll lag in the DOM lab.

Replace event-gated nested geometry invalidation with render-phase scroll-offset
sampling. Preserve independent nested clip movement, viewport scroll accounting,
and live measurements for sticky/fixed elements. Keep native input behavior.

Verify cached geometry before scroll event delivery, horizontal/vertical nested
scrolling, and document scroll without double counting. Run package tests/build
and the example's lifecycle checks on WebGL2 and WebGPU.

Compositor-thread scrolling may still lead a separate JavaScript-rendered canvas;
this task does not claim to eliminate that browser-level scheduling difference.

Verified: 104 package tests passed (one existing font test skipped), all nine
package build checks passed, example typecheck and harness build passed. All
nine interactive DOM-lab checks passed on WebGPU and WebGL2. Unit regressions
cover pre-event offset changes, independent nested clips and root scroll accounting.
