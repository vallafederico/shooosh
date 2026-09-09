---
status: done
---
# Optional bone and animation utilities

User-selected task: add `shooosh/rig`, separate from every simpler entry. Bone
references, validated local/world poses, explicit-time TRS animation sampling,
mesh-local skin palettes and sockets. Node extraction/CLI live in shooosh-model.
No renderer, Three.js, timer, loader or automatic skin deformation in the entry.
Build independently so existing core chunks remain identical. Test adversarial
hierarchies/poses, interpolation, bind-space math and consumer tree shaking.

Validation: 171 tests pass (one optional skip), core/model builds and viewer type
checks pass, 70 consumer tree-shaking checks pass. All 78 existing core JS files
remain identical. The actual car rig passes 105 clip/palette evaluations.
See [the audit](../audits/2026-09-09-optional-rig.md).
