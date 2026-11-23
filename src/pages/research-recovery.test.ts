import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const configUrl = "https://lab.sage.org.ai/auto-research-report-runtime/research-api.json";
const compiled = "https://compiled.example.com";
const oldBase = "https://old-tunnel.trycloudflare.com";
const newBase = "https://new-tunnel.trycloudflare.com";
const id = "874b273c-104d-48de-be59-a01677d242da";
const path = `/api/research/jobs/${id}`;
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { "content-type": "application/json" },
});
const route = (apiBase: string) => json({ version: 1, apiBase, updatedAt: "2026-11-23T00:00:00Z" });
const complete = {
  id, status: "complete", report: { html: path + "/report.html", pdf: path + "/report.pdf" },
};
const signal = () => new AbortController().signal;

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("window", { location: { origin: "https://lab.sage.org.ai" } });
  vi.stubEnv("VITE_RESEARCH_API_BASE", compiled);
  vi.stubEnv("VITE_RESEARCH_API_CONFIG_URL", configUrl);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("research connection recovery", () => {
  it("updates an existing task's exports after the runtime cache expires", async () => {
    let now = Date.parse("2026-11-23T00:00:00Z");
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const fetcher = vi.fn().mockResolvedValueOnce(route(oldBase)).mockResolvedValueOnce(json(complete))
      .mockResolvedValueOnce(route(newBase)).mockResolvedValueOnce(json(complete));
    vi.stubGlobal("fetch", fetcher);
    const { getResearchJob } = await import("./research-api");
    expect((await getResearchJob(id, signal())).report?.pdf).toBe(oldBase + path + "/report.pdf");
    now += 10_001;
    expect((await getResearchJob(id, signal())).report?.pdf).toBe(newBase + path + "/report.pdf");
    expect(fetcher.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(0);
  });

  it.each(["network", "html"])("moves one failed GET (%s) to a newly published endpoint and uses its exports", async (failure) => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(route(oldBase));
    if (failure === "network") fetcher.mockRejectedValueOnce(new TypeError("offline"));
    else fetcher.mockResolvedValueOnce(new Response("gateway unavailable", { status: 502 }));
    fetcher.mockResolvedValueOnce(route(newBase)).mockResolvedValueOnce(json(complete));
    vi.stubGlobal("fetch", fetcher);
    const { getResearchJob } = await import("./research-api");
    const job = await getResearchJob(id, signal());
    expect(job.report).toEqual({ html: newBase + path + "/report.html", pdf: newBase + path + "/report.pdf" });
    expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual([
      expect.stringContaining(configUrl + "?v="), oldBase + path,
      expect.stringContaining(configUrl + "?v="), newBase + path,
    ]);
  });

  it.each(["unchanged", "invalid"])("does not immediately repeat a GET when discovery is %s", async (config) => {
    const fetcher = vi.fn().mockResolvedValueOnce(route(oldBase))
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(config === "unchanged" ? route(oldBase) : route("https://untrusted.example"));
    vi.stubGlobal("fetch", fetcher);
    const { getResearchJob, isRetryableResearchError } = await import("./research-api");
    const error = await getResearchJob(id, signal()).catch((cause: unknown) => cause);
    expect(isRetryableResearchError(error)).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it.each([
    () => json({ detail: "任务不存在" }, 404),
    () => json({ detail: "无权访问" }, 401),
    () => json({ ...complete, id: "different-job" }),
    () => json({ ...complete, report: { html: "https://untrusted.example/report.html" } }),
  ])("does not hide authoritative errors or invalid report identity by migrating", async (response) => {
    const fetcher = vi.fn().mockResolvedValueOnce(route(oldBase)).mockResolvedValueOnce(response());
    vi.stubGlobal("fetch", fetcher);
    const { getResearchJob, isRetryableResearchError } = await import("./research-api");
    const error = await getResearchJob(id, signal()).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(Error);
    expect(isRetryableResearchError(error)).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it.each(["network", "gateway", "malformed"])("never retries a transmitted POST after %s failure", async (failure) => {
    const fetcher = vi.fn().mockResolvedValueOnce(route(oldBase));
    if (failure === "network") fetcher.mockRejectedValueOnce(new TypeError("lost response"));
    else fetcher.mockResolvedValueOnce(failure === "gateway" ? json({ detail: "not ready" }, 503) : json({}));
    vi.stubGlobal("fetch", fetcher);
    const { submitResearchJob } = await import("./research-api");
    await expect(submitResearchJob("ACL Graph", 30, signal())).rejects.toThrow("无法确认任务是否已提交");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1][0]).toBe(oldBase + "/api/research/jobs");
    expect(fetcher.mock.calls[1][1]).toMatchObject({ method: "POST", body: JSON.stringify({ query: "ACL Graph", days: 30 }) });
  });

  it("keeps an explicit API limit rejection without replaying the POST", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(route(oldBase))
      .mockResolvedValueOnce(json({ detail: "当前任务较多，请稍后再提交。" }, 429));
    vi.stubGlobal("fetch", fetcher);
    const { submitResearchJob } = await import("./research-api");
    await expect(submitResearchJob("ACL Graph", 30, signal())).rejects.toThrow("当前任务较多，请稍后再提交。");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("preserves caller cancellation without discovery refresh or GET replay", async () => {
    const controller = new AbortController();
    const fetcher = vi.fn().mockResolvedValueOnce(route(oldBase)).mockImplementationOnce(async () => {
      controller.abort();
      throw controller.signal.reason;
    });
    vi.stubGlobal("fetch", fetcher);
    const { getResearchJob } = await import("./research-api");
    await expect(getResearchJob(id, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("does not send a POST if its caller leaves during shared discovery", async () => {
    const controller = new AbortController();
    let finish!: (value: Response) => void;
    const fetcher = vi.fn().mockImplementation(() => new Promise<Response>((resolve) => { finish = resolve; }));
    vi.stubGlobal("fetch", fetcher);
    const { submitResearchJob } = await import("./research-api");
    const submission = submitResearchJob("ACL Graph", 30, controller.signal);
    controller.abort();
    finish(route(oldBase));
    await expect(submission).rejects.toMatchObject({ name: "AbortError" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("uses the compiled service when the runtime document is invalid", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(route("http://unsafe.trycloudflare.com"))
      .mockResolvedValueOnce(json(complete));
    vi.stubGlobal("fetch", fetcher);
    const { getResearchJob } = await import("./research-api");
    expect((await getResearchJob(id, signal())).report?.html).toBe(compiled + path + "/report.html");
    expect(fetcher.mock.calls[1][0]).toBe(compiled + path);
  });
});
