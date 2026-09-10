/**
 * shooosh/dom — optional, SSR-safe DOM adapter. Importing has no side effects.
 *
 * const dom = await createDomLayer({ canvas, root });
 * const image = dom?.media(img); // built-in shaders support both backends
 * const page = dom?.scan(); // media/bind/box/text marks (bind needs shaders.bind)
 * await image?.ready; // active, fallback, or disposed (offscreen waits for a draw)
 * dom?.invalidate(); // application-owned layout/style change
 * dom?.destroy();    // restores native images and releases owned resources
 *
 * First release: cached rectangular shader quads, image takeover, CSS boxes
 * and MSDF text from marked nodes. Page scan is the same bindings, not HTML
 * capture. No video, transforms, or arbitrary stacking.

 * Start with docs/agent-dom-rendering.md; docs/dom.md is the API/CSS contract.
 * Custom shaders need a prepared WGSL/GLSL pair (shooosh/build).
 */
export { createDomLayer } from "./session";
export { DEFAULT_BIND_SELECTOR, DEFAULT_BOX_SELECTOR, DEFAULT_MEDIA_SELECTOR, DEFAULT_TEXT_SELECTOR } from "./scan";
export type { DomLayerOptions, DomLayer, DomBinding, DomBindingOptions, DomBindingState, DomReadyResult, DomError, DomScan, DomScanOptions, DomFontSource } from "./session";
