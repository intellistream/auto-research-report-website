import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import TopicPages from "./TopicPages";
import { communityEntries, kvCommunity, type PRSnapshot } from "./kv-community";
import { paperViewQuery } from "./kv-research";
import { calendarDay, kvWeekly, latestWeeklyReport, materialPart, materialSearch, reportSourceIds,
  resolveWeeklyReport, shanghaiDay, weeklyEventCounts, weeklyEvents, weeklyReports, weeklySearch,
  weeklySource, weekForDay, weekForInstant, weekRange, type WeeklyRevision } from "./kv-weekly";

function render(query: string) {
  return renderToStaticMarkup(<MemoryRouter initialEntries={["/topics/kv-cache?" + query]}>
    <Routes><Route path="/topics/:topicId?" element={<TopicPages error="daily unavailable"/>}/></Routes>
  </MemoryRouter>);
}
const snapshot = { ...kvCommunity.snapshots[0], id: "github:one/project#7",
  createdAt: "2026-11-22T16:00:00Z", mergedAt: "2026-11-23T01:00:00Z",
  updatedAt: "2026-11-24T01:00:00Z" } satisfies PRSnapshot;
const revision = { id: "change", workId: snapshot.id, kind: "mechanism", fromCheckedAt: "2026-11-23",
  toCheckedAt: "2026-11-24", fromVersion: "old", toVersion: "new", description: "人工核对的机制差异",
  sourceIds: [] } satisfies WeeklyRevision;

describe("Shanghai calendar weeks and real PR events", () => {
  it("uses Monday midnight in Shanghai with an exclusive next-Monday boundary", () => {
    expect(weekForInstant("2026-11-22T15:59:59.999Z")).toBe("2026-11-16");
    expect(weekForInstant("2026-11-22T16:00:00Z")).toBe("2026-11-23");
    expect(weekForInstant("2026-11-29T15:59:59.999Z")).toBe("2026-11-23");
    expect(weekForInstant("2026-11-29T16:00:00Z")).toBe("2026-11-30");
    expect(weekForInstant("2026-11-23T00:00:00+08:00")).toBe("2026-11-23");
    expect(weekForInstant("2026-11-22T11:00:00-05:00")).toBe("2026-11-23");
    expect(shanghaiDay("2026-11-22T17:01:21Z")).toBe("2026-11-23");
    expect(weekForDay("2027-01-01")).toBe("2026-12-28");
    expect(weekRange("2026-12-28")).toEqual({ start: "2026-12-28", end: "2027-01-03" });
    expect(weekRange("2026-11-23")).toEqual({ start: "2026-11-23", end: "2026-11-29" });
  });
  it("rejects invalid dates and ambiguous event timestamps instead of using the machine time zone", () => {
    for (const value of ["2026-02-30", "2026-13-01", "2026-1-01", "unknown"]) expect(calendarDay(value)).toBeUndefined();
    for (const value of ["2026-11-23", "2026-11-23T00:00:00", "2026-02-30T00:00:00Z", "2026-11-23T24:00:00Z", "unknown"]) expect(weekForInstant(value)).toBeUndefined();
    expect(weekRange("2026-11-24")).toBeUndefined();
    expect(weeklyEvents("2026-11-24")).toEqual([]);
  });
  it("counts creation and merge separately, deduplicating full repository identity", () => {
    const another = { ...snapshot, id: "github:another/project#7" };
    const events = weeklyEvents("2026-11-23", [snapshot, snapshot, another], []);
    expect(events).toHaveLength(4);
    expect(weeklyEventCounts(events)).toEqual({ created: 2, merged: 2, revised: 0 });
    expect(new Set(events.map(event => event.id)).size).toBe(4);
    expect(materialPart(snapshot.id)).not.toBe(materialPart(another.id));
    expect(new URLSearchParams(materialSearch(another.id)).get("q")).toBe(another.id);
  });
  it("does not infer substantive revisions from updatedAt, head changes or testing-only changes", () => {
    expect(weeklyEvents("2026-11-23", [{ ...snapshot, createdAt:"2026-11-01T00:00:00Z", mergedAt:null }], [])).toEqual([]);
    const revisions: WeeklyRevision[] = [revision, revision, { ...revision, id:"test", kind:"test-only" },
      { ...revision, id:"unknown", kind:"unclassified" }, { ...revision, id:"cross-week", fromCheckedAt:"2026-11-22" },
      { ...revision, id:"same-version", toVersion:"old" }];
    const events = weeklyEvents("2026-11-23", [], revisions);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind:"revised", interval:"2026-11-23 至 2026-11-24" });
    expect(events[0].day).toBeUndefined();
  });
  it("places the actual HF3FS PR in the new week and leaves incomplete coverage explicit", () => {
    expect(weeklyEventCounts(weeklyEvents("2026-11-16"))).toEqual({ created:3, merged:3, revised:0 });
    expect(weeklyEventCounts(weeklyEvents("2026-11-23"))).toEqual({ created:1, merged:0, revised:1 });
    expect(weeklyEvents("2026-11-23").filter(event => event.kind === "created").map(event => event.workId))
      .toEqual(["github:vllm-project/vllm#69271"]);
    expect(weeklyEvents("2026-11-16").some(event => event.workId.endsWith("#69271"))).toBe(false);
    expect(weeklyReports[0].status).toBe("retrospective");
    expect(latestWeeklyReport.status).toBe("partial");
    expect(render("view=report")).toContain("不能据此认定全社区无进展");
  });
});

