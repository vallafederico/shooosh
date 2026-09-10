/*
Module lifecycle:

  destroy()            — teardown registry, run on navigation/swap
  pageIn() / pageOut() — page transition animations
  view()               — IntersectionObserver binding
  track()              — scroll-bound 0…1 progress
*/

import { Observe, type ObserveConfig } from "./observe";
import { Track, type TrackConfig } from "./track";

/** -- <stores> */
type DestroyEntry = { fn: () => void; element?: HTMLElement };

/** Teardown functions returned from module default exports (preferred cleanup path). */
const moduleTeardowns: DestroyEntry[] = [];
const destroy: DestroyEntry[] = [];

/** Element whose module function is currently running (set by createCycles) —
 * lets teardowns registered during init auto-scope to their module's root. */
let contextElement: HTMLElement | undefined;

export function withModuleContext<T>(element: HTMLElement, fn: () => T): T {
  const previous = contextElement;
  contextElement = element;
  try {
    return fn();
  } finally {
    contextElement = previous;
  }
}

export function registerModuleTeardown(fn: () => void, element?: HTMLElement) {
  moduleTeardowns.push({ fn, element: element ?? contextElement });
}

/** -- <lifecycle> */
export function onDestroy(fn: () => void, { element }: { element?: HTMLElement } = {}) {
  destroy.push({ fn, element: element ?? contextElement });
}

function flush(store: DestroyEntry[], scope?: Element) {
  const kept: DestroyEntry[] = [];
  for (const { fn, element } of store) {
    // no scope = full teardown. With a scope, entries survive only when their
    // element lives outside it and is still attached; element-less entries
    // (registered outside module init) default to page-scoped.
    if (!scope || !element?.isConnected || scope.contains(element)) fn();
    else kept.push({ fn, element });
  }
  store.length = 0;
  store.push(...kept);
}

/**
 * Run registered teardowns. Called with no scope on a full document swap;
 * called with the outgoing `[data-router-view]` on router navigations so modules
 * on persistent chrome (header/footer outside the view) keep running.
 */
export function runDestroy(scope?: Element) {
  flush(moduleTeardowns, scope);
  flush(destroy, scope);
}

/** -- <animation> */
const pageOut: Array<() => Promise<void>> = [];
const pageIn: Array<() => Promise<void>> = [];

export function onPageOut(fn: () => Promise<void>, { element }: { element?: HTMLElement } = {}) {
  if (element) {
    pageOut.push(async () => {
      const rect = element.getBoundingClientRect();
      const isCurrentlyVisible = rect.top < window.innerHeight && rect.bottom > 0;
      return isCurrentlyVisible ? await fn() : Promise.resolve();
    });
  } else {
    pageOut.push(fn);
  }
}

export async function runPageOut() {
  await Promise.allSettled(pageOut.map((fn) => fn()));
  pageOut.length = 0;
}

export function onPageIn(fn: () => Promise<void>) {
  pageIn.push(fn);
}

export async function runPageIn() {
  await Promise.allSettled(pageIn.map((fn) => fn()));
  pageIn.length = 0;
}

export function onView(element: HTMLElement, config: ObserveConfig) {
  const observer = new Observe(element, config);

  onDestroy(() => {
    observer.destroy();
  });

  return observer;
}

export function onTrack(element: HTMLElement, config: TrackConfig = {}) {
  const track = new Track(element, config);

  onDestroy(() => {
    track.destroy();
  });

  return track;
}
