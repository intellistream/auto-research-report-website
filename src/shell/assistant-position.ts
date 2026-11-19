export type Point = { x: number; y: number };
type Size = { width: number; height: number };
type Bounds = Point & Size;

const margin = 12;
const gap = 12;

export function constrainPosition(position: Point, size: Size, viewport: Size): Point {
  function constrain(offset: number, length: number, available: number) {
    const last = Math.max(0, available - length);
    const inset = Math.min(margin, last / 2);
    return Math.min(Math.max(offset, inset), last - inset);
  }
  return {
    x: constrain(position.x, size.width, viewport.width),
    y: constrain(position.y, size.height, viewport.height),
  };
}

export function placePanel(trigger: Bounds, panel: Size, viewport: Size): Point {
  const above = trigger.y - gap - panel.height;
  const below = trigger.y + trigger.height + gap;
  const spaceBelow = viewport.height - below;
  const preferAbove = above >= margin || (spaceBelow < panel.height + margin && trigger.y - gap >= spaceBelow);
  return constrainPosition({
    x: trigger.x + trigger.width - panel.width,
    y: preferAbove ? above : below,
  }, panel, viewport);
}

export function viewportSize(): Size {
  return { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight };
}
