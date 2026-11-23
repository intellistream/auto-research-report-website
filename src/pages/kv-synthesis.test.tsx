import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import TopicPages from "./TopicPages";
import { filterPapers, kvResearch } from "./kv-research";
import { kvSynthesis, synthesisPaper } from "./kv-synthesis";

function render(search: string) {
  return renderToStaticMarkup(<MemoryRouter initialEntries={[`/topics/kv-cache?${search}`]}>
    <Routes><Route path="/topics/:topicId?" element={<TopicPages error="daily index unavailable" />} /></Routes>
  </MemoryRouter>);
}

describe("KV research synthesis", () => {
  it("opens the synthesis independently and makes an invalid question fall back visibly", () => {
    const html = render("view=survey");
    expect(html).toContain("三种方法分别改变什么");
    expect(html).not.toContain("daily index unavailable");
    expect(html).toContain('data-comparison-paper="pagedattention"');
    expect(html).toContain('data-comparison-paper="h2o"');
    expect(html).toContain('data-comparison-paper="kivi"');
    const invalid = render("view=survey&topic=unrecognized");
    expect(invalid).toContain("未找到该研究问题");
    expect(invalid).toContain("三种方法分别改变什么");
  });

  it("keeps every cited paper and engineering entry connected to included sources in the stated group", () => {
    for (const group of kvSynthesis.groups) {
      for (const row of group.rows) {
        const paper = synthesisPaper(row.slug);
        expect(paper?.decision).toBe("included");
        expect(paper?.topics).toContain(group.id);
        const target = render(`view=papers&part=kv-paper-${row.slug}`);
        expect(target).toContain(`id="kv-paper-${row.slug}"`);
      }
      for (const id of group.engineeringIds) {
        const source = kvResearch.entries.find((entry) => entry.id === id);
        expect(source?.kind).toBe("pr");
        expect(source?.decision).toBe("included");
        expect(source?.topics).toContain(group.id);
      }
    }
    expect(kvSynthesis.groups.map((group) => group.id).sort())
      .toEqual(kvResearch.taxonomy.map((topic) => topic.id).sort());
    // Mechanism comparisons must not rewrite the underlying primary classifications.
    expect(synthesisPaper("h2o")?.primaryTopic).toBe("lifecycle");
    expect(synthesisPaper("pagedattention")?.primaryTopic).toBe("lifecycle");
    expect(synthesisPaper("kivi")?.primaryTopic).toBe("representation");
  });

  it("does not carry incompatible list filters into cited papers or engineering destinations", () => {
    const html = render("view=survey&topic=movement&repo=vllm&month=2026-11&collection=recommended&q=KIVI&kind=pr");
    expect(html.match(/data-comparison-paper=/g)).toHaveLength(3);
    expect(html).toContain('href="/topics/kv-cache?view=papers&amp;part=kv-paper-hcache"');
    expect(html).toContain('href="/topics/kv-cache?view=evidence&amp;kind=pr&amp;topic=movement"');
    expect(html).toContain('href="/topics/kv-cache?view=papers&amp;topic=movement&amp;part=kv-papers-filters"');
    expect(html).toContain("不表示这些 PR 实现或复现了上面的论文");
    const linkedPapers = filterPapers(kvResearch.entries, new URLSearchParams({ topic: "movement" }));
    expect(html).toContain(`阅读本组 ${linkedPapers.length} 篇论文`);
  });

  it("keeps legacy engineering deep links and gives a route back to the community report", () => {
    const html = render("view=compare&part=kv-pr-66558");
    expect(html.match(/class="kv-method-card"/g)).toHaveLength(4);
    expect(html).toContain('id="kv-pr-66558" tabindex="-1"');
    expect(html).toContain('href="/topics/kv-cache?view=report"');
    expect(html).toContain("TTFT p99 97.6→114.6秒");
    expect(render("view=papers&q=KIVI")).toContain("查看主主题的方法比较");
  });
});
