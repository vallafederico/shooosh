# Docs

Start at [`/llms.txt`](../llms.txt). This folder is the focused set.

| File | What |
| --- | --- |
| [shader-contract.md](./shader-contract.md) | Authored WGSL, uniforms, backends, failure policy |
| [shader-translation.md](./shader-translation.md) | WGSL ↔ GLSL 300 es mapping and converters |
| [api.md](./api.md) | Public API after the dual renderer |
| [agent-tasks/](./agent-tasks/) | Executable queue. Lowest `status: todo` wins |

Agent skills for shader ports: [`.cursor/skills/wgsl-to-glsl`](../.cursor/skills/wgsl-to-glsl/SKILL.md), [`.cursor/skills/glsl-to-wgsl`](../.cursor/skills/glsl-to-wgsl/SKILL.md).
