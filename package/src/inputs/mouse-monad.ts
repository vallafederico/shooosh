export type MouseMonadState = {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  dragX: number;
  dragY: number;
  dragTargetX: number;
  dragTargetY: number;
  isDragging: boolean;
  hasPointer: boolean;
};

export type CreateMouseMonadOptions = {
  /** Pointer source element. Defaults to window. */
  element?: Window | HTMLElement;
  /** Lerp factor applied each update call (0..1). */
  easing?: number;
  /** Scales drag delta contribution used for additive rotation. */
  dragSensitivity?: number;
  /** Reset target to center when pointer leaves. */
  resetOnLeave?: boolean;
};

export class MouseMonad {
  private readonly element: Window | HTMLElement;
  private readonly easing: number;
  private readonly dragSensitivity: number;
  private readonly dragSensitivityYMultiplier = 1.8;
  private readonly resetOnLeave: boolean;
  private readonly releaseInertiaDamping = 0.9;
  private readonly releaseInertiaBoost = 0.7;
  private readonly releaseInertiaMinVelocity = 0.0007;
  private readonly recenterDurationFrames = 64;
  private returnToCenterActive = false;
  private recenterStarted = false;
  private recenterProgress = 0;
  private recenterFromX = 0;
  private recenterFromY = 0;
  private activePointerId: number | null = null;
  private lastDragClientX = 0;
  private lastDragClientY = 0;
  private dragInertiaVelocityX = 0;
  private dragInertiaVelocityY = 0;
  private dragInertiaActive = false;
  private state: MouseMonadState = {
    x: 0,
    y: 0,
    targetX: 0,
    targetY: 0,
    dragX: 0,
    dragY: 0,
    dragTargetX: 0,
    dragTargetY: 0,
    isDragging: false,
    hasPointer: false,
  };
  private readonly onPointerMove = (event: PointerEvent) => {
    this.state.hasPointer = true;
    const { x, y } = this.normalizePointer(event);
    this.state.targetX = x;
    this.state.targetY = y;
    if (this.activePointerId !== event.pointerId) {
      return;
    }
    const { width, height } = this.getInteractionSize();
    const deltaX = ((event.clientX - this.lastDragClientX) / width) * 2;
    const deltaY = ((event.clientY - this.lastDragClientY) / height) * 2;
    this.lastDragClientX = event.clientX;
    this.lastDragClientY = event.clientY;
    const dragDeltaX = deltaX * this.dragSensitivity;
    const dragDeltaY =
      deltaY * this.dragSensitivity * this.dragSensitivityYMultiplier;
    this.state.dragTargetX = clamp(this.state.dragTargetX + dragDeltaX, -9, 9);
    this.state.dragTargetY = clamp(this.state.dragTargetY + dragDeltaY, -9, 9);
    this.dragInertiaVelocityX = dragDeltaX;
    this.dragInertiaVelocityY = dragDeltaY;
  };
  private readonly onPointerDown = (event: PointerEvent) => {
    this.activePointerId = event.pointerId;
    this.lastDragClientX = event.clientX;
    this.lastDragClientY = event.clientY;
    this.returnToCenterActive = false;
    this.recenterStarted = false;
    this.recenterProgress = 0;
    this.dragInertiaActive = false;
    this.dragInertiaVelocityX = 0;
    this.dragInertiaVelocityY = 0;
    this.state.isDragging = true;
    this.state.hasPointer = true;
  };
  private readonly onPointerUpOrCancel = (event: PointerEvent) => {
    if (this.activePointerId !== event.pointerId) {
      return;
    }
    this.releaseDrag();
  };
  private readonly onPointerLeave = () => {
    this.state.hasPointer = false;
    if (this.state.isDragging) {
      // Treat leaving the window as releasing the drag.
      this.releaseDrag();
    }
    if (this.resetOnLeave) {
      this.state.targetX = 0;
      this.state.targetY = 0;
    }
  };

  constructor(options: CreateMouseMonadOptions = {}) {
    if (!options.element && typeof window === "undefined") {
      throw new Error("MouseMonad requires a browser element or window.");
    }
    this.element = options.element ?? window;
    this.easing = Math.max(0, Math.min(1, options.easing ?? 0.09));
    this.dragSensitivity = Math.max(
      0.05,
      Math.min(4, options.dragSensitivity ?? 0.9),
    );
    this.resetOnLeave = options.resetOnLeave ?? true;
    this.element.addEventListener("pointermove", this.onPointerMove as EventListener);
    this.element.addEventListener("pointerdown", this.onPointerDown as EventListener);
    this.element.addEventListener("pointerup", this.onPointerUpOrCancel as EventListener);
    this.element.addEventListener("pointercancel", this.onPointerUpOrCancel as EventListener);
    this.element.addEventListener("pointerleave", this.onPointerLeave as EventListener);
  }

