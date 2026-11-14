import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import ChapterSummary from "./ChapterSummary";
import CompleteInferenceFlow from "./CompleteInferenceFlow";
import InferenceMap, { type IndexedPR } from "./InferenceMap";
import { selectChapterSummaries, type IndexedChapter } from "./chapter-summaries";

const vllm = "github:vllm-project/vllm";
const ascend = "github:vllm-project/vllm-ascend";
const version = "a".repeat(64);
const oldVersion = "b".repeat(64);
function chapter(day: string, sources = [vllm]): IndexedChapter {
  return { day, version, stage: "decode", title: "七 Decode 常规生成", chapter_summary: "  本章关注 KV cache 重复读取的开销，结论仅限原文配置。  ",
    sources, workIds: sources.filter((s) => s !== "unknown").map((s, i) => `${s}#${i + 1}`) };
}
function entries(chapters: IndexedChapter[]): IndexedPR[] {
  return chapters.flatMap((c) => c.workIds.map((workId, i) => ({ day: c.day, version: c.version, stage: c.stage,
    number: `V${i + 1}`, workId, title: "固定样例条目" })));
}
const first = chapter("2026-11-09");
const second = chapter("2026-11-10", [vllm, ascend]);
const rows = [first, second];
const current = Object.fromEntries(rows.map((c) => [c.day, c.version]));
const days = Object.keys(current);
const pick = (source = "", data: unknown = rows, observations = entries(rows), scopedDays = days, versions = current) =>
  selectChapterSummaries(data, observations, versions, scopedDays, source);

describe("dated chapter quotations", () => {
  it("uses the most recent applicable original in range, without merging days", () => {
    expect(pick().decode).toEqual(second);
    expect(pick("", rows, entries(rows), [first.day]).decode).toEqual(first);
    expect(pick("", rows, entries(rows), []).decode).toBeUndefined();
    expect(pick().decode?.chapter_summary).toBe(second.chapter_summary);
  });
  it("never treats a whole mixed-source chapter as a single-community summary", () => {
    expect(pick(vllm).decode).toEqual(first);
    expect(pick(ascend).decode).toBeUndefined();
    const unknown = chapter(first.day, [vllm, "unknown"]);
    expect(pick(vllm, [unknown], entries([unknown])).decode).toBeUndefined();
    expect(pick("", [unknown], entries([unknown])).decode).toEqual(unknown);
  });
  it("rejects stale versions, wrong chapter evidence and tampered source scopes", () => {
    expect(pick("", [{ ...first, version: oldVersion }]).decode).toBeUndefined();
    expect(pick("", [{ ...first, stage: "prefill" }]).prefill).toBeUndefined();
    expect(pick("", [{ ...second, sources: [vllm] }]).decode).toBeUndefined();
    expect(pick("", [{ ...first, workIds: [`${vllm}#999`] }]).decode).toBeUndefined();
    expect(pick("", [first], entries([first]), days, { [first.day]: oldVersion }).decode).toBeUndefined();
  });
  it("keeps legacy, empty, missing and invalid summaries absent", () => {
    for (const data of [undefined, null, {}, [], [{ ...first, chapter_summary: "" }], [{ ...first, chapter_summary: " \n" }],
      [{ ...first, chapter_summary: "字".repeat(181) }], [{ ...first, chapter_summary: 42 }], [{ ...first, chapter_summary: null }], [{ ...first, workIds: [] }]]) {
      expect(selectChapterSummaries(data, entries(rows), current, days, "")).toEqual({});
    }
    expect(pick("", rows, [])).toEqual({});
    const { chapter_summary: _, ...legacy } = first;
    expect(pick("", [{ ...legacy, intro: "不能使用导语冒充总结。" }])).toEqual({});
  });
});

describe("read-only chapter summary presentation", () => {
  function render(element: Parameters<typeof renderToStaticMarkup>[0]) {
    return renderToStaticMarkup(createElement(MemoryRouter, {}, element));
  }
  it("shows unchanged text, date, version, source scope and an exact chapter link", () => {
    const summary = { ...second, chapter_summary: "  原句：a < b & 不改写。  " };
    const html = render(createElement(ChapterSummary, { summary }));
    expect(html).toContain("  原句：a &lt; b &amp; 不改写。  ");
    expect(html).toContain(second.day);
    expect(html).toContain(version.slice(0, 8));
    expect(html).toContain("本章来源：vLLM / vLLM Ascend");
    expect(html).toContain("仅对应此日报整章");
    expect(html).toContain(`/reports/${second.day}?version=${version}&amp;section=decode`);
    expect(render(createElement(ChapterSummary))).toContain("未提供适用的问题总结");
  });
  it("keeps navigation compact and shows the quotation once in the selected stage", () => {
    const summaries = { decode: first };
    const complete = render(createElement(CompleteInferenceFlow, { entries: entries([first]), selection: "decode", onSelect: () => {} }));
    expect(complete).not.toContain(first.chapter_summary);
    expect(complete).not.toContain("chapter-summary");
    const map = render(createElement(InferenceMap, { entries: entries([first]), summaries, selection: "decode", select: () => {}, scope: "test" }));
    expect(map.match(/class="chapter-summary"/g)).toHaveLength(1);
    expect(map).not.toContain("chapter-summary-compact");
    expect(map).toContain("问题总结");
    expect(map).toContain("流程示意");
    expect(map).toContain("查看 1 条实际 PR");
    expect(map).toContain(first.chapter_summary);
    const empty = render(createElement(InferenceMap, { entries: [], selection: "decode", select: () => {}, scope: "empty" }));
    expect(empty).toContain("未提供适用的问题总结");
    expect(empty).not.toContain(first.chapter_summary);
  });
});
