import { registerModuleTeardown, withModuleContext } from "./runner";

// Every file in src/modules/ is a module: default export (el, dataset) =>
// optional teardown. Elements opt in with data-module="<file name>".
type ModuleTeardown = () => void;
type ModuleInitializer = (
  element: HTMLElement,
  dataset: DOMStringMap,
) => undefined | ModuleTeardown;
interface ModuleExport {
  default?: ModuleInitializer;
}

const modules = import.meta.glob<ModuleExport>("../*.{ts,js}", { eager: true });

declare global {
  interface HTMLElement {
    _moduleInitialized?: boolean;
  }
}

export function createCycles(dataAttribute = "module") {
  return Array.from(document.querySelectorAll<HTMLElement>(`[data-${dataAttribute}]`))
    .map((element) => {
      const attributeValue = element.dataset[dataAttribute];

      // per-element init guard — re-running createCycles (navigation,
      // late-added content) must not double-bind
      if (element._moduleInitialized) {
        return null;
      }

      const modulePath = modules[`../${attributeValue}.ts`]
        ? `../${attributeValue}.ts`
        : `../${attributeValue}.js`;

      const mod = modules[modulePath];

      if (!mod) {
        console.warn(`${dataAttribute} not found: "${attributeValue}"`);
        return null;
      }
      if (!mod.default) {
        console.warn(`Default export is not a function for ${dataAttribute} "${attributeValue}"`);
        return null;
      }

      const init = mod.default;

      try {
        element._moduleInitialized = true;
        // context lets onDestroy/onView/onTrack calls inside init auto-scope
        // to this element, so scoped destroys (router swaps) spare persistent
        // chrome
        const result = withModuleContext(element, () => init(element, element.dataset));
        if (result) {
          registerModuleTeardown(result, element);
        }
        return result;
      } catch (error) {
        delete element._moduleInitialized;
        console.warn(
          `Failed to call default function for ${dataAttribute} "${attributeValue}":`,
          error,
        );
        return null;
      }
    })
    .filter((item) => item !== null);
}

/** Manually clear the init guard (testing / hot re-binding). */
export function clearModuleInitialization(element: HTMLElement) {
  delete element._moduleInitialized;
}
