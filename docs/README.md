# Docs

Start at [`/llms.txt`](../llms.txt). This folder is the focused set.

| File | What |
| --- | --- |
| [shader-contract.md](./shader-contract.md) | Authored WGSL, uniforms, backends, failure policy |
| [shader-translation.md](./shader-translation.md) | WGSL ↔ GLSL 300 es mapping and converters |
| [api.md](./api.md) | Public API after the dual renderer |
| [site-patterns.md](./site-patterns.md) | How we use this on aiuis / Webflow / sliders |
| [msdf.md](./msdf.md) | Node/Bun font atlas + icon SDF generators |
| [agent-tasks/](./agent-tasks/) | Executable queue. Lowest `status: todo` wins |

Agent skills:

- Shader ports: [wgsl-to-glsl](../.cursor/skills/wgsl-to-glsl/SKILL.md), [glsl-to-wgsl](../.cursor/skills/glsl-to-wgsl/SKILL.md)
- Sites: [shooosh-site](../.cursor/skills/shooosh-site/SKILL.md), [shooosh-item](../.cursor/skills/shooosh-item/SKILL.md), [shooosh-post](../.cursor/skills/shooosh-post/SKILL.md)
- Assets: [shooosh-msdf](../.cursor/skills/shooosh-msdf/SKILL.md)
