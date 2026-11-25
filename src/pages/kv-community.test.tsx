import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import TopicPages from "./TopicPages";
import { estimateKVBytes } from "./kv-basics";
import { checksWithNewVersion, communityDate, communityEntries, evidenceCheckFor, filterCommunity, kvCommunity, prState, snapshotFor, versionChanges, stateChanges } from "./kv-community";
import { kvResearch, paperViewQuery } from "./kv-research";
import { kvStudy } from "./KvCacheStudy";

function render(search = "") {
  return renderToStaticMarkup(<MemoryRouter initialEntries={["/topics/kv-cache?" + search]}>
    <Routes><Route path="/topics/:topicId?" element={<TopicPages error="daily unavailable" />} /></Routes>
  </MemoryRouter>);
}

describe("KV topic reading paths", () => {
  it("groups old and new routes under the correct primary sections", () => {
    for (const [search, active] of [
      ["", "导引"], ["view=papers", "论文"], ["view=survey&topic=representation", "论文"],
      ["view=overview", "综合分析"], ["view=report", "社区进展"], ["view=evidence&topic=movement", "社区进展"],
      ["view=compare&part=kv-pr-66558", "社区进展"], ["view=report&edition=2026-11-17", "社区进展"],
    ]) {
      const html = render(search);
      const nav = html.match(/<nav class="kv-topic-nav kv-primary-nav".*?<\/nav>/)![0];
      expect(nav.match(/<a /g)).toHaveLength(4);
      expect(nav.match(/<a[^>]*aria-current="page"[^>]*>.*?<\/a>/)?.[0]).toContain("<strong>" + active + "</strong>");
      expect(html).not.toContain("daily unavailable");
      expect(html).not.toContain(">研究综述<");
    }
    expect(render("view=survey")).toContain('aria-label="论文板块页面"');
    expect(render("view=compare")).toContain('aria-label="社区进展 板块页面"');
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
    expect(html).toContain("原机制核对 2026-11-17");
    expect(html).toContain("专项来源补核 2026-11-24");
    expect(html).toContain("代码版本已变更");
    expect(html).toContain("view=report&amp;edition=2026-11-23&amp;part=kv-update-nixl-lifetime");
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
      expect(render("view=report&edition=2026-11-23")).toContain('id="kv-update-' + story.slug + '"');
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


  it("keeps capped query and selection limits visible without expanding archived counts", () => {
    const html = render("view=report&edition=2026-11-23");
    // These limits must be outside collapsed source details.
    const visibleScope = html.match(/<section class="kv-scope-summary".*?<\/section>/)![0];
    expect(visibleScope).toContain("vllm-project/vllm-ascend");
    expect(visibleScope).toContain("created:2026-11-17..2026-11-23");
    expect(visibleScope).toContain("各查询跨这两个仓库合计最多 60 条");
    expect(visibleScope).toContain("达到上限并截断");
    expect(visibleScope).toContain("4 条新纳入不等于社区净新增");
    expect(visibleScope).toContain("55 条代码重审");
    expect(kvCommunity.search.queries.map(item => item.returned)).toEqual([60, 31]);
    expect(kvCommunity.search.queries.reduce((sum, item) => sum + item.returned, 0)).toBe(kvCommunity.search.returned);
    expect(kvCommunity.edition).toBe("2026-11-23");
  });

  it("separates targeted rechecks from the November 23 snapshots and old experiments", () => {
    expect(checksWithNewVersion.map(item => item.number).sort()).toEqual([22312, 66361, 69271]);
    expect(snapshotFor("github:vllm-project/vllm#66361")?.headSha).toBe("376cd0583f5b4f6a74769afb1c8cca0a12da8854");
    expect(evidenceCheckFor("github:vllm-project/vllm#66361")?.headSha).toBe("03e8785ac5c3013baca4990e8948422dd3ebe630");
    expect(kvStudy.methods.find(method => method.number === 66361)?.headSha).toBe("376cd0583f5b4f6a74769afb1c8cca0a12da8854");
    const html = render("view=report&edition=2026-11-23");
    expect(html).toContain("旧 CPU 测试及模拟结果仍归原记录");
    expect(html).toContain("241.62 降到 62.18 GiB");
    expect(html).toContain("W4A8 表不能替换或背书它");
    expect(html).toContain("不是实传流量或缓存容量下降");
    expect(html).toContain("等待点不直接等待该次 gather 之后的 3FS 写入和元数据确认");
    expect(html).toContain("588 项测试结果早于");
    expect(html).toContain("不支持 DCP/PCP");
    expect(render("view=evidence&q=22312")).toContain("6d76731");
    expect(versionChanges).toHaveLength(6);
  });

  it("preserves Shanghai creation dates and calls the chart a selected-sample distribution", () => {
    for (const entry of kvResearch.entries.filter(item => item.kind === "pr")) {
      expect(entry.sourceDay).toBe(communityDate(entry.createdAt!));
    }
    for (const entry of kvCommunity.newEntries) expect(entry.sourceDay).toBe(communityDate(entry.createdAt!));
    const html = render("view=evidence&review=edition");
    expect(html).toContain("已收录 PR 的创建时间分布");
    expect(html).toContain("Asia/Shanghai（上海时区）");
    expect(html).toContain("不代表全社区趋势或本期净新增");
    expect(html).toContain("一个 PR 不等于一个方法");
  });

  it("shows waiting dimensions and result conditions before any collapsed source details", () => {
    const html = render("view=compare&part=kv-wait-diagnosis");
    for (const stage of kvStudy.waitingDiagnosis.stages) {
      expect(html).toContain('data-wait-stage="' + stage.id + '"');
      expect(html).toContain(stage.title);
    }
    expect(html).toContain("可交叠、可回退");
    expect(html).toContain("不预设加载排序是瓶颈");
    expect(html).toContain("理想信息排序只作参考，不称性能上界");
    expect(html).toContain("未做同条件受控比较或联合验证");
    for (const method of kvStudy.methods) {
      const card = html.split('id="kv-pr-' + method.number + '"')[1].split('<details')[0];
      expect(card).toContain(method.environment);
      expect(card).toContain(method.result);
      expect(card).toContain(method.audit.experimentVersion);
      expect(card).toContain("本站未复现");
      for (const source of method.audit.sourceLinks) expect(source.url).toMatch(/^https:\/\/github\.com\//);
    }
    expect(html).toContain("遇前序 None 即返回未知");
    expect(html).toContain("未计主机时间");
    expect(kvStudy.revision).toBe(2);
    expect(kvStudy.asOf).toBe("2026-11-17");
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
