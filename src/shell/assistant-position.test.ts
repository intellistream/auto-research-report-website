import { expect, it } from "vitest";
import { constrainPosition, placePanel } from "./assistant-position";

const trigger = { width: 60, height: 60 };
const desktop = { width: 1280, height: 820 };

it("opens above the bottom-right launcher and aligns their right edges", () => {
  const panel = { width: 360, height: 210 };
  expect(placePanel({ ...trigger, x: 1200, y: 740 }, panel, desktop)).toEqual({ x: 900, y: 518 });
});

it("opens below a launcher near the top and keeps a wide panel in view", () => {
  const mobile = { width: 390, height: 700 };
  const panel = { width: 366, height: 456 };
  expect(placePanel({ ...trigger, x: 12, y: 12 }, panel, mobile)).toEqual({ x: 12, y: 84 });
});

it("clamps a moved panel when the screen gets smaller", () => {
  const mobile = { width: 390, height: 640 };
  const panel = { width: 366, height: 480 };
  expect(constrainPosition({ x: 700, y: 580 }, panel, mobile)).toEqual({ x: 12, y: 148 });
});
