import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  discoveryError, getResearchJob, isResearchTaskId, isRetryableResearchError, mergeResearchJobProgress,
  parseResearchJob, researchApiBase, researchTaskHref, type ResearchJob,
} from "./research-api";
import { ResearchEndpointUnavailableError } from "./research-endpoint";

const origin = "https://example.com";
const job = {
  id: "research-abc",
  status: "complete",
  report: { html: "/api/research/jobs/research-abc/report.html" },
};
const taskId = "569aeb71-ff29-4ea6-9c87-8dfe537a7795";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("research job responses", () => {
  it("treats discovery failures as retryable without retrying unrelated errors", () => {
    const unavailable = new ResearchEndpointUnavailableError();
    expect(unavailable.message).toBe(discoveryError);
    expect(isRetryableResearchError(unavailable)).toBe(true);
    expect(isRetryableResearchError(new Error(discoveryError))).toBe(false);
    expect(isRetryableResearchError(null)).toBe(false);
  });

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

  it("restores bounded query metadata without breaking older job responses", () => {
    expect(parseResearchJob({ ...job, query: "  KV 缓存 ", days: 30 }, origin).query).toBe("KV 缓存");
    expect(parseResearchJob({ ...job, query: "  KV 缓存 ", days: 30 }, origin).days).toBe(30);
    expect(parseResearchJob(job, origin).query).toBeUndefined();
    expect(parseResearchJob({ ...job, query: "x".repeat(121), days: 400 }, origin).query).toBeUndefined();
    expect(parseResearchJob({ ...job, days: 7.5 }, origin).days).toBeUndefined();
  });

  it("creates canonical public task links under the existing site path", () => {
    const href = researchTaskHref(taskId.toUpperCase(), "https://example.com/project/?previous=topic#/research");
    expect(href).toBe(`https://example.com/project/#/research?task=${taskId}`);
    expect(researchTaskHref(taskId, "http://127.0.0.1:5173/#/research")).toContain(`/#/research?task=${taskId}`);
    for (const value of ["", "research-abc", "../private", "//other.example", taskId + "?task=other"]) {
      expect(isResearchTaskId(value)).toBe(false);
      expect(() => researchTaskHref(value, origin)).toThrow("任务链接无效");
    }
  });

  it("rejects unsafe restored IDs before fetching", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(getResearchJob("../private", new AbortController().signal)).rejects.toThrow("任务链接无效");
    expect(fetcher).not.toHaveBeenCalled();
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

describe("research request timeouts on older browsers", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.stubGlobal("window", { location: { origin } });
    vi.stubGlobal("AbortSignal", { any: undefined, timeout: undefined });
    vi.stubEnv("VITE_RESEARCH_API_CONFIG_URL", "");
    vi.stubEnv("VITE_RESEARCH_API_BASE", origin);
  });

  it.each(["GET", "POST"])("times out %s with a controller while static AbortSignal helpers are absent", async (method) => {
    const fetcher = vi.fn((_url: string, options: RequestInit) => new Promise<Response>((_resolve, reject) => {
      options.signal?.addEventListener("abort", () => reject(options.signal?.reason), { once: true });
    }));
    vi.stubGlobal("fetch", fetcher);
    const api = await import("./research-api");
    const controller = new AbortController();
    const request = method === "POST" ? api.submitResearchJob("KV cache", 30, controller.signal)
      : api.getResearchJob(job.id, controller.signal);
    const outcome = request.catch((cause: unknown) => cause);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const requestSignal = fetcher.mock.calls[0][1].signal!;
    expect(AbortSignal.any).toBeUndefined();
    expect(AbortSignal.timeout).toBeUndefined();
    if (method === "POST") {
      await vi.advanceTimersByTimeAsync(15000);
      expect(requestSignal.aborted).toBe(false);
    }
    await vi.advanceTimersByTimeAsync(14999);
    expect(requestSignal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(requestSignal.aborted).toBe(true);
    expect(controller.signal.aborted).toBe(false);
    const error = await outcome;
    expect(error).toMatchObject({ transportFailure: method === "POST" });
    expect((error as Error).message).toContain(method === "POST" ? "无法确认任务是否已提交" : "无法连接调研服务");
    expect(api.isRetryableResearchError(error)).toBe(method === "GET");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["GET", "POST"])("completes %s and cleans up its timer and caller listener", async (method) => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ id: job.id, status: "queued" }));
    vi.stubGlobal("fetch", fetcher);
    const api = await import("./research-api");
    const controller = new AbortController();
    const add = vi.spyOn(controller.signal, "addEventListener");
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    const request = method === "POST" ? api.submitResearchJob("KV cache", 30, controller.signal)
      : api.getResearchJob(job.id, controller.signal);
    await expect(request).resolves.toMatchObject({ id: job.id, status: "queued" });
    expect(add).toHaveBeenCalledWith("abort", expect.any(Function), { once: true });
    expect(remove).toHaveBeenCalledWith("abort", add.mock.calls[0][1]);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(30000);
    expect(fetcher.mock.calls[0][1].signal.aborted).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each(["GET", "POST"])("forwards caller cancellation to an active %s and cleans up", async (method) => {
    const fetcher = vi.fn((_url: string, options: RequestInit) => new Promise<Response>((_resolve, reject) => {
      options.signal?.addEventListener("abort", () => reject(options.signal?.reason), { once: true });
    }));
    vi.stubGlobal("fetch", fetcher);
    const api = await import("./research-api");
    const controller = new AbortController();
    const reason = new DOMException("Leaving the page", "AbortError");
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    const request = method === "POST" ? api.submitResearchJob("KV cache", 30, controller.signal)
      : api.getResearchJob(job.id, controller.signal);
    const rejected = expect(request).rejects.toBe(reason);
    await vi.advanceTimersByTimeAsync(0);
    controller.abort(reason);
    await rejected;
    expect(fetcher.mock.calls[0][1].signal?.reason).toBe(reason);
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("does not start discovery or a timeout for an already cancelled submission", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const api = await import("./research-api");
    const controller = new AbortController();
    controller.abort();
    await expect(api.submitResearchJob("KV cache", 30, controller.signal)).rejects.toBe(controller.signal.reason);
    expect(fetcher).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
