import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import DocxPreview from "./DocxPreview";
import type { Catalog } from "./report-preview-data";

const request = vi.hoisted(() => ({ data: {} as Record<string, unknown>, errors: {} as Record<string, string>, paths: [] as (string | undefined)[] }));
vi.mock("./report-preview-data", async (importOriginal) => {
  const original = await importOriginal<typeof import("./report-preview-data")>();
  return { ...original, useJson: (path?: string) => {
    request.paths.push(path);
    if (!path) return undefined;
    if (request.errors[path]) return { path, error: request.errors[path] };
    return path in request.data ? { path, data: request.data[path] } : undefined;
  } };
});

function render(path: string) {
  return renderToStaticMarkup(<MemoryRouter initialEntries={[path]}><DocxPreview /></MemoryRouter>);
}
const counts = { upstream: 1, ascend: 0, papers: 0 };
const oldVersion = "a".repeat(64);
const currentVersion = "b".repeat(64);
const currentPath = `2026-11-16/${currentVersion}/report.json`;
const oldPath = `2026-11-16/${oldVersion}/report.json`;
const previousDayPath = `2026-11-15/${oldVersion}/report.json`;
const catalog: Catalog = { schemaVersion: 1, days: {
  "2026-11-15": { current: oldVersion, versions: [{ sha256: oldVersion, path: previousDayPath, counts }] },
  "2026-11-16": { current: currentVersion, versions: [
    { sha256: oldVersion, path: oldPath, counts },
    { sha256: currentVersion, path: currentPath, counts },
  ] },
} };

beforeEach(() => { request.data = {}; request.errors = {}; request.paths = []; });

describe("persistent report reading navigation", () => {
  it.each(["/topics", "/topics/kv-cache?view=papers", "/topics/aclgraph", "/topics/aclgraph?view=analysis", "/contributors"])("keeps reading accessible at %s before the daily catalog loads", (path) => {
    const html = render(path);
    expect(html).toContain('href="/reports/latest"');
    expect(html).toContain(">研报阅读</a>");
    if (path.startsWith("/topics")) expect(request.paths).not.toContain("catalog.json");
  });

  it("keeps the reading entry visible while the catalog is loading or failed", () => {
    expect(render("/")).toContain(">研报阅读</a>");
    request.errors["catalog.json"] = "catalog unavailable";
    const html = render("/reports/latest");
    expect(html).toContain("catalog unavailable");
    expect(html.match(/<a[^>]*href="\/reports\/latest"[^>]*>/)?.[0]).toContain('aria-current="page"');
  });

  it("opens the most recent catalog day and its current version through the stable entry", () => {
    request.data["catalog.json"] = catalog;
    const html = render("/reports/latest");
    expect(request.paths).toContain(currentPath);
    expect(html).not.toContain("没有找到该日期或版本的日报");
    expect(html.match(/<a[^>]*href="\/reports\/latest"[^>]*>/)?.[0]).toContain('aria-current="page"');
  });

  it("preserves explicit versions and dated report links", () => {
    request.data["catalog.json"] = catalog;
    render(`/reports/latest?version=${oldVersion}`);
    expect(request.paths).toContain(oldPath);
    request.paths = [];
    render("/reports/2026-11-15");
    expect(request.paths).toContain(previousDayPath);
  });
});
