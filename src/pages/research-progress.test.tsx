import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ResearchProgress, ResearchReport } from "./ResearchQuery";
import type { ResearchJob } from "./research-api";

function render(job?: ResearchJob, interrupted = false) {
  return renderToStaticMarkup(<ResearchProgress job={job} interrupted={interrupted} />);
}

describe("research progress", () => {
  it("shows one current status while waiting and does not invent future steps", () => {
    expect(render()).toBe("");
    const submitting = renderToStaticMarkup(<ResearchProgress submitting />);
    expect(submitting).toContain("正在提交调研任务");
    expect(submitting).not.toContain("<ol");
    const queued = render({ id: "job", status: "queued" });
    expect(queued).toContain("任务已提交，正在排队");
    expect(queued).not.toContain("执行记录");
    const running = render({ id: "job", status: "running", stage: "synthesizing" });
    expect(running).toContain("正在整理进展和研究缺口");
    expect(running).toContain('aria-current="step"');
    expect(running).toContain("综合分析");
    expect(running).not.toContain("生成文件");
    expect(running).not.toContain("补查");
    expect(running).not.toContain("%");
  });

  it("keeps interrupted and failed work distinct from completed work", () => {
    const interrupted = render({ id: "job", status: "running", stage: "searching" }, true);
    expect(interrupted).toContain("任务状态更新中断");
    expect(interrupted).toContain('data-state="unknown" aria-current="step"');
    expect(interrupted).toContain("状态待确认");
    const failed = render({ id: "job", status: "failed", stage: "rendering" });
    expect(failed).toContain("调研未完成");
    expect(failed).toContain('data-state="failed" aria-current="step"');
    const unknown = render({ id: "job", status: "failed" });
    expect(unknown).not.toContain("执行记录");
    const lastObserved = render({ id: "job", status: "failed", stageHistory: ["searching", "reviewing"] });
    expect(lastObserved).toContain("最后记录的阶段为审查报告");
    expect(lastObserved).toContain('data-state="unknown" aria-current="step"');
  });

  it("records only actual phases after completion and keeps the record collapsed", () => {
    const complete = render({ id: "job", status: "complete",
      stageHistory: ["searching", "synthesizing", "reviewing", "rendering"] });
    expect(complete.match(/<li /g)).toHaveLength(4);
    expect(complete).toContain("调研已完成");
    expect(complete).toContain('<details class="research-query-history">');
    expect(complete).not.toContain("<details open");
    expect(complete).not.toContain("补查");
    expect(complete).not.toContain("修订");
    expect(complete).not.toContain('aria-current="step"');
    expect(complete).not.toContain("进行中");
  });

  it("preserves supplement and review loops in their actual order", () => {
    const supplement = render({ id: "job", status: "running", stage: "supplementing_2",
      stageHistory: ["searching", "synthesizing", "supplementing_1", "synthesizing", "reviewing", "supplementing_2"] });
    expect(supplement).toContain("Agent 正在定向补查资料（第 2 轮）");
    expect(supplement.match(/<li /g)).toHaveLength(6);
    expect(supplement.match(/<span>综合分析<\/span>/g)).toHaveLength(2);
    expect(supplement.indexOf("<span>补查·第 1 轮</span>")).toBeLessThan(supplement.indexOf("<span>审查报告</span>"));
    expect(supplement.indexOf("<span>审查报告</span>")).toBeLessThan(supplement.indexOf("<span>补查·第 2 轮</span>"));
    const returning = render({ id: "job", status: "running", stage: "reviewing",
      stageHistory: ["searching", "reviewing", "supplementing_2", "synthesizing", "reviewing"] });
    expect(returning.match(/aria-current="step"/g)).toHaveLength(1);
    expect(returning.match(/<span>审查报告<\/span>/g)).toHaveLength(2);
    expect(returning).toContain('data-state="current" aria-current="step"');
  });

  it("keeps older cached reports concise and shows actual review and evidence limits", () => {
    const legacy = render({ id: "job", status: "complete", cached: true });
    expect(legacy).toContain("已复用近期报告");
    expect(legacy).not.toContain("执行记录");
    expect(legacy).not.toContain("审查通过");
    const approved = render({ id: "job", status: "complete", reviewStatus: "approved" });
    expect(approved).toContain("审查通过");
    const pending = render({ id: "job", status: "complete", reviewStatus: "needs_review" });
    expect(pending).toContain("需进一步核查");
    const partial = render({ id: "job", status: "complete", synthesisStatus: "insufficient_evidence",
      stageHistory: ["searching", "synthesizing"] });
    expect(partial).toContain("证据不足，综合分析未生成");
    expect(partial).toContain("<small>证据不足</small>");
  });
});

describe("research report card", () => {
  const report = { html: "https://example.com/api/research/jobs/job/report.html", pdf: "https://example.com/api/research/jobs/job/report.pdf" };
  it("keeps the same report links, download behavior and sandbox inside a bounded preview", () => {
    const html = renderToStaticMarkup(<ResearchReport job={{ id: "job", status: "complete", report }} query="KV 缓存" />);
    expect(html).toContain('id="research-report-title">KV 缓存 调研报告</h2>');
    expect(html).toContain(`href="${report.pdf}?download=1" download=""`);
    expect(html).toContain(`href="${report.html}" target="_blank" rel="noopener noreferrer"`);
    expect(html).toContain(`href="${report.html}?download=1" download=""`);
    expect(html).toContain('<div class="research-query-preview"><iframe');
    expect(html).toContain('sandbox="allow-popups allow-popups-to-escape-sandbox"');
    expect(html).toContain('role="group" aria-label="报告操作"');
  });

  it("handles a long query and an unavailable PDF without an invalid download link", () => {
    const html = renderToStaticMarkup(<ResearchReport job={{ id: "job", status: "complete", report: { html: report.html } }} query={"长研究方向".repeat(20)} />);
    expect(html).toContain("另存为 PDF");
    expect(html).not.toContain('> 下载 PDF');
    expect(html).not.toContain("undefined");
    expect(renderToStaticMarkup(<ResearchReport job={{ id: "job", status: "running" }} query="KV 缓存" />)).toBe("");
  });
});
