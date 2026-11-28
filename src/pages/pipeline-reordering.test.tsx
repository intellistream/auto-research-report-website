import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import TopicPages from "./TopicPages";
import PipelineReorderingTopic from "./PipelineReorderingTopic";
import {
  PIPELINE_PATH, PIPELINE_PROBLEMS, buildPipelineSchedule, pipelineStats, resolvePipelineSearch,
} from "./pipeline-reordering";
import { validateAclGraphProblems } from "./aclgraph-analysis";
import { computeCommandSearchResults } from "../shell/CommandSearchModal";

const render = (path: string) => renderToStaticMarkup(<MemoryRouter initialEntries={[path]}><PipelineReorderingTopic /></MemoryRouter>);

describe("pipeline schedule teaching model", () => {
  it.each([
    [4, 3, 0, 14, 11],
    [3, 6, 0, 18, 15],
    [4, 3, 5, 14, 16],
  ])("accounts for completion time and overlap slowdown (%s,%s,%s)", (c, m, penalty, serialTotal, overlapTotal) => {
    expect(buildPipelineSchedule(c, m, false).total).toBe(serialTotal);
    expect(buildPipelineSchedule(c, m, true, penalty).total).toBe(overlapTotal);
  });

  it("preserves each batch dependency and serializes each resource across the slider range", () => {
    for (const compute of [3, 4]) for (let comm = 1; comm <= 8; comm++) for (const overlap of [false, true]) for (const penalty of [0, 5]) {
      const { tasks, total } = buildPipelineSchedule(compute, comm, overlap, penalty);
      const [a, ca, b, cb] = tasks;
      expect(ca.start).toBeGreaterThanOrEqual(a.end);
      expect(cb.start).toBeGreaterThanOrEqual(b.end);
      expect(b.start).toBeGreaterThanOrEqual(a.end);
      expect(cb.start).toBeGreaterThanOrEqual(ca.end);
      expect(total).toBe(Math.max(...tasks.map(t => t.end)));
      expect(tasks.every(t => t.end > t.start)).toBe(true);
      expect(ca.end - ca.start).toBe(comm);
      expect(cb.end - cb.start).toBe(comm);
    }
  });

  it.each([[0, 2, 0], [2, -1, 0], [2, 3, -1], [Infinity, 3, 0]])("rejects invalid durations", (compute, comm, penalty) => {
    expect(() => buildPipelineSchedule(compute, comm, true, penalty)).toThrow(RangeError);
  });
});

describe("pipeline evidence and navigation", () => {
  it("keeps complete evidence with unique identities and accurate directory counts", () => {
    expect(validateAclGraphProblems(PIPELINE_PROBLEMS)).toEqual([]);
    expect(pipelineStats).toEqual({ problems: 4, papers: 4, fulltextPapers: 4, prs: 8, ascendPrs: 4, upstreamPrs: 4, totalCards: 12 });
    expect(PIPELINE_PROBLEMS.every(p => p.gap.researchOpportunity.startsWith("待验证设想："))).toBe(true);
  });

  it("opens a card in its actual problem and drops unrelated or invalid query values", () => {
    const resolved = resolvePipelineSearch(new URLSearchParams("problem=distributed&card=pr-vllm-64145&debug=1&utm_source=review"));
    expect(resolved.section).toBe("analysis");
    expect(resolved.params.get("problem")).toBe("host-device");
    expect(resolved.params.get("card")).toBe("pr-vllm-64145");
    expect(resolved.params.get("debug")).toBeNull();
    expect(resolved.params.get("utm_source")).toBe("review");
    expect(resolvePipelineSearch(new URLSearchParams("view=unknown&problem=unknown&card=unknown")).params.toString()).toBe("");
  });

  it("serves the static topic even when the generated topic index is unavailable", () => {
    const html = renderToStaticMarkup(<MemoryRouter initialEntries={[PIPELINE_PATH]}><Routes><Route path="/topics/:topicId" element={<TopicPages error="index unavailable" />} /></Routes></MemoryRouter>);
    expect(html).toContain("流水线重排专题分区");
    expect(html).toContain("教学模型");
    expect(html).not.toContain("暂无可用的专题索引");
  });

  it("uses the shared analysis and modal on this topic's deep links", () => {
    const html = render(PIPELINE_PATH + "?view=analysis&card=pr-vllm-64145&problem=host-device");
    expect(html).toContain('data-testid="pipeline-reordering-analysis"');
    expect(html).toContain('role="dialog"');
    expect(html).toContain("async-scheduling-depth");
    expect(html).toContain("https://github.com/vllm-project/vllm/pull/64145");
    expect(html).not.toContain("剥离伪 Gap");
    expect(html).not.toContain("稍后将展示 6 大核心问题");
  });

  it("finds the new topic through global search when an existing catalog is loaded", () => {
    const matches = computeCommandSearchResults({
      query: "DBO", category: "topic", topics: [{ id: "aclgraph", title: "ACL Graph", description: "" }],
      days: [], deduplicatedPRs: [], mods: [], aclProblems: [],
    });
    expect(matches.some(m => m.to === PIPELINE_PATH)).toBe(true);
  });
});
