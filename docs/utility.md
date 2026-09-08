# Interaction utilities

`shooosh/utility` is an optional, dependency-free entry with no renderer imports or automatic animation loop.

```ts
import { createSpinner } from 'shooosh/utility'

const spinner = createSpinner({
  element: canvas,
  sensitivity: 0.008, // radians per CSS pixel
  damping: 5, // exponential decay per second
  inertia: !matchMedia('(prefers-reduced-motion: reduce)').matches,
})

// Inside your existing frame callback:
const { x, y } = spinner.update(frame.delta / 1000) // seconds
item.setUni({ value5: x, value6: y })

// On teardown:
spinner.destroy()
```

Vertical dragging rotates X; horizontal dragging rotates Y. State also exposes `dragging` and `moving`. Dragging directly controls rotation; release momentum decays to rest. `reset()` restores zero rotation and stops momentum. `destroy()` removes listeners and releases pointer capture; it is safe to call twice. The returned state is a stable, read-only view, not a snapshot.

Only the primary pointer and button initiate drags. Pointer capture keeps the drag attached outside the element. Cancellation and lost capture stop momentum. A pause before release cancels the throw. Long frame gaps are capped at 100 ms. No layout reads or frame allocations are required by the utility.

The owner controls CSS and accessibility. For a dedicated touch surface, set `touch-action: none` before the gesture; this disables native scrolling on that surface. Provide instructions, a reset affordance, and keyboard alternatives appropriate to your interface. The utility does not alter styles or focus behavior.

See [refractive glass](../examples/refractive-glass.ts) for two-axis rotation of a rounded slab. Its backdrop remains procedural; the material is an artistic screen-space approximation, not physically accurate transmission through arbitrary HTML.
