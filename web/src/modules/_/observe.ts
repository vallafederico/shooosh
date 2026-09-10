export interface ObserveConfig {
  root?: HTMLElement | null;
  rootMargin?: string;
  threshold?: number;
  autoStart?: boolean;
  once?: boolean;
  callback?: (data: ObserveEventData) => void;
}

export interface ObserveEventData {
  entry: IntersectionObserverEntry;
  direction: number;
  isIn: boolean;
}

interface ObserverGroup {
  config: ObserveConfig;
  observer: IntersectionObserver;
  elements: Map<
    HTMLElement,
    {
      callbacks: {
        isIn?: (data: ObserveEventData) => void;
        isOut?: (data: ObserveEventData) => void;
        callback?: (data: ObserveEventData) => void;
      };
      once: boolean;
      lastDirection?: number;
    }
  >;
}

export class ObserverManager {
  private static instance: ObserverManager;
  private groups: ObserverGroup[] = [];

  private constructor() {}

  static getInstance(): ObserverManager {
    if (!ObserverManager.instance) {
      ObserverManager.instance = new ObserverManager();
    }
    return ObserverManager.instance;
  }

  private configsMatch(config1: ObserveConfig, config2: ObserveConfig): boolean {
    return config1.root === config2.root && config1.rootMargin === config2.rootMargin;
  }

  private handleIntersection(entries: IntersectionObserverEntry[]) {
    entries.forEach((entry) => {
      if (!(entry.target instanceof HTMLElement)) return;
      const group = this.groups.find((g) => {
        return (
          entry.target instanceof HTMLElement && g.elements.has(entry.target)
        );
      });

      if (!group) return;

      const element = entry.target;
      const elementData = group.elements.get(element);
      if (!elementData) return;

      const { isIntersecting, boundingClientRect } = entry;

      let direction = -1;
      if (elementData.lastDirection !== undefined) {
        direction = isIntersecting
          ? boundingClientRect.top > 0
            ? 1
            : -1
          : boundingClientRect.top > 0
            ? -1
            : 1;
      }
      elementData.lastDirection = direction;

      if (isIntersecting) {
        elementData.callbacks.isIn?.({ entry, direction, isIn: true });
        elementData.callbacks.callback?.({ entry, direction, isIn: true });

        if (elementData.once) {
          this.removeElement(element);
        }
      } else {
        elementData.callbacks.isOut?.({ entry, direction, isIn: false });
        elementData.callbacks.callback?.({ entry, direction, isIn: false });
      }
    });
  }

  addElement(
    element: HTMLElement,
    config: ObserveConfig,
    callbacks: {
      isIn?: (data: ObserveEventData) => void;
      isOut?: (data: ObserveEventData) => void;
      callback?: (data: ObserveEventData) => void;
    },
  ): ObserverGroup {
    this.removeElement(element);

    let group = this.groups.find((g) => this.configsMatch(g.config, config));

    if (!group) {
      const observer = new IntersectionObserver((entries) => this.handleIntersection(entries), {
        ...config,
        threshold: [0],
      });

      group = {
        config,
        observer,
        elements: new Map(),
      };
      this.groups.push(group);
    }

    group.elements.set(element, {
      callbacks,
      once: config.once || false,
      lastDirection: undefined,
    });
    group.observer.observe(element);

    return group;
  }

  removeElement(element: HTMLElement) {
    const group = this.groups.find((g) => g.elements.has(element));
    if (!group) return;

    group.observer.unobserve(element);
    group.elements.delete(element);

    if (group.elements.size === 0) {
      group.observer.disconnect();
      this.groups = this.groups.filter((g) => g !== group);
    }
  }
}

export class Observe {
  element: HTMLElement;
  #config: ObserveConfig;
  protected isIn(_data: ObserveEventData): void {}
  protected isOut(_data: ObserveEventData): void {}
  inView: boolean;
  callback: ({
    entry,
    direction,
    isIn,
  }: {
    entry: IntersectionObserverEntry;
    direction: number;
    isIn: boolean;
  }) => void;

  constructor(
    element: HTMLElement,
    config: ObserveConfig = {
      root: null,
      rootMargin: "0px",
      threshold: 0,
      autoStart: false,
      once: false,
      callback: undefined,
    },
  ) {
    // super(element);
    this.element = element;
    this.#config = config;
    this.inView = false;
    this.callback = config.callback || (() => {});

    if (config.autoStart) this.start();

    // hey.on("START", () => this.start());
  }

  start() {
    ObserverManager.getInstance().addElement(this.element, this.#config, {
      isIn: (data) => {
        this.inView = true;
        this.isIn?.(data);
      },
      isOut: (data) => {
        this.inView = false;
        this.isOut?.(data);
      },
      callback: this.callback,
    });
  }

  stop() {
    ObserverManager.getInstance().removeElement(this.element);
  }

  destroy() {
    this.stop();
  }
}
