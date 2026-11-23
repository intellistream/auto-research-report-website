import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import TopicPages from "./TopicPages";
import { estimateKVBytes } from "./kv-basics";
import { communityEntries, filterCommunity, kvCommunity, prState, snapshotFor, versionChanges, stateChanges } from "./kv-community";
import { kvResearch, paperViewQuery } from "./kv-research";

function render(search = "") {
  return renderToStaticMarkup(<MemoryRouter initialEntries={["/topics/kv-cache?" + search]}>
    <Routes><Route path="/topics/:topicId?" element={<TopicPages error="daily unavailable" />} /></Routes>
  </MemoryRouter>);
}

describe("KV three-section reading paths", () => {
  it("groups old and new routes under three purposeful primary sections", () => {
    for (const [search, active] of [
      ["", "KV 入门"], ["view=papers", "论文"], ["view=survey&topic=representation", "论文"],
      ["view=report", "社区 PR"], ["view=evidence&topic=movement", "社区 PR"],
      ["view=compare&part=kv-pr-66558", "社区 PR"], ["view=report&edition=2026-11-17", "社区 PR"],
    ]) {
      const html = render(search);
      const nav = html.match(/<nav class="kv-topic-nav kv-primary-nav".*?<\/nav>/)![0];
      expect(nav.match(/<a /g)).toHaveLength(3);
      expect(nav.match(/<a[^>]*aria-current="page"[^>]*>.*?<\/a>/)?.[0]).toContain("<strong>" + active + "</strong>");
      expect(html).not.toContain("daily unavailable");
      expect(html).not.toContain(">研究综述<");
    }
    expect(render("view=survey")).toContain('aria-label="论文板块页面"');
    expect(render("view=compare")).toContain('aria-label="社区 PR 板块页面"');
  });

  it("keeps paper deep links independent of old PR-only filters", () => {
    const html = render("view=evidence&kind=paper&repo=vllm&state=merged&review=changed&part=kv-paper-kivi");
    expect(html).toContain('id="kv-paper-kivi"');
    expect(html.match(/class="kv-reading-card"/g)).toHaveLength(24);
    expect(html).not.toContain('class="kv-material-card"');
    const scope = paperViewQuery(new URLSearchParams("view=report&state=draft&review=changed&edition=2026-11-17&q=KIVI"));
    expect(scope.get("q")).toBe("KIVI");
    for (const key of ["state", "review", "edition"]) expect(scope.has(key)).toBe(false);
  });

  it("uses current PR states while retaining the original mechanism snapshot", () => {
    const id = "github:vllm-project/vllm#66795";
    expect(kvResearch.entries.find(entry => entry.id === id)?.merged).toBe(false);
    expect(snapshotFor(id)?.merged).toBe(true);
    expect(filterCommunity(new URLSearchParams("state=merged&q=66795")).map(entry=>entry.id)).toEqual([id]);
    expect(filterCommunity(new URLSearchParams("state=open&q=66795"))).toEqual([]);
    const html = render("view=evidence&q=66795");
    expect(html).toContain("状态核对 2026-11-23");
    expect(html).toContain("机制简介核对 2026-11-17");
    expect(html).toContain("代码版本已变更");
    expect(html).toContain("view=report&amp;part=kv-update-nixl-lifetime");
  });

  it("distinguishes version changes, reviewed stories, new entries and unreviewed search hits", () => {
    expect(communityEntries).toHaveLength(59);
    expect(versionChanges).toHaveLength(6);
    expect(stateChanges).toHaveLength(2);
    expect(kvCommunity.newEntries).toHaveLength(4);
    expect(filterCommunity(new URLSearchParams("review=changed"))).toHaveLength(6);
    expect(filterCommunity(new URLSearchParams("review=edition"))).toHaveLength(5);
    expect(filterCommunity(new URLSearchParams("repo=vllm-ascend&q=２２３１２"))).toHaveLength(1);
    expect(kvCommunity.search.candidates).toHaveLength(88);
    const included = new Set(communityEntries.map(entry=>entry.url));
    expect(kvCommunity.search.candidates.filter(item=>included.has(item.url))).toHaveLength(4);
    for (const candidate of kvCommunity.search.candidates.filter(item=>!included.has(item.url))) {
      expect(communityEntries.some(entry=>entry.url===candidate.url)).toBe(false);
    }
  });

  it("resolves every report source, paper cross-link and baseline version without changing old classifications", () => {
    expect(new Set(communityEntries.map(entry=>entry.id)).size).toBe(59);
    expect(new Set(kvCommunity.snapshots.map(item=>item.id)).size).toBe(59);
    for (const snapshot of kvCommunity.snapshots) {
      expect(communityEntries.some(entry=>entry.id===snapshot.id)).toBe(true);
      expect(snapshot.headSha).toMatch(/^[a-f0-9]{40}$/);
      expect(snapshot.url).toMatch(/^https:\/\/github\.com\/vllm-project\/vllm(-ascend)?\/pull\/\d+$/);
      if (snapshot.baseline) {
        const original=kvResearch.entries.find(entry=>entry.id===snapshot.id)!;
        expect(snapshot.baseline.headSha).toBe(original.headSha);
        expect(prState(snapshot.baseline)).toBe(prState(original));
      }
    }
    for (const story of kvCommunity.stories) {
      expect(snapshotFor(story.id)).toBeDefined();
      for (const slug of story.paperSlugs) expect(kvResearch.entries.some(entry=>entry.paper?.slug===slug)).toBe(true);
      expect(render("view=report")).toContain('id="kv-update-' + story.slug + '"');
    }
    expect(kvResearch.entries.filter(entry=>entry.kind==="paper")).toHaveLength(24);
    expect(JSON.stringify(kvCommunity)).not.toMatch(/WPSDrive|来源文件|\.docx|[A-Z]:\\/);
  });

  it("preserves the archived analysis and renders an explicit fallback for unknown editions", () => {
    expect(render("view=report&edition=2026-11-17")).toContain("返回本期动态报告");
    expect(render("view=report&edition=unknown")).toContain("未找到该期报告");
    expect(render("view=compare&part=kv-pr-66558")).toContain('id="kv-pr-66558" tabindex="-1"');
    expect(render("view=compare")).toContain("TTFT p99 97.6→114.6秒");
  });

  it("computes KV storage in bytes with both K and V and linear length/concurrency scaling", () => {
    expect(estimateKVBytes(8192,4)).toBe(4 * 2**30);
    expect(estimateKVBytes(16384,4)).toBe(8 * 2**30);
    expect(estimateKVBytes(8192,8)).toBe(8 * 2**30);
    expect(estimateKVBytes(8192,4,32,1)).toBe(0.5 * 2**30);
    const html=render();
    expect(html).toContain("理论存储示意");
    expect(html).toContain("不直接适用于 MLA");
  });
});
