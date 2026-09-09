---
status: done
---
# World-space mesh translation for 3D physics examples

User-selected bounded task: expose `positionX`, `positionY`, `positionZ` on
`createObject` options and `setTransform`. Apply translation after scale/rotation
in the shared model matrix, preserving perspective and scene depth on both
backends. Defaults are zero; reject non-finite setter values. Add regression
coverage for unchanged rotations/scales and translation/depth. Use in a Rapier
3D recipe, keeping physics dependencies outside the published runtime entry.

Verified: `bun test package examples/physics.test.ts` (123 pass, one optional skip),
`bun run bin/build.ts` (52 consumer checks plus nine example checks), production
harness build, and rendered 3D tray on both backends. Existing unrelated harness
TypeScript errors remain in FXAA metadata and nullable stage/nav references.
