import { expect, it } from "vitest";
import { chooseDock, constrainAssistant, resizePanel } from "./assistant-position";

const trigger = { width: 120, height: 120 };
const desktop = { width: 1280, height: 820 };
const bottomRight = { ...trigger, x: 1140, y: 680 };
const aboveRight = { above: true, right: true };

it("places the panel on the roomier side of the mascot when opened", () => {
  expect(chooseDock(bottomRight, desktop)).toEqual(aboveRight);
  expect(chooseDock({ ...trigger, x: 46, y: 28 }, desktop)).toEqual({ above: false, right: false });
});

it("moves the mascot only as far as the attached panel can follow", () => {
  const panel = { width: 360, height: 210 };
  expect(constrainAssistant({ ...trigger, x: 30, y: 80 }, panel, aboveRight, desktop)).toEqual({ x: 252, y: 234 });
  expect(constrainAssistant(bottomRight, panel, aboveRight, desktop)).toEqual({ x: 1140, y: 680 });
});

it("keeps both controls in view on narrow screens", () => {
  const screen = { width: 390, height: 640 };
  const panel = { width: 366, height: 400 };
  const belowLeft = { above: false, right: false };
  const position = constrainAssistant(bottomRight, panel, belowLeft, screen);
  expect(position.x).toBe(12);
  expect(position.y + trigger.height + 12 + panel.height).toBe(screen.height - 12);
});

it("resizes along both axes from the panel corner opposite the mascot", () => {
  const panel = { width: 360, height: 220 };
  expect(resizePanel(panel, { x: -80, y: -77 }, bottomRight, aboveRight, desktop, false))
    .toEqual({ width: 440, height: 297 });
  const topLeft = { ...trigger, x: 24, y: 24 };
  expect(resizePanel(panel, { x: 80, y: 77 }, topLeft, { above: false, right: false }, desktop, false))
    .toEqual({ width: 440, height: 297 });
});

it("bounds resizing by the available space and keeps the controls usable", () => {
  const panel = { width: 360, height: 220 };
  expect(resizePanel(panel, { x: -1500, y: -1500 }, bottomRight, aboveRight, desktop, false))
    .toEqual({ width: 1248, height: 656 });
  expect(resizePanel(panel, { x: 500, y: 500 }, bottomRight, aboveRight, desktop, false))
    .toEqual({ width: 264, height: 186 });
  expect(resizePanel(panel, { x: 500, y: 500 }, bottomRight, aboveRight, desktop, true))
    .toEqual({ width: 264, height: 245 });
});
