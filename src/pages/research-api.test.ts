import { describe, expect, it } from "vitest";
import { mergeResearchJobProgress, parseResearchJob, researchApiBase, type ResearchJob } from "./research-api";

const origin = "https://example.com";
const job = {
  id: "research-abc",
  status: "complete",
  report: { html: "/api/research/jobs/research-abc/report.html" },
};

describe("research job responses", () => {
  it("supports same-origin and separately hosted research services", () => {
    expect(researchApiBase(undefined, origin)).toBe(origin);
    expect(researchApiBase("/services/research/", origin)).toBe(origin + "/services/research");
    expect(researchApiBase("https://api.example.com/", origin)).toBe("https://api.example.com");
    expect(() => researchApiBase("https://user:pass@example.com/", origin)).toThrow("无法连接调研服务");
  });

  it("keeps job identity and known progress stages", () => {
    const running = { id: job.id, status: "running", stage: "synthesizing" };
    expect(parseResearchJob(running, origin, job.id)).toEqual(running);
    expect(() => parseResearchJob(running, origin, "another-job")).toThrow("无法连接调研服务");
  });

  it("accepts Agent stages and filters unsupported history while retaining repeated review", () => {
    const history = ["searching", "supplementing_1", "synthesizing", "reviewing", "supplementing_2", "synthesizing", "reviewing", "revising"];
    const running = { id: job.id, status: "running", stage: "revising", stageHistory: [...history, "unknown"] };
    expect(parseResearchJob(running, origin)).toEqual({ ...running, stageHistory: history });
    expect(parseResearchJob({ ...job, reviewStatus: "needs_review" }, origin).reviewStatus).toBe("needs_review");
    expect(parseResearchJob({ ...job, reviewStatus: "unknown" }, origin).reviewStatus).toBeUndefined();
  });

  it("retains observed stages for older servers and replaces them with authoritative history", () => {
    const initial: ResearchJob = { id: "job", status: "running", stage: "reviewing" };
    const first = mergeResearchJobProgress(undefined, initial);
    const unchanged = mergeResearchJobProgress(first, initial);
    expect(unchanged.observedStages).toEqual(["reviewing"]);
    const supplement = mergeResearchJobProgress(unchanged, { ...initial, stage: "supplementing_2" });
    const returned = mergeResearchJobProgress(supplement, initial);
    expect(returned.observedStages).toEqual(["reviewing", "supplementing_2", "reviewing"]);
    const complete = mergeResearchJobProgress(returned, { id: "job", status: "complete" });
    expect(complete.observedStages).toEqual(returned.observedStages);
    const confirmed = mergeResearchJobProgress(returned, { ...initial, stageHistory: ["searching", "synthesizing", "reviewing"] });
    expect(confirmed.observedStages).toEqual(["searching", "synthesizing", "reviewing"]);
    expect(mergeResearchJobProgress(returned, { id: "new-job", status: "queued" }).observedStages).toEqual([]);
  });

  it("uses the same job's HTML and supports an optional PDF", () => {
    expect(parseResearchJob(job, origin).report).toEqual({ html: origin + job.report.html });
    const pdf = "/api/research/jobs/research-abc/report.pdf";
    expect(parseResearchJob({ ...job, report: { ...job.report, pdf } }, origin).report)
      .toEqual({ html: origin + job.report.html, pdf: origin + pdf });
  });

  it("rejects report paths pointing elsewhere and ignores an invalid PDF path", () => {
    for (const html of [
      "https://untrusted.example/report.html",
      "//untrusted.example/report.html",
      "/api/research/jobs/another-job/report.html",
      job.report.html + "?download=1",
    ]) {
      expect(() => parseResearchJob({ ...job, report: { html } }, origin)).toThrow("未返回可用的 HTML 报告");
    }
    expect(parseResearchJob({ ...job, report: { ...job.report, pdf: "/private" } }, origin).report?.pdf)
      .toBeUndefined();
  });
});
