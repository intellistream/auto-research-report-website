import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ResearchProgress } from "./ResearchQuery";
import type { ResearchJob } from "./research-api";

function render(job?: ResearchJob, interrupted = false) {
  return renderToStaticMarkup(<ResearchProgress job={job} interrupted={interrupted} />);
}

describe("research progress", () => {
  it("waits for confirmed job stages and exposes the current step", () => {
    expect(render()).toBe("");
    const submitting = renderToStaticMarkup(<ResearchProgress submitting />);
    expect(submitting).toContain("正在提交调研任务");
    expect(submitting).not.toContain('data-state="complete"');
    const queued = render({ id: "job", status: "queued" });
    expect(queued).toContain('aria-current="step"><span>排队</span>');
    expect(queued).not.toContain('data-state="complete"');
    const running = render({ id: "job", status: "running", stage: "synthesizing" });
    expect(running).toContain('aria-current="step"><span>综合分析</span>');
    expect(running).toContain('data-state="pending"><span>生成文件</span>');
    expect(running).toContain('role="status"');
    expect(running).not.toContain("%");
  });

  it("keeps interrupted and failed work distinct from completed work", () => {
    const interrupted = render({ id: "job", status: "running", stage: "searching" }, true);
    expect(interrupted).toContain('data-state="unknown" aria-current="step"><span>检索资料</span>');
    expect(interrupted).toContain("状态待确认");
    expect(interrupted).not.toContain('role="status"');
    const failed = render({ id: "job", status: "failed", stage: "rendering" });
    expect(failed).toContain('data-state="failed" aria-current="step"><span>生成文件</span>');
    expect(failed).toContain('data-state="unknown"><span>完成</span>');
    const unknown = render({ id: "job", status: "failed" });
    expect(unknown).not.toContain('aria-current="step"');
    expect(unknown).not.toContain('data-state="failed"');
    const lastObserved = render({ id: "job", status: "failed", stageHistory: ["searching", "reviewing"] });
    expect(lastObserved).toContain('data-state="unknown" aria-current="step"><span>审查报告</span>');
    expect(lastObserved).not.toContain('data-state="complete"><span>审查报告</span>');
  });

  it("marks only the recorded phases completed when the backend confirms completion", () => {
    const complete = render({ id: "job", status: "complete",
      stageHistory: ["searching", "synthesizing", "reviewing", "rendering"] });
    expect(complete.match(/data-state="complete"/g)).toHaveLength(6);
    expect(complete).toContain('data-state="skipped"><span>补查·第 1 轮</span><small>未执行</small>');
    expect(complete).toContain('data-state="skipped"><span>修订报告</span><small>未执行</small>');
    expect(complete).not.toContain('aria-current="step"');
    expect(complete).not.toContain("进行中");
    expect(complete).not.toContain("调研报告已生成");
  });

  it("shows evidence limits on a delivered report", () => {
    const partial = render({ id: "job", status: "complete", synthesisStatus: "insufficient_evidence" });
    expect(partial).toContain('data-state="unknown"><span>综合分析</span><small>证据不足</small>');
    expect(partial).toContain('data-state="complete"><span>完成</span>');
  });

  it("shows both supplement rounds and retains the actual order when review returns to research", () => {
    const supplement = render({ id: "job", status: "running", stage: "supplementing_2",
      stageHistory: ["searching", "synthesizing", "supplementing_1", "synthesizing", "reviewing", "supplementing_2"] });
    expect(supplement).toContain('aria-current="step"><span>补查·第 2 轮</span>');
    expect(supplement).toContain("Agent 正在定向补查资料（第 2 轮）");
    expect(supplement).toContain("<summary>实际执行顺序</summary>");
    expect(supplement).toContain("<li>综合分析</li><li>补查·第 1 轮</li><li>综合分析</li><li>审查报告</li><li>补查·第 2 轮</li>");
    const returning = render({ id: "job", status: "running", stage: "reviewing",
      stageHistory: ["searching", "synthesizing", "reviewing", "supplementing_2", "synthesizing", "reviewing"] });
    expect(returning).toContain('data-state="current" aria-current="step"><span>审查报告</span>');
    expect(returning).toContain('data-state="complete"><span>补查·第 2 轮</span>');
  });

  it("keeps missing stage history unknown for older and cached reports", () => {
    const legacy = render({ id: "job", status: "complete", cached: true });
    expect(legacy.match(/data-state="complete"/g)).toHaveLength(2);
    expect(legacy).toContain('data-state="unrecorded"><span>补查·第 1 轮</span><small>未记录</small>');
    const cached = render({ id: "job", status: "complete", cached: true,
      stageHistory: ["searching", "supplementing_1", "synthesizing", "reviewing", "revising", "rendering"] });
    expect(cached).toContain('data-state="complete"><span>修订报告</span>');
    expect(cached).toContain('data-state="skipped"><span>补查·第 2 轮</span>');
  });

  it("uses the actual review result without implying approval for a delivered draft", () => {
    const approved = render({ id: "job", status: "complete", reviewStatus: "approved" });
    expect(approved).toContain('data-state="complete"><span>审查报告</span><small>审查通过</small>');
    const pending = render({ id: "job", status: "complete", reviewStatus: "needs_review" });
    expect(pending).toContain('data-state="unknown"><span>审查报告</span><small>需进一步核查</small>');
    expect(render({ id: "job", status: "complete" })).not.toContain("审查通过");
  });
});
