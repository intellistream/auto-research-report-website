export type Point = { x: number; y: number };
export type Size = { width: number; height: number };
export type Bounds = Point & Size;
export type Dock = { above: boolean; right: boolean };

const margin = 12;
const gap = 12;

function constrainPosition(position: Point, size: Size, viewport: Size): Point {
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

export function chooseDock(trigger: Bounds, viewport: Size): Dock {
  return {
    above: trigger.y + trigger.height / 2 >= viewport.height / 2,
    right: trigger.x + trigger.width / 2 >= viewport.width / 2,
  };
}

export function constrainAssistant(
  trigger: Bounds, panel: Size | undefined, dock: Dock, viewport: Size,
): Point {
  if (!panel) return constrainPosition(trigger, trigger, viewport);
  const size = {
    width: Math.max(trigger.width, panel.width),
    height: trigger.height + gap + panel.height,
  };
  const offsetX = dock.right ? size.width - trigger.width : 0;
  const offsetY = dock.above ? panel.height + gap : 0;
  const position = constrainPosition({ x: trigger.x - offsetX, y: trigger.y - offsetY }, size, viewport);
  return { x: position.x + offsetX, y: position.y + offsetY };
}

export function resizePanel(
  start: Size, delta: Point, trigger: Bounds, dock: Dock, viewport: Size, expanded: boolean,
): Size {
  const availableWidth = dock.right ? trigger.x + trigger.width - margin : viewport.width - trigger.x - margin;
  const availableHeight = dock.above
    ? trigger.y - gap - margin
    : viewport.height - trigger.y - trigger.height - gap - margin;
  const requestedWidth = start.width + (dock.right ? -delta.x : delta.x);
  const requestedHeight = start.height + (dock.above ? -delta.y : delta.y);
  const fit = (requested: number, minimum: number, available: number) =>
    Math.max(1, Math.min(Math.max(requested, minimum), available));
  return {
    width: fit(requestedWidth, 264, Math.max(start.width, availableWidth)),
    height: fit(requestedHeight, expanded ? 245 : 186, Math.max(start.height, availableHeight)),
  };
}

export function viewportSize(): Size {
  return { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight };
}