describe("weekly navigation, legacy links and research decisions", () => {
  it("defaults to the latest existing report and shows explicit invalid-week/edition fallbacks", () => {
    expect(resolveWeeklyReport(new URLSearchParams())).toEqual({ kind:"weekly", report:latestWeeklyReport });
    for (const query of ["week=2026-11-24", "week=2030-01-07", "edition=unknown"]) {
      const selected = resolveWeeklyReport(new URLSearchParams(query));
      expect(selected.kind).toBe("weekly");
      expect("notice" in selected && selected.notice).toBeTruthy();
      expect(render("view=report&" + query)).toContain("当前展示最新已有周报");
    }
    expect(render("view=report")).toContain("选择周");
    expect(render("view=report")).toContain('week=2026-11-16');
    expect(render("view=report&week=2026-11-16")).toContain('week=2026-11-23');
  });
  it("keeps report/evidence/compare and old edition/part anchors usable", () => {
    for (const edition of ["2026-11-17", "2026-11-23"]) {
      expect(resolveWeeklyReport(new URLSearchParams({ edition }))).toEqual({kind:"archive", edition});
      expect(render("view=report&edition=" + edition)).toContain("原版报告");
    }
    expect(render("view=report&part=kv-update-peer-prefix")).toContain('id="kv-update-peer-prefix"');
    expect(render("view=compare&part=kv-pr-66558")).toContain('id="kv-pr-66558"');
    const id="github:vllm-project/vllm-ascend#22312";
    expect(render(materialSearch(id))).toContain('id="' + materialPart(id) + '" tabindex="-1"');
    expect(render("view=report&week=2026-11-23")).toContain("每周总结</a>");
    expect(render("view=evidence")).toContain("全部 PR</a>");
  });
  it("makes each week URL self-contained while retaining the four guide parameters", () => {
    const query=new URLSearchParams("view=evidence&edition=2026-11-17&part=old&q=prefix&repo=vllm&kv-model=qwen3-14b&kv-tokens=16384&kv-requests=7&kv-position=5");
    const next=new URLSearchParams(weeklySearch(query, "2026-11-16", "kv-rq-prefix-ready"));
    expect(next.get("week")).toBe("2026-11-16");
    expect(next.get("part")).toBe("kv-rq-prefix-ready");
    expect(next.get("kv-tokens")).toBe("16384");
    expect(next.get("kv-requests")).toBe("7");
    expect(next.get("kv-position")).toBe("5");
    for (const key of ["q","repo","edition"]) expect(next.has(key)).toBe(false);
    expect(paperViewQuery(next).has("week")).toBe(false);
  });
  it("puts research questions first and keeps the same section order in both weeks", () => {
    for (const report of weeklyReports) {
      const html=render("view=report&week=" + report.week);
      const headings=["kv-weekly-questions-title", "kv-weekly-progress-title", "kv-weekly-events-title", "kv-weekly-sources-title"];
      const positions=headings.map(id => html.indexOf('id="' + id + '"'));
      expect(positions.every(position=>position>=0)).toBe(true);
      expect(positions).toEqual([...positions].sort((a,b)=>a-b));
      expect(html.indexOf('class="kv-weekly-counts"')).toBeGreaterThan(positions[0]);
      for (const field of ["场景与瓶颈", "证据与已有工作", "剩余空间", "可检验假设", "怎样做最小验证", "潜在价值", "实现成本", "最大不确定性", "实验状态"]) expect(html).toContain(field);
    }
  });
  it("tracks a changed judgment under a stable question identity without inventing experiments", () => {
    const before=weeklyReports[0].questions[0], after=latestWeeklyReport.questions[0];
    expect(before.id).toBe(after.id);
    expect(before.title).not.toBe(after.title);
    expect(after.change).toContain("判断收缩");
    expect(after.uncertainty).toContain("不足以支持直接立项");
    expect(after.relatedWork.pending).toContain("未做系统综述");
    expect(after.experimentStatus).toContain("未运行");
    for (const report of weeklyReports) {
      const html=render("view=report&week="+report.week+"&part="+after.id);
      expect(html).toContain('id="'+after.id+'" tabindex="-1"');
      expect(html).toContain('aria-label="同一问题的跨周判断"');
      expect(html).toContain('week=2026-11-16&amp;part='+after.id);
      expect(html).toContain('week=2026-11-23&amp;part='+after.id);
    }
  });
  it("resolves versioned evidence, distinguishes proposals from PRs and preserves all 59 inventory records", () => {
    const ids=kvWeekly.sources.map(source=>source.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const report of weeklyReports) {
      expect(weekForDay(report.week)).toBe(report.week);
      for (const id of reportSourceIds(report)) {
        const source=weeklySource(id)!;
        expect(source).toBeDefined();
        expect(source.version).toBeTruthy();
        expect(source.scope).toBeTruthy();
        expect(source.url).toMatch(/^https:\/\//);
        if (source.kind==="pr") {
          expect(communityEntries.some(entry=>entry.id===source.workId)).toBe(true);
          expect(source.version).toMatch(/^[a-f0-9]{40}$/);
        }
      }
    }
    expect(weeklySource("proposal-53277")?.kind).toBe("proposal");
    expect(communityEntries.some(entry=>entry.id.endsWith("#53277"))).toBe(false);
    const html=render("view=evidence");
    expect(html.match(/class="kv-material-card"/g)).toHaveLength(59);
    expect(html).toContain("11/23 新纳入材料");
    expect(html).not.toContain('id="kv-rq-prefix-ready"');
    const weekly=render("view=report");
    expect(weekly).toMatch(/href="https:\/\/arxiv.org\/abs\/2407.00023v2" target="_blank" rel="noreferrer"/);
    expect(JSON.stringify(kvWeekly)).not.toMatch(/来源文件|[A-Z]:\\|WPSDrive/);
  });
});
