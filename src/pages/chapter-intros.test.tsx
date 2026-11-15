import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import ChapterIntro from "./ChapterIntro";
import CompleteInferenceFlow from "./CompleteInferenceFlow";
import InferenceMap, { type IndexedPR } from "./InferenceMap";
import { selectChapterIntros, type IndexedChapter } from "./chapter-intros";

const vllm = "github:vllm-project/vllm";
const ascend = "github:vllm-project/vllm-ascend";
const version = "a".repeat(64);
const oldVersion = "b".repeat(64);
function chapter(day: string, sources = [vllm]): IndexedChapter {
  return { day, version, stage: "decode", title: "七 Decode 常规生成", intro: "  本章关注 KV cache 重复读取的开销，结论仅限原文配置。  ",
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
  selectChapterIntros(data, observations, versions, scopedDays, source);

describe("dated chapter quotations", () => {
  it("uses the most recent applicable original in range, without merging days", () => {
    expect(pick().decode).toEqual(second);
    expect(pick("", rows, entries(rows), [first.day]).decode).toEqual(first);
    expect(pick("", rows, entries(rows), []).decode).toBeUndefined();
    expect(pick().decode?.intro).toBe(second.intro);
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
  it("keeps empty, missing and invalid intros absent", () => {
    for (const data of [undefined, null, {}, [], [{ ...first, intro: "" }], [{ ...first, intro: " \n" }],
      [{ ...first, intro: 42 }], [{ ...first, intro: null }], [{ ...first, workIds: [] }]]) {
      expect(selectChapterIntros(data, entries(rows), current, days, "")).toEqual({});
    }
    expect(pick("", rows, [])).toEqual({});
    const { intro: _, ...withoutIntro } = first;
    expect(pick("", [{ ...withoutIntro, summary: "其他正文不能替代导语。" }])).toEqual({});
  });
});

describe("read-only chapter summary presentation", () => {
  function render(element: Parameters<typeof renderToStaticMarkup>[0]) {
    return renderToStaticMarkup(createElement(MemoryRouter, {}, element));
  }
  it("uses the unchanged summary as the exact chapter link without metadata rows", () => {
    const summary = { ...second, intro: "  原句：a < b & 不改写。  " };
    const html = render(createElement(ChapterIntro, { chapter: summary }));
    expect(html).toContain("  原句：a &lt; b &amp; 不改写。  ");
    expect(html.replace(/<[^>]*>/g, "")).toBe("当日聚焦：  原句：a &lt; b &amp; 不改写。  ");
    expect(html).toContain('class="chapter-intro-text"');
    expect(html).not.toContain("chapter-intro-meta");
    expect(html).not.toContain("本章来源");
    expect(html).not.toContain("查看章原文");
    expect(html).toContain(`/reports/${second.day}?version=${version}&amp;section=decode`);
    expect(render(createElement(ChapterIntro))).toContain("未提供适用的问题总结");
  });
  it("keeps navigation compact and shows the quotation once in the selected stage", () => {
    const intros = { decode: first };
    const complete = render(createElement(CompleteInferenceFlow, { entries: entries([first]), selection: "decode", onSelect: () => {} }));
    expect(complete).not.toContain(first.intro);
    expect(complete).not.toContain("chapter-intro");
    const map = render(createElement(InferenceMap, { entries: entries([first]), intros, selection: "decode", select: () => {}, scope: "test" }));
    expect(map.match(/class="chapter-intro"/g)).toHaveLength(1);
    expect(map).not.toContain("chapter-intro-compact");
    expect(map).toContain("流程示意");
    expect(map).toContain("查看 1 条实际 PR");
    expect(map).toContain(first.intro);
    const empty = render(createElement(InferenceMap, { entries: [], selection: "decode", select: () => {}, scope: "empty" }));
    expect(empty).toContain("未提供适用的问题总结");
    expect(empty).not.toContain(first.intro);
  });
});
