import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import TopicPages from "./TopicPages";
import { filterPapers, kvResearch, paperViewQuery } from "./kv-research";
import { safeTopicSource } from "./topic-report";

function render(path: string) {
  return renderToStaticMarkup(<MemoryRouter initialEntries={[path]}>
    <Routes><Route path="/topics/:topicId?" element={<TopicPages error="daily index unavailable" />} /></Routes>
  </MemoryRouter>);
}
const all = filterPapers(kvResearch.entries, new URLSearchParams());

describe("KV paper reading", () => {
  it("opens the dedicated section without daily indexes and ignores PR-only URL scope", () => {
    const html = render("/topics/kv-cache?view=papers&repo=vllm-ascend&kind=pr&month=2026-11");
    expect(html).toContain("从论文理解 KV Cache");
    expect(html.match(/class="kv-reading-card"/g)).toHaveLength(all.length);
    expect(all).toHaveLength(10);
    expect(html).not.toContain("daily index unavailable");
    expect(html).not.toContain('class="kv-source-trend"');
    expect(html).not.toContain('class="kv-daily-citations"');
    for (const entry of all) {
      expect(html).toContain(`id="kv-paper-${entry.paper.slug}"`);
      expect(html).toContain(safeTopicSource(entry.url)!.replaceAll("&", "&amp;"));
    }
  });

  it("uses the same deduplicated inventory and supports topic plus normalized text search", () => {
    const rows = [...kvResearch.entries, all[0]];
    expect(filterPapers(rows, new URLSearchParams())).toHaveLength(all.length);
    expect(filterPapers(rows, new URLSearchParams({ q: "ＫＩＶＩ" })).map((entry) => entry.paper.slug)).toEqual(["kivi"]);
    expect(filterPapers(rows, new URLSearchParams({ q: "h2o" })).map((entry) => entry.paper.slug)).toEqual(["h2o"]);
    const selected = filterPapers(rows, new URLSearchParams({ topic: "scheduling" }));
    expect(selected.map((entry) => entry.paper.slug)).toEqual(["sglang"]);
    expect(filterPapers(rows, new URLSearchParams({ topic: "movement", q: "KIVI" }))).toEqual([]);
    const html = render("/topics/kv-cache?view=papers&topic=representation&q=KIVI");
    expect(html.match(/class="kv-reading-card"/g)).toHaveLength(1);
    expect(html).toContain('id="kv-paper-kivi"');
    const empty = render("/topics/kv-cache?view=papers&q=no-paper-matches-this");
    expect(empty).toContain("当前筛选下没有论文");
    expect(empty).not.toContain('class="kv-reading-card"');
  });

  it("preserves research topics when entering papers and clears stale PR filters", () => {
    const next = paperViewQuery(new URLSearchParams({ repo: "vllm", month: "2026-11", kind: "pr", label: "offload", q: "HCache" }));
    expect(next.get("view")).toBe("papers");
    expect(next.get("topic")).toBe("movement");
    expect(next.get("q")).toBe("HCache");
    for (const key of ["repo", "month", "kind", "label"]) expect(next.has(key)).toBe(false);
    const html = render("/topics/kv-cache?view=evidence&repo=vllm&month=2026-11&kind=pr&label=offload");
    const href = html.match(/href="([^"]+)"[^>]*>论文<\/a>/)?.[1].replaceAll("&amp;", "&");
    expect(href).toContain("view=papers");
    expect(href).toContain("topic=movement");
    for (const key of ["repo=", "month=", "kind=", "label="]) expect(href).not.toContain(key);
    expect(render("/topics")).toContain("/topics/kv-cache?view=papers");
  });

  it("keeps each original paper, version and reading boundary reviewable", () => {
    expect(new Set(all.map((entry) => entry.id.replace(/v\d+$/, ""))).size).toBe(all.length);
    expect(new Set(all.map((entry) => entry.paper.slug)).size).toBe(all.length);
    for (const entry of all) {
      expect(entry.reviewLevel).toBe("paper-section");
      expect(entry.checkedAt).toBe("2026-11-18");
      expect(entry.sourceDay).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(entry.sourceVersion).toMatch(/^arXiv:\d{4}\.\d{4,5}v\d+$/);
      for (const text of [entry.paper.problem, entry.paper.method, entry.paper.boundary, entry.paper.readingScope]) expect(text.length).toBeGreaterThan(15);
      expect(entry.paper.sources.length).toBeGreaterThanOrEqual(2);
      for (const source of entry.paper.sources) expect(safeTopicSource(source.url)).toBeTruthy();
    }
    const get = (slug: string) => all.find((entry) => entry.paper.slug === slug)!;
    expect(get("kvpr").paper.venue).toBe("Findings of ACL 2025");
    expect(get("hydragen").paper.venue).toContain("Workshop");
    expect(get("lmcache").paper.venue).toBe("arXiv 2025");
    expect(get("kivi").paper.readingScope).toContain("待阅读标记");
    expect(get("streamingllm").paper.boundary).toContain("缓存以外的信息不可访问");
    expect(get("hcache").paper.boundary).toContain("GQA/MQA");
    expect(get("h2o").paper.boundary).toContain("实验预算配置");
    const library = render("/topics/kv-cache?view=evidence&kind=paper");
    for (const entry of all) expect(library).toContain(`view=papers&amp;part=kv-paper-${entry.paper.slug}`);
    expect(JSON.stringify(all)).not.toMatch(/WPSDrive|[A-Z]:\\|来源文件|\.docx/);
  });
});
