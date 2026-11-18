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
    expect(all).toHaveLength(24);
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
    expect(selected.map((entry) => entry.paper.slug)).toEqual(["sglang", "layerkv", "cacheflow", "astraea", "k-lpm", "gllm"]);
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
      if (entry.sourceDay) {
        expect(entry.sourceDay).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(entry.sourceVersion).toMatch(/^arXiv:\d{4}\.\d{4,5}v\d+$/);
      } else {
        expect(entry.sourceMonth).toMatch(/^\d{4}-\d{2}$/);
        expect(entry.sourceVersion).toBeTruthy();
      }
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

  it("combines the notes supplement with topic and keyword filters", () => {
    const query = new URLSearchParams({ collection: "notes-supplement" });
    const added = filterPapers(kvResearch.entries, query);
    expect(added).toHaveLength(14);
    expect(added.map((entry) => entry.paper.slug)).toEqual([
      "cacheslide", "saecache", "scissorhands", "nacl", "flexgen", "layerkv",
      "kvdrive", "tutti", "cacheflow", "distserve", "astraea", "k-lpm", "gllm", "kv-cache-survey",
    ]);
    expect(all.filter((entry) => !entry.paper.collection)).toHaveLength(10);
    const combined = new URLSearchParams({ collection: "notes-supplement", topic: "lifecycle", q: "ＮＡＣＬ", repo: "vllm" });
    expect(filterPapers(kvResearch.entries, combined).map((entry) => entry.paper.slug)).toEqual(["nacl"]);
    expect(paperViewQuery(combined).get("collection")).toBe("notes-supplement");
    const html = render("/topics/kv-cache?view=papers&collection=notes-supplement&topic=lifecycle&q=NACL");
    expect(html.match(/class="kv-reading-card"/g)).toHaveLength(1);
    expect(html).toContain('aria-label="论文收录范围"');
    expect(html).toContain("笔记增补");
    expect(html).toContain("topic=lifecycle&amp;collection=notes-supplement");
    expect(filterPapers(kvResearch.entries, new URLSearchParams({ collection: "notes-supplement", q: "PagedAttention" }))).toEqual([]);
  });

  it("shows month-only proceedings accurately and distinguishes survey content", () => {
    const slide = all.find((entry) => entry.paper.slug === "cacheslide")!;
    expect(slide.sourceDay).toBeNull();
    expect(slide.sourceMonth).toBe("2026-02");
    const html = render("/topics/kv-cache?view=papers&q=CacheSlide");
    expect(html).toContain('发表月份 <time dateTime="2026-02">2026-02</time>');
    expect(html).not.toContain("2026-02-24");
    expect(render("/topics/kv-cache?view=evidence&kind=paper")).toContain('发表月份 <time dateTime="2026-02">2026-02</time>');
    const survey = render("/topics/kv-cache?view=papers&q=KV+Cache+综述");
    expect(survey.match(/class="kv-reading-card"/g)).toHaveLength(1);
    expect(survey).toContain("<dt>综述内容</dt>");
    expect(survey).toContain("不能直接作为统一基准排名");
  });

  it("retains consequential method and evidence boundaries in the supplement", () => {
    const get = (slug: string) => all.find((entry) => entry.paper.slug === slug)!;
    expect(get("kvdrive").paper.boundary).toContain("动态稀疏注意力");
    expect(get("nacl").paper.method).toContain("生成阶段按间隔继续淘汰");
    expect(get("cacheflow").sourceVersion).toBe("arXiv:2604.25080v2");
    expect(get("cacheflow").paper.method).toContain("整批 DP");
    expect(get("astraea").paper.boundary).toContain("真值 oracle");
    expect(get("k-lpm").paper.method).toContain("k−1");
    expect(get("k-lpm").paper.venue).toBe("NeurIPS 2025");
    expect(get("k-lpm").sourceDay).toBe("2026-01-01");
    for (const slug of ["kvdrive", "tutti"]) expect(get(slug).topics).not.toContain("scheduling");
  });
});
