import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import KvPapers from "./KvPapers";
import KvResearchOverview from "./KvResearchOverview";
import { filterPapers, kvResearch } from "./kv-research";
import { kvSynthesis } from "./kv-synthesis";

const all = filterPapers(kvResearch.entries, new URLSearchParams());
function visible(html: string) {
  // Critical conditions must survive when every optional detail disclosure is closed.
  return html.replace(/<details\b[^>]*>[\s\S]*?<\/details>/g, "");
}
function renderPapers(query: string) {
  return renderToStaticMarkup(<MemoryRouter initialEntries={[`/topics/kv-cache?view=papers&${query}`]}><KvPapers /></MemoryRouter>);
}
function renderComparison(topic: string) {
  return renderToStaticMarkup(<MemoryRouter initialEntries={[`/topics/kv-cache?view=survey&topic=${topic}`]}><KvResearchOverview /></MemoryRouter>);
}

describe("decision-critical KV paper evidence", () => {
  it("preserves provenance and quantitative limits even when optional paper details are closed", () => {
    const kivi = visible(renderPapers("q=KIVI"));
    for (const text of ["2.35–3.47", "A100 80GB", "Llama-2-7B", "161 / 338", "残留长度 32 / 128", "直到 OOM", "固定批次", "图 5", "作者实验报告"]) {
      expect(kivi).toContain(text);
    }
    const h2o = visible(renderPapers("q=H2O"));
    for (const text of ["48.00%", "84.00%", "85.00%", "OPT-30B", "5-shot", "不是整卡显存", "表 2", "没有置信区间"]) expect(h2o).toContain(text);
    const paged = visible(renderPapers("q=PagedAttention"));
    for (const text of ["1.7–2.7", "作者重实现", "预知输出长度", "不能全归因于分页", "图 12"]) expect(paged).toContain(text);
  });

  it("shows all six input/state/output explanations and reading tasks without changing paper identities", () => {
    for (const entry of all.filter(({ paper }) => paper.evidenceReview)) {
      const html = visible(renderPapers(`q=${entry.paper.slug === "h2o" ? "H2O" : entry.paper.shortName.split(" / ")[0]}`));
      expect(html).toContain(`id="kv-paper-${entry.paper.slug}"`);
      expect(html).toContain("<dt>输入</dt>");
      expect(html).toContain("<dt>状态改变</dt>");
      expect(html).toContain("<dt>输出与去向</dt>");
      expect(html).toContain(entry.sourceVersion);
    }
    const guide = visible(renderPapers(""));
    for (const entry of all.filter(({ paper }) => paper.recommendedReason)) {
      expect(guide).toContain(entry.paper.readingTask!.goal);
    }
  });

  it("keeps selection constraints visible for every group and never treats separate experiments as a common ranking", () => {
    for (const group of kvSynthesis.groups) {
      const html = visible(renderComparison(group.id));
      expect(html).toContain(group.commonSetup);
      expect(html).toContain(group.notComparable);
      expect(html.match(/data-comparison-paper=/g)).toHaveLength(3);
      for (const row of group.rows) {
        expect(html).toContain(row.useWhen);
        expect(html).toContain(row.notWhen);
      }
    }
    const caseHtml = visible(renderComparison("representation"));
    expect(caseHtml).toContain("共同对照示例");
    expect(caseHtml).toContain("容许退化阈值");
    expect(caseHtml).toContain("同一次配置联合测质量");
    expect(caseHtml).toContain("独立收益不能相乘");
    expect(caseHtml.match(/data-quality-evidence=/g)).toHaveLength(3);
  });
});
