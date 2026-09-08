/**
 * shooosh/dom — optional, SSR-safe DOM adapter. Importing has no side effects.
 *
 * const dom = await createDomLayer({ canvas, root });
 * const image = dom?.media(img, { shaders: { fragment: wgsl } });
 * await image?.ready; // active, fallback, or disposed (offscreen waits for a draw)
 * dom?.invalidate(); // application-owned layout/style change
 * dom?.destroy();    // restores native images and releases owned resources
 *
 * First release: cached rectangular shader quads and image takeover. No text,
 * video, CSS box painting, transforms, rounded clips or arbitrary stacking.
 * See docs/dom.md for the supported CSS and canvas composition contract.
 */
export { createDomLayer } from "./session";
export type { DomLayerOptions, DomLayer, DomBinding, DomBindingOptions, DomBindingState, DomReadyResult, DomError } from "./session";
