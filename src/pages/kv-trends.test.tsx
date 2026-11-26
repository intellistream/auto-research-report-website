import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import KvCacheTopic, { kvTopicView } from "./KvCacheTopic";
import { communityEntries, kvCommunity, type PRSnapshot } from "./kv-community";
import { kvResearch, type ResearchEntry } from "./kv-research";
import {
  buildTrendDays, buildTrendRows, inTrendWindow, trendDays,
  trendRows, trendStats, trendTopics,
} from "./kv-trends";

function render(search = "view=trends") {
  return renderToStaticMarkup(<MemoryRouter initialEntries={["/topics/kv-cache?" + search]}><KvCacheTopic /></MemoryRouter>);
}
const id = (number: number, repo = "vllm") => "github:vllm-project/" + repo + "#" + number;

describe("KV PR trends: evidence scope and navigation", () => {
  it("joins only included PRs once and preserves the five mutually exclusive primary categories", () => {
    expect(trendStats).toEqual({ total: 59, vllm: 43, ascend: 16, added: 4, created: 4, merged: 2, baseline: 55, changed: 6 });
    expect(trendTopics.map(topic => [topic.id, topic.count])).toEqual([
      ["movement", 19], ["lifecycle", 16], ["representation", 11], ["reuse", 7], ["scheduling", 6],
    ]);
    expect(trendTopics.reduce((sum, topic) => sum + topic.count, 0)).toBe(59);
    expect(trendTopics.reduce((sum, topic) => sum + topic.share, 0)).toBeCloseTo(100);
    const noisy = [...kvResearch.entries, ...kvCommunity.newEntries, communityEntries[0], communityEntries[0]];
    expect(buildTrendRows(noisy)).toHaveLength(59);
    for (const row of trendRows) {
      expect(row.snapshot).toBeDefined();
      expect(trendTopics.some(topic => topic.id === row.entry.primaryTopic)).toBe(true);
      expect(row.entry.url).toMatch(/^https:\/\/github\.com\/vllm-project\/vllm(-ascend)?\/pull\/\d+$/);
    }
  });

  it("filters primary categories rather than counting a cross-topic PR twice", () => {
    for (const topic of trendTopics) {
      const rows = trendRows.filter(row => row.entry.primaryTopic === topic.id);
      expect(rows).toHaveLength(topic.count);
      expect(rows.every(row => row.entry.primaryTopic === topic.id)).toBe(true);
    }
    const shared = communityEntries.find(row => row.topics.some(topic => topic !== row.primaryTopic))!;
    const secondary = shared.topics.find(topic => topic !== shared.primaryTopic)!;
    expect(trendRows.filter(row => row.entry.primaryTopic === secondary).some(row => row.entry.id === shared.id)).toBe(false);
  });

  it("counts mergedAt in Shanghai time, including the UTC November 16 boundary", () => {
    const merged = trendRows.filter(row => inTrendWindow(row.mergedDay));
    expect(merged.map(row => row.entry.id).sort()).toEqual([id(66583), id(66795)]);
    expect(merged.find(row => row.entry.id === id(66583))?.mergedDay).toBe("2026-11-17");
    expect(trendDays.map(day => [day.day, day.created, day.merged])).toEqual([
      ["2026-11-17", 0, 1], ["2026-11-18", 2, 0], ["2026-11-19", 0, 1], ["2026-11-20", 0, 0],
      ["2026-11-21", 1, 0], ["2026-11-22", 0, 0], ["2026-11-23", 1, 0],
    ]);

  });

  it("keeps updatedAt, targeted reviews, excluded records and papers out of event counts", () => {
    const base = kvCommunity.snapshots.find(row => row.id === communityEntries[0].id)!;
    const fake: PRSnapshot = { ...base, createdAt: "2026-11-16T15:59:59Z", mergedAt: null, merged: false,
      updatedAt: "2026-11-21T13:00:00Z" };
    const row = buildTrendRows([communityEntries[0]], [fake]);
    expect(buildTrendDays(row).reduce((sum, day) => sum + day.created + day.merged, 0)).toBe(0);
    const after = buildTrendRows([communityEntries[0]], [{ ...fake, createdAt: "2026-11-16T16:00:00Z" }]);
    expect(buildTrendDays(after)[0].created).toBe(1);
    const outside = buildTrendRows([communityEntries[0]], [{ ...fake, createdAt: "2026-11-23T16:00:00Z" }]);
    expect(buildTrendDays(outside).reduce((sum, day) => sum + day.created, 0)).toBe(0);
    expect(trendRows.filter(row => row.changed).some(row => row.entry.id === id(66361))).toBe(false);
    const excluded = { ...communityEntries[0], decision: "excluded" } as ResearchEntry;
    expect(buildTrendRows([excluded])).toEqual([]);
  });

  it("supports a dedicated community route and leaves weekly and historical routes available", () => {
    expect(kvTopicView(new URLSearchParams("view=trends"))).toBe("trends");
    const html = render();
    const primary = html.match(/<nav class="kv-topic-nav kv-primary-nav".*?<\/nav>/)![0];
    expect(primary.match(/<a /g)).toHaveLength(4);
    expect(primary.match(/<a[^>]*aria-current="page"[^>]*>.*?<\/a>/)?.[0]).toContain("<strong>社区进展</strong>");
    const secondary = html.match(/<nav class="kv-subnav" aria-label="社区进展 板块页面".*?<\/nav>/)![0];
    expect(secondary.match(/<a /g)).toHaveLength(3);
    expect(secondary.match(/<a[^>]*aria-current="page"[^>]*>.*?<\/a>/)?.[0]).toContain(">PR 趋势分析</a>");
    expect(secondary).toContain("view=report");
    expect(secondary).toContain("view=evidence");
    expect(kvTopicView(new URLSearchParams("view=report&edition=2026-11-17"))).toBe("report");
  });

  it("keeps the page focused on aggregate trends, without PR lists or filter controls", () => {
    const html = render("view=trends&topic=lifecycle&repo=vllm-ascend&activity=added&page=8");
    expect(html).toContain("五个工程方向分布");
    expect(html).toContain("观察窗口内的创建与合入");
    expect(html).toContain("head 变化只表示代码版本不同");
    expect(html).toContain("不代表全社区趋势");
    expect(html).toContain("达到上限并截断");
    expect(html).toContain('aria-label="2026-11-17：新建 0 条，合入 1 条"');
    expect(html).not.toContain("本期 PR 关注焦点");
    expect(html).not.toContain("相关 PR 与材料依据");
    expect(html).not.toContain("筛选下方 PR");
    expect(html).not.toContain('aria-controls="kv-trend-results"');
    expect(html).not.toContain("<select");
    expect(trendTopics.map(topic => [topic.id, topic.added])).toEqual([
      ["movement", 2], ["lifecycle", 2], ["representation", 0], ["reuse", 0], ["scheduling", 0],
    ]);
  });
});
