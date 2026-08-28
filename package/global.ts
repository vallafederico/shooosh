/**
 * IIFE / unpkg entry. Attaches the browser API to `window.Shooosh`.
 *
 * How to use (Webflow / no bundler):
 *   <script src="https://unpkg.com/shooosh"></script>
 *   const { createScene, acquireLayer, createItem } = window.Shooosh
 *
 * Same exports as `package/index.ts`. Not the Node MSDF toolchain.
 *
 * Docs: docs/getting-started.md · docs/site-patterns.md
 */
import * as lib from "./index";

const GLOBAL_NAME = "Shooosh";

const globalScope =
  typeof window !== "undefined"
    ? window
    : typeof globalThis !== "undefined"
      ? globalThis
      : typeof self !== "undefined"
        ? self
        : undefined;

if (globalScope) {
  (globalScope as unknown as Record<string, unknown>)[GLOBAL_NAME] = lib;
}
