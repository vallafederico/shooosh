/** Session-local resource ownership, including releases while an upload is pending. */
export function createResourceCache<T extends { destroy(): void }>(load: (source: string) => Promise<T>) {
  type Entry = { refs: number; ready: Promise<T>; resource?: T };
  const entries = new Map<string, Entry>();
  return {
    acquire(source: string) {
      let entry = entries.get(source);
      if (!entry) {
        const next: Entry = { refs: 0, ready: null! };
        next.ready = load(source).then(resource => {
          next.resource = resource;
          if (next.refs === 0) resource.destroy();
          return resource;
        }).catch(error => {
          if (entries.get(source) === next) entries.delete(source);
          throw error;
        });
        entries.set(source, next); entry = next;
      }
      entry.refs++;
      const retained = entry;
      let released = false;
      return { ready: retained.ready, release() {
        if (released) return; released = true;
        if (--retained.refs === 0) {
          if (entries.get(source) === retained) entries.delete(source);
          retained.resource?.destroy();
        }
      } };
    },
  };
}
