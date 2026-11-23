import { useRef, type MouseEvent, type PointerEvent, type RefObject } from "react";
import type { Bounds, Point } from "./assistant-position";

export function useFloatingDrag(target: RefObject<HTMLElement | null>, drag: (start: Bounds, delta: Point) => void) {
  const gesture = useRef<{ id: number; bounds: Bounds; pointer: Point } | null>(null);
  const didDrag = useRef(false);

  function finish(event: PointerEvent<HTMLElement>) {
    if (gesture.current?.id === event.pointerId) gesture.current = null;
  }

  return {
    onPointerDown(event: PointerEvent<HTMLElement>) {
      const bounds = target.current?.getBoundingClientRect();
      if (!bounds || gesture.current || !event.isPrimary || event.button !== 0) return;
      didDrag.current = false;
      gesture.current = {
        id: event.pointerId,
        bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
        pointer: { x: event.clientX, y: event.clientY },
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove(event: PointerEvent<HTMLElement>) {
      const start = gesture.current;
      if (start?.id !== event.pointerId) return;
      const dx = event.clientX - start.pointer.x;
      const dy = event.clientY - start.pointer.y;
      if (!didDrag.current && Math.hypot(dx, dy) < 6) return;
      didDrag.current = true;
      drag(start.bounds, { x: dx, y: dy });
    },
    onPointerUp: finish,
    onPointerCancel: finish,
    onLostPointerCapture: finish,
    onClickCapture(event: MouseEvent<HTMLElement>) {
      if (!didDrag.current || event.detail === 0) return;
      didDrag.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
  };
}
