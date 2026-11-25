import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import actualIndex from "../../public/word-reports/topics.json";
import TopicPages, { type TopicIndex } from "./TopicPages";
import { weeklyEditions, latestEdition, filterWeeklyLibrary, weeklyView, priorMergeEvents, sourceStatus, outstandingWatchlist } from "./specdec-weekly";
const index=actualIndex as unknown as TopicIndex;
const spec=index.topics.find(t=>t.id==="speculative-decoding")!;
const render=(search: string)=>renderToStaticMarkup(<MemoryRouter initialEntries={["/topics/speculative-decoding?"+search]}><Routes><Route path="/topics/:topicId" element={<TopicPages index={index}/>}/></Routes></MemoryRouter>);
describe("SpecDec weekly community",()=>{
  it("freezes a complete, unique cohort with valid source references",()=>{
    expect(new Set(weeklyEditions.map(e=>e.id)).size).toBe(weeklyEditions.length);
    const historical=weeklyEditions.filter(e=>e.id<="2026-11-22");
    expect(historical.map(e=>[e.id,e.sources.length])).toEqual([["2026-11-22",18],["2026-11-15",38],["2026-11-08",25],["2026-11-01",58]]);
    const all=weeklyEditions.flatMap(e=>e.sources.map(s=>s.workId));
    expect(new Set(all).size).toBe(all.length);
    for(const e of weeklyEditions){
      const ids=new Set(e.sources.map(s=>s.workId));
      expect(ids.size).toBe(e.sources.length);
      const primary=[...e.stories.flatMap(s=>s.sourceIds),...e.otherIds];
      expect(new Set(primary)).toEqual(ids);
      expect(primary.length).toBe(ids.size);
      expect(e.otherGroups.flatMap(g=>g.sourceIds)).toEqual(e.otherIds);
      for(const track of e.tracking){const prior=weeklyEditions.find(p=>p.id===track.fromEdition)!;expect(prior.periodEnd<e.periodStart).toBe(true);expect(prior.stories.some(story=>story.slug===track.fromSlug)).toBe(true);expect(track.sourceIds.every(id=>ids.has(id))).toBe(true);}
      for(const event of priorMergeEvents(e)) expect(event.prior.periodEnd<e.periodStart&&event.source.merged).toBe(true);
      for(const s of e.sources){
        expect(s.day>=e.periodStart&&s.day<=e.periodEnd).toBe(true);
        expect(s.headSha).toMatch(/^[a-f0-9]{40}$/);
        expect(s.baseSha).toMatch(/^[a-f0-9]{40}$/);
        expect(s.headRepo).toMatch(/^[^/]+\/[^/]+$/);
        expect(!!s.mergedAt).toBe(s.merged);
        expect(s.version).toMatch(/^[a-f0-9]{64}$/);
        expect(s.url).toBe("https://github.com/"+s.workId.slice("github:".length).replace("#","/pull/"));
      }
      for(const story of e.stories){
        expect(story.keyEvidence.trim()).not.toBe("");
        for(const metric of story.metrics)expect(story.sourceIds).toContain(metric.sourceId);
        if(story.figure){expect(story.sourceIds).toContain(story.figure.sourceId);expect(story.figure.rows.every(r=>Number.isFinite(r.value)&&r.value>=0&&r.value<=story.figure!.scale)).toBe(true);}
      }
      for(const item of e.synthesis){expect(item.design.trim()).not.toBe("");expect(item.measure.trim()).not.toBe("");expect(item.decision.trim()).not.toBe("");}
      for(const item of e.synthesis)for(const id of item.sourceIds)expect(ids.has(id)).toBe(true);
    }
    const first=weeklyEditions.find(e=>e.id==="2026-11-22")!;
    expect(first.sources).toHaveLength(18);
    expect(first.sources.filter(s=>s.repository==="vllm-ascend")).toHaveLength(4);
  });
  it("defaults to the latest report and preserves archive, old deep links and independent library",()=>{
    const report=render("view=report");
    expect(report).toContain(latestEdition.title);
    expect(report).toContain("综合观察与后续方向");
    expect(report).toContain("对照设计");
    expect(report).toContain("判定条件");
    expect(report).toContain("实验条件与补充对照");
    const fourthReport=render("view=report&edition=2026-11-22");
    expect(fourthReport).toContain("同一 PR 内的局部与整步降幅");
    expect(fourthReport).toContain("0.057 ms");
    expect(report).not.toContain('id="survey-analysis"');
    const archive=render("view=report&tab=archive");
    expect(archive).toContain("初始动态研究报告");
    for(const e of weeklyEditions){expect(archive).toContain(e.title);const html=render("view=report&edition="+e.id);expect(html).toContain(e.title);expect(html).toContain("选择期次");}
    expect(render("view=report&edition=2026-11-01")).toContain("已关闭（未合并）");
    expect(render("view=report&edition=2026-11-08")).toContain("跨期进展");
    expect(outstandingWatchlist().every(item=>sourceStatus(item.source)!=="已合并")).toBe(true);
    expect(render("view=report&edition=2026-11-18")).toContain('id="survey-analysis"');
    expect(render("view=report&part=survey-section-0")).toContain('id="survey-section-0"');
    expect(render("view=report&edition=2099-01-01")).toContain("未找到该期周报");
    const lib=render("view=evidence&week=2026-11-22&q=22473");
    expect(lib).toContain("FA3 草稿组");
    expect(lib).not.toContain(latestEdition.title);
    expect(weeklyView(new URLSearchParams("view=evidence&part=survey-appendix"))).toBe("evidence");
  });
  it("filters keyword, edition and repository consistently with the trend",()=>{
    const q=new URLSearchParams("view=evidence&week=2026-11-22&repo=vllm-ascend");
    expect(filterWeeklyLibrary(spec,q)).toHaveLength(4);
    const changed={...spec,entries:spec.entries.map(row=>row.workId.endsWith("#22473")?{...row,title:"changed live title"}:row)};
    expect(filterWeeklyLibrary(changed,q).find(row=>row.workId.endsWith("#22473"))?.title).not.toBe("changed live title");
    q.set("q","22473");
    expect(filterWeeklyLibrary(spec,q).map(e=>e.workId)).toEqual(["github:vllm-project/vllm-ascend#22473"]);
    q.set("repo","vllm");
    expect(filterWeeklyLibrary(spec,q)).toHaveLength(0);
  });
});
