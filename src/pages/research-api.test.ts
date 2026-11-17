import { describe, expect, it } from "vitest";
import { parseResearchJob, researchApiBase } from "./research-api";

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
