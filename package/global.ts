// Entry point for the IIFE/unpkg bundle: attaches the full API to a global.
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