  get() {
    return this.state;
  }

  update() {
    this.state.x += (this.state.targetX - this.state.x) * this.easing;
    this.state.y += (this.state.targetY - this.state.y) * this.easing;
    if (!this.state.isDragging && this.dragInertiaActive) {
      this.state.dragTargetX = clamp(
        this.state.dragTargetX + this.dragInertiaVelocityX,
        -9,
        9,
      );
      this.state.dragTargetY = clamp(
        this.state.dragTargetY + this.dragInertiaVelocityY,
        -9,
        9,
      );
      this.dragInertiaVelocityX *= this.releaseInertiaDamping;
      this.dragInertiaVelocityY *= this.releaseInertiaDamping;
      this.dragInertiaActive =
        Math.abs(this.dragInertiaVelocityX) > this.releaseInertiaMinVelocity ||
        Math.abs(this.dragInertiaVelocityY) > this.releaseInertiaMinVelocity;
    }
    if (this.returnToCenterActive && !this.state.isDragging) {
      if (!this.dragInertiaActive) {
        if (!this.recenterStarted) {
          this.recenterStarted = true;
          this.recenterProgress = 0;
          this.recenterFromX = this.state.dragTargetX;
          this.recenterFromY = this.state.dragTargetY;
        }
        this.recenterProgress = Math.min(
          1,
          this.recenterProgress + 1 / this.recenterDurationFrames,
        );
        const eased = easeExpoOut(this.recenterProgress);
        this.state.dragTargetX = this.recenterFromX * (1 - eased);
        this.state.dragTargetY = this.recenterFromY * (1 - eased);
        if (this.recenterProgress >= 1) {
          this.state.dragTargetX = 0;
          this.state.dragTargetY = 0;
          this.returnToCenterActive = false;
          this.recenterStarted = false;
        }
      }
    }
    this.state.dragX +=
      (this.state.dragTargetX - this.state.dragX) * this.easing;
    this.state.dragY +=
      (this.state.dragTargetY - this.state.dragY) * this.easing;
    return this.state;
  }

  destroy() {
    this.element.removeEventListener("pointermove", this.onPointerMove as EventListener);
    this.element.removeEventListener("pointerdown", this.onPointerDown as EventListener);
    this.element.removeEventListener("pointerup", this.onPointerUpOrCancel as EventListener);
    this.element.removeEventListener("pointercancel", this.onPointerUpOrCancel as EventListener);
    this.element.removeEventListener("pointerleave", this.onPointerLeave as EventListener);
  }

  private getInteractionSize() {
    if (this.element instanceof Window) {
      return {
        width: Math.max(1, this.element.innerWidth),
        height: Math.max(1, this.element.innerHeight),
      };
    }

    const bounds = this.element.getBoundingClientRect();
    return {
      width: Math.max(1, bounds.width),
      height: Math.max(1, bounds.height),
    };
  }

  private releaseDrag() {
    this.activePointerId = null;
    this.state.isDragging = false;
    this.returnToCenterActive = true;
    this.recenterStarted = false;
    this.recenterProgress = 0;
    this.dragInertiaVelocityX *= this.releaseInertiaBoost;
    this.dragInertiaVelocityY *= this.releaseInertiaBoost;
    this.dragInertiaActive =
      Math.abs(this.dragInertiaVelocityX) > this.releaseInertiaMinVelocity ||
      Math.abs(this.dragInertiaVelocityY) > this.releaseInertiaMinVelocity;
  }

  private normalizePointer(event: PointerEvent) {
    if (this.element instanceof Window) {
      const width = Math.max(1, this.element.innerWidth);
      const height = Math.max(1, this.element.innerHeight);
      const x = (event.clientX / width) * 2 - 1;
      const y = (event.clientY / height) * 2 - 1;
      return { x: clamp(x, -1, 1), y: clamp(y, -1, 1) };
    }

    const bounds = this.element.getBoundingClientRect();
    const width = Math.max(1, bounds.width);
    const height = Math.max(1, bounds.height);
    const x = ((event.clientX - bounds.left) / width) * 2 - 1;
    const y = ((event.clientY - bounds.top) / height) * 2 - 1;
    return { x: clamp(x, -1, 1), y: clamp(y, -1, 1) };
  }
}

export function createMouseMonad(options: CreateMouseMonadOptions = {}) {
  return new MouseMonad(options);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function easeExpoOut(t: number) {
  return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
}
