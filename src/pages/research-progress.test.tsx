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
  });

  it("marks all phases completed only after the backend confirms completion", () => {
    const complete = render({ id: "job", status: "complete" });
    expect(complete.match(/data-state="complete"/g)).toHaveLength(5);
    expect(complete).not.toContain('aria-current="step"');
    expect(complete).not.toContain("进行中");
    expect(complete).not.toContain("调研报告已生成");
  });

  it("shows evidence limits on a delivered report", () => {
    const partial = render({ id: "job", status: "complete", synthesisStatus: "insufficient_evidence" });
    expect(partial).toContain('data-state="unknown"><span>综合分析</span><small>证据不足</small>');
    expect(partial).toContain('data-state="complete"><span>完成</span>');
  });
});
