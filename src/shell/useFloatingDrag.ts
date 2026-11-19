import { useRef, type MouseEvent, type PointerEvent, type RefObject } from "react";
import { constrainPosition, viewportSize, type Point } from "./assistant-position";

export function useFloatingDrag(target: RefObject<HTMLElement | null>, move: (point: Point) => void) {
  const gesture = useRef<{ id: number; origin: Point; pointer: Point } | null>(null);
  const didDrag = useRef(false);

  function finish(event: PointerEvent<HTMLElement>) {
    if (gesture.current?.id === event.pointerId) gesture.current = null;
  }

  return {
    onPointerDown(event: PointerEvent<HTMLElement>) {
      const bounds = target.current?.getBoundingClientRect();
      if (!bounds || !event.isPrimary || event.button !== 0) return;
      didDrag.current = false;
      gesture.current = {
        id: event.pointerId,
        origin: { x: bounds.x, y: bounds.y },
        pointer: { x: event.clientX, y: event.clientY },
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove(event: PointerEvent<HTMLElement>) {
      const start = gesture.current;
      const element = target.current;
      if (start?.id !== event.pointerId || !element) return;
      const dx = event.clientX - start.pointer.x;
      const dy = event.clientY - start.pointer.y;
      if (!didDrag.current && Math.hypot(dx, dy) < 6) return;
      didDrag.current = true;
      move(constrainPosition(
        { x: start.origin.x + dx, y: start.origin.y + dy },
        element.getBoundingClientRect(),
        viewportSize(),
      ));
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
