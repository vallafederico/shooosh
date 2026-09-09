---
status: done
---
# Optional transform math

User-selected task: create a separate `shooosh/utils` subpath for quaternion
composition, vector rotation and pose conversion. Keep object positions in the
existing mesh API. No engine imports of utils, no physics dependency, no root
re-export. Update 3D example and source aliases, document conventions and reusable
outputs, test math and verify emitted package/consumer isolation.

Validation: 121 package tests pass (one optional skip), package/harness builds
pass, 58 consumer bundle checks pass, and 3D example renders on both backends.
