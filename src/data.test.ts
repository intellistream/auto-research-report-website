import { describe, it, expect, vi, afterEach } from "vitest";
import normal from "../public/data/normal/report.json";
import pending from "../public/data/pending/report.json";
import catalog from "../public/data/catalog.json";
import {
  assetPath,
  checkedBytes,
  parseReport,
  safeSource,
  loadRun,
  loadCatalog,
} from "./data";
import {
  entriesOf,
  latestAvailable,
  sortReports,
  type CatalogItem,
  type Catalog,
} from "./types";
const normalItem = catalog.items.find((i) => i.id === "normal") as CatalogItem;
const pendingItem = catalog.items.find(
  (i) => i.id === "pending",
) as CatalogItem;
afterEach(() => vi.unstubAllGlobals());
describe("current report contract and identity", () => {
  it("accepts the actual production-assembler synthetic normal and pending outputs", () => {
    expect(entriesOf(parseReport(normal, normalItem))).toHaveLength(8);
    const report = parseReport(pending, pendingItem);
    expect(entriesOf(report).filter((e) => e.card.needs_review)).toHaveLength(
      3,
    );
    expect(Object.values(report.diagram_numbers).flat()).toHaveLength(3);
  });
  it("rejects a different report date or old schema", () => {
    expect(() =>
      parseReport({ ...normal, day: "2026-11-04" }, normalItem),
    ).toThrow(/日期/);
    expect(() =>
      parseReport(
        { ...normal, schema_version: "daily-report/0.3" },
        normalItem,
      ),
    ).toThrow(/版本/);
  });
  it("rejects duplicate work identities and incorrect chapter or graph coverage", () => {
    const r = structuredClone(normal);
    r.chapters[0].groups[1].entries[0].card.work_id =
      r.chapters[0].groups[0].entries[0].card.work_id;
    expect(() => parseReport(r, normalItem)).toThrow(/重复/);
    const graph = structuredClone(pending);
    graph.diagram_numbers.startup = [];
    expect(() => parseReport(graph, pendingItem)).toThrow(/覆盖/);
    const paper = structuredClone(normal);
    paper.chapters[8].groups[0].entries[0].card.content.diagram_nodes = [
      "startup",
    ];
    expect(() => parseReport(paper, normalItem)).toThrow(/图位置/);
  });
  it("does not accept incomplete body or missing title state", () => {
    const r = structuredClone(normal);
    Reflect.set(
      r.chapters[0].groups[0].entries[0].card.content,
      "problem",
      null,
    );
    expect(() => parseReport(r, normalItem)).toThrow(/正文/);
    const t = structuredClone(normal);
    Reflect.set(
      t.chapters[0].groups[0].entries[0].card.content,
      "title_status",
      null,
    );
    expect(() => parseReport(t, normalItem)).toThrow(/标题/);
  });
  it("rejects unsafe links inside an otherwise valid report", () => {
    const r = structuredClone(normal);
    r.chapters[0].groups[0].entries[0].card.content.source_links[0].url =
      "javascript:alert(1)";
    expect(() => parseReport(r, normalItem)).toThrow(/不安全/);
  });
});
describe("safe sources and downloads", () => {
  it("allows HTTPS but rejects scripts, data and embedded credentials", () => {
    expect(
      safeSource("https://github.com/vllm-project/vllm/pull/1"),
    ).toBeTruthy();
    for (const u of [
      "javascript:alert(1)",
      "data:text/html,hello",
      "https://user:secret@example.com",
      "file:///etc/passwd",
    ])
      expect(safeSource(u)).toBeNull();
  });
  it("only loads assets under a single allowed report directory", () => {
    expect(assetPath("/data/normal/report.docx")).toBe(
      "/data/normal/report.docx",
    );
    for (const p of [
      "/data/normal/../../secret",
      "https://example.com/report.docx",
      "/data/normal/..",
      "/data/normal/report.docx?token=x",
    ])
      expect(() => assetPath(p)).toThrow();
  });
  it("checks the file digest before returning a download", async () => {
    const content = new TextEncoder().encode("verified artifact");
    const hash = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", content)),
    )
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(content)),
    );
    expect(
      await checkedBytes({ path: "/data/normal/report.md", sha256: hash }),
    ).toEqual(content);
    await expect(
      checkedBytes({ path: "/data/normal/report.md", sha256: "0".repeat(64) }),
    ).rejects.toThrow(/校验失败/);
  });
  it("retains a failed HTTP result as failure instead of treating it as no report", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 404 })),
    );
    await expect(checkedBytes(normalItem.report!)).rejects.toThrow(/加载失败/);
  });
  it("rejects duplicate index identities", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ ...catalog, items: [normalItem, normalItem] }),
      ),
    );
    await expect(loadCatalog()).rejects.toThrow(/索引身份/);
  });
  it("rejects a run belonging to a different report even when its file hash matches", async () => {
    const bytes = new TextEncoder().encode(
      JSON.stringify({
        id: normalItem.run,
        report_id: "pending",
        synthetic: true,
      }),
    );
    const hash = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    )
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(bytes)),
    );
    await expect(
      loadRun({
        ...normalItem,
        runData: { path: "/data/normal/run.json", sha256: hash },
      }),
    ).rejects.toThrow(/身份不一致/);
  });
});

describe("real delivery data remains distinct from demonstration data", () => {
  it("accepts false synthetic flags when the report and index agree", () => {
    const raw = structuredClone(normal);
    raw.synthetic = false;
    expect(
      parseReport(raw, { ...normalItem, synthetic: false }).synthetic,
    ).toBe(false);
    expect(() => parseReport(raw, normalItem)).toThrow(/日期或来源/);
  });
  it("loads a catalog with both real deliveries and synthetic records", async () => {
    const mixed = {
      ...catalog,
      items: [{ ...normalItem, id: "real-test", synthetic: false }, normalItem],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(mixed)),
    );
    expect((await loadCatalog()).items[0].synthetic).toBe(false);
    expect(latestAvailable(mixed as Catalog)?.id).toBe("real-test");
  });
});

describe("archive chronology", () => {
  it("sorts date before source kind and groups versions of the same day without mutating the index", () => {
    const items: CatalogItem[] = [
      { ...normalItem, id: "real-older", day: "2026-11-03", synthetic: false },
      { ...normalItem, id: "demo-latest", day: "2026-11-06" },
      { ...normalItem, id: "demo-middle", day: "2026-11-05" },
      { ...normalItem, id: "demo-older", day: "2026-11-03" },
    ];
    expect(sortReports(items).map((i) => i.id)).toEqual([
      "demo-latest",
      "demo-middle",
      "real-older",
      "demo-older",
    ]);
    expect(items[0].id).toBe("real-older");
  });
});
