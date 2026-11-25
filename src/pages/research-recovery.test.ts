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
const discoveryError = "无法获取调研服务最新地址，任务尚未提交，请稍后重试。";
const uncertainSubmission = "连接中断，无法确认任务是否已提交。请勿立即重复提交；若已获得任务链接，请通过链接查看。";
const endpointRotatedSubmission = "调研服务通道已更新，本次请求未送达当前服务，请直接重新点击「创建调研任务」。";
const transportFailures = ["network", "html", "530", "502", "503", "504", "408"];

function failedSubmission(failure: string): Promise<Response> {
  if (failure === "network") return Promise.reject(new TypeError("lost response"));
  if (failure === "html" || failure === "530") {
    return Promise.resolve(new Response("<html>Cloudflare tunnel unavailable</html>", {
      status: failure === "530" ? 530 : 502, headers: { "content-type": "text/html" },
    }));
  }
  return Promise.resolve(json({ detail: "gateway unavailable" }, Number(failure)));
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(Date.parse("2026-11-23T00:00:00Z"));
  vi.stubGlobal("window", { location: { origin: "https://lab.sage.org.ai" } });
  vi.stubEnv("VITE_RESEARCH_API_BASE", compiled);
  vi.stubEnv("VITE_RESEARCH_API_CONFIG_URL", configUrl);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("research connection recovery", () => {
  it("retains private same-origin login cookies for reads and submissions", async () => {
    vi.stubEnv("VITE_RESEARCH_API_CONFIG_URL", "");
    vi.stubEnv("VITE_RESEARCH_API_BASE", "/");
    const fetcher = vi.fn().mockResolvedValueOnce(json(complete)).mockResolvedValueOnce(json({ id, status: "queued" }, 202));
    vi.stubGlobal("fetch", fetcher);
    const { getResearchJob, submitResearchJob } = await import("./research-api");
    await getResearchJob(id, signal());
    await submitResearchJob("ACL Graph", 30, signal());
    expect(fetcher).toHaveBeenCalledTimes(2);
    for (const [url, options] of fetcher.mock.calls) {
      expect(String(url)).toMatch(/^https:\/\/lab\.sage\.org\.ai\/api\/research\/jobs/);
      expect(options.credentials).toBe("same-origin");
    }
  });

  it("updates an existing task's exports after the runtime cache expires", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(route(oldBase)).mockResolvedValueOnce(json(complete))
      .mockResolvedValueOnce(route(newBase)).mockResolvedValueOnce(json(complete));
    vi.stubGlobal("fetch", fetcher);
    const { getResearchJob } = await import("./research-api");
    expect((await getResearchJob(id, signal())).report?.pdf).toBe(oldBase + path + "/report.pdf");
    await vi.advanceTimersByTimeAsync(10001);
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
    expect(fetcher.mock.calls[1][1].credentials).toBe("omit");
    expect(fetcher.mock.calls[3][1].credentials).toBe("omit");
    expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual([
      expect.stringContaining(configUrl + "?v="), oldBase + path,
      expect.stringContaining(configUrl + "?v="), newBase + path,
    ]);
  });

  it.each(["unchanged", "invalid"])("does not immediately repeat a GET when discovery is %s", async (config) => {
    const fetcher = vi.fn().mockResolvedValueOnce(route(oldBase))
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockImplementation(() => Promise.resolve(route(config === "unchanged" ? oldBase : "https://untrusted.example")));
    vi.stubGlobal("fetch", fetcher);
    const { getResearchJob, isRetryableResearchError } = await import("./research-api");
    const request = getResearchJob(id, signal()).catch((cause: unknown) => cause);
    if (config === "invalid") await vi.advanceTimersByTimeAsync(250);
    const error = await request;
    expect(isRetryableResearchError(error)).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(config === "unchanged" ? 3 : 4);
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

  it.each(transportFailures)("probes after POST %s failure and keeps uncertainty when the endpoint is unchanged", async (failure) => {
    const fetcher = vi.fn().mockResolvedValueOnce(route(oldBase))
      .mockImplementationOnce(() => failedSubmission(failure))
      .mockResolvedValueOnce(route(oldBase));
    vi.stubGlobal("fetch", fetcher);
    const { submitResearchJob } = await import("./research-api");
    await expect(submitResearchJob("ACL Graph", 30, signal())).rejects.toThrow(uncertainSubmission);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(1);
    expect(fetcher.mock.calls[1][0]).toBe(oldBase + "/api/research/jobs");
    expect(fetcher.mock.calls[1][1]).toMatchObject({ method: "POST", body: JSON.stringify({ query: "ACL Graph", days: 30 }) });
  });

  it.each(transportFailures)("detects rotation after POST %s failure without replaying and uses the new endpoint on manual submission", async (failure) => {
    const fetcher = vi.fn().mockResolvedValueOnce(route(oldBase))
      .mockImplementationOnce(() => failedSubmission(failure))
      .mockResolvedValueOnce(route(newBase))
      .mockResolvedValueOnce(json({ id, status: "queued" }, 202));
    vi.stubGlobal("fetch", fetcher);
    const { submitResearchJob, isRetryableResearchError } = await import("./research-api");
    const error = await submitResearchJob("ACL Graph", 30, signal()).catch((cause: unknown) => cause);
    expect(error).toMatchObject({ message: endpointRotatedSubmission, retryable: false });
    expect(isRetryableResearchError(error)).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(1);
    const firstKey = new URL(String(fetcher.mock.calls[0][0])).searchParams.get("v");
    const probeKey = new URL(String(fetcher.mock.calls[2][0])).searchParams.get("v");
    expect(probeKey).not.toBe(firstKey);
    await expect(submitResearchJob("ACL Graph", 30, signal())).resolves.toMatchObject({ id, status: "queued" });
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(fetcher.mock.calls[3][0]).toBe(newBase + "/api/research/jobs");
    expect(fetcher.mock.calls[3][1]).toMatchObject({ method: "POST", credentials: "omit" });
    expect(fetcher.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(2);
  });

  it.each([400, 401, 403, 404, 422, 429])("keeps explicit API rejection %s without probing or replaying the POST", async (status) => {
    const fetcher = vi.fn().mockResolvedValueOnce(route(oldBase))
      .mockResolvedValueOnce(json({ detail: "当前任务较多，请稍后再提交。" }, status));
    vi.stubGlobal("fetch", fetcher);
    const { submitResearchJob } = await import("./research-api");
    await expect(submitResearchJob("ACL Graph", 30, signal())).rejects.toThrow("当前任务较多，请稍后再提交。");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it.each([401, 404, 429])("does not probe for a non-JSON authoritative rejection %s", async (status) => {
    const fetcher = vi.fn().mockResolvedValueOnce(route(oldBase))
      .mockResolvedValueOnce(new Response("<html>Request rejected</html>", { status }));
    vi.stubGlobal("fetch", fetcher);
    const { submitResearchJob } = await import("./research-api");
    await expect(submitResearchJob("ACL Graph", 30, signal())).rejects.toMatchObject({ transportFailure: false });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it.each([
    () => json({}, 202),
    () => new Response("{invalid", { status: 202, headers: { "content-type": "application/json" } }),
    () => json({ detail: "internal error" }, 500),
  ])("does not probe or replay a malformed acceptance or non-gateway JSON error", async (response) => {
    const fetcher = vi.fn().mockResolvedValueOnce(route(oldBase)).mockResolvedValueOnce(response());
    vi.stubGlobal("fetch", fetcher);
    const { submitResearchJob } = await import("./research-api");
    await expect(submitResearchJob("ACL Graph", 30, signal())).rejects.toMatchObject({
      message: uncertainSubmission, transportFailure: false, retryable: false,
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("preserves the original submission error when the rotation probe fails and rediscovers on manual retry", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(route(oldBase))
      .mockRejectedValueOnce(new TypeError("lost response"))
      .mockRejectedValueOnce(new TypeError("discovery offline"))
      .mockRejectedValueOnce(new TypeError("discovery offline"))
      .mockResolvedValueOnce(route(newBase))
      .mockResolvedValueOnce(json({ id, status: "queued" }, 202));
    vi.stubGlobal("fetch", fetcher);
    const { submitResearchJob } = await import("./research-api");
    const rejected = expect(submitResearchJob("ACL Graph", 30, signal())).rejects.toThrow(uncertainSubmission);
    await vi.advanceTimersByTimeAsync(250);
    await rejected;
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(fetcher.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(1);
    await expect(submitResearchJob("ACL Graph", 30, signal())).resolves.toMatchObject({ id, status: "queued" });
    expect(fetcher).toHaveBeenCalledTimes(6);
    expect(fetcher.mock.calls[5][0]).toBe(newBase + "/api/research/jobs");
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

  it("preserves caller cancellation during a post-failure rotation probe", async () => {
    const controller = new AbortController();
    let finish!: (value: Response) => void;
    const fetcher = vi.fn().mockResolvedValueOnce(route(oldBase))
      .mockRejectedValueOnce(new TypeError("lost response"))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { finish = resolve; }));
    vi.stubGlobal("fetch", fetcher);
    const { submitResearchJob } = await import("./research-api");
    const rejected = expect(submitResearchJob("ACL Graph", 30, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(0);
    expect(fetcher).toHaveBeenCalledTimes(3);
    controller.abort();
    finish(route(newBase));
    await rejected;
    expect(fetcher.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(1);
  });

  it.each([oldBase, "", "   ", undefined])("sends zero POST requests when discovery fails with an ephemeral or empty compiled base (%s)", async (base) => {
    vi.stubEnv("VITE_RESEARCH_API_BASE", base);
    const fetcher = vi.fn().mockRejectedValue(new TypeError("discovery offline"));
    vi.stubGlobal("fetch", fetcher);
    const { submitResearchJob } = await import("./research-api");
    const { ResearchEndpointUnavailableError } = await import("./research-endpoint");
    const result = submitResearchJob("ACL Graph", 30, signal()).catch((cause: unknown) => cause);
    await vi.advanceTimersByTimeAsync(250);
    const error = await result;
    expect(error).toBeInstanceOf(ResearchEndpointUnavailableError);
    expect(error).toMatchObject({ message: discoveryError, retryable: true });
    expect(fetcher).toHaveBeenCalledTimes(2);
    for (const [url, options] of fetcher.mock.calls) {
      expect(String(url)).toContain(configUrl + "?v=");
      expect(options.method).not.toBe("POST");
    }
  });

  it("uses discovery instead of the website origin when the compiled base is empty", async () => {
    vi.stubEnv("VITE_RESEARCH_API_BASE", "");
    vi.stubEnv("VITE_RESEARCH_API_CONFIG_URL", "  " + configUrl + "  ");
    const fetcher = vi.fn().mockResolvedValueOnce(route(newBase))
      .mockResolvedValueOnce(json({ id, status: "queued" }, 202));
    vi.stubGlobal("fetch", fetcher);
    const { submitResearchJob } = await import("./research-api");
    await expect(submitResearchJob("ACL Graph", 30, signal())).resolves.toMatchObject({ id });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1][0]).toBe(newBase + "/api/research/jobs");
  });

  it("refreshes a warmed but expired endpoint before sending a POST", async () => {
    vi.stubEnv("VITE_RESEARCH_API_BASE", oldBase);
    const fetcher = vi.fn().mockResolvedValueOnce(route(oldBase))
      .mockResolvedValueOnce(route(newBase))
      .mockResolvedValueOnce(json({ id, status: "queued" }, 202));
    vi.stubGlobal("fetch", fetcher);
    const { submitResearchJob, warmResearchEndpoint } = await import("./research-api");
    await warmResearchEndpoint();
    await vi.advanceTimersByTimeAsync(10000);
    await expect(submitResearchJob("ACL Graph", 30, signal())).resolves.toMatchObject({ id });
    expect(fetcher).toHaveBeenCalledTimes(3);
    const posts = fetcher.mock.calls.filter(([, options]) => options?.method === "POST");
    expect(posts).toHaveLength(1);
    expect(posts[0][0]).toBe(newBase + "/api/research/jobs");
  });

  it("refuses to POST to a stale warmed tunnel when fresh discovery fails", async () => {
    vi.stubEnv("VITE_RESEARCH_API_BASE", oldBase);
    const fetcher = vi.fn().mockResolvedValueOnce(route(oldBase))
      .mockRejectedValue(new TypeError("discovery offline"));
    vi.stubGlobal("fetch", fetcher);
    const { submitResearchJob, warmResearchEndpoint } = await import("./research-api");
    await warmResearchEndpoint();
    await vi.advanceTimersByTimeAsync(10000);
    const rejected = expect(submitResearchJob("ACL Graph", 30, signal())).rejects.toThrow(discoveryError);
    await vi.advanceTimersByTimeAsync(250);
    await rejected;
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(0);
  });

  it("still submits to an explicit fixed fallback after discovery fails twice", async () => {
    vi.stubEnv("VITE_RESEARCH_API_BASE", "  " + compiled + "/  ");
    const fetcher = vi.fn().mockRejectedValueOnce(new TypeError("offline"))
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(json({ id, status: "queued" }, 202));
    vi.stubGlobal("fetch", fetcher);
    const { submitResearchJob } = await import("./research-api");
    const submission = expect(submitResearchJob("ACL Graph", 30, signal())).resolves.toMatchObject({ id });
    await vi.advanceTimersByTimeAsync(250);
    await submission;
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher.mock.calls[2][0]).toBe(compiled + "/api/research/jobs");
  });

  it("warms discovery silently on failure and retries immediately on the next warm-up", async () => {
    vi.stubEnv("VITE_RESEARCH_API_BASE", "");
    const fetcher = vi.fn().mockRejectedValue(new TypeError("discovery offline"));
    vi.stubGlobal("fetch", fetcher);
    const { warmResearchEndpoint, submitResearchJob } = await import("./research-api");
    const warmed = expect(warmResearchEndpoint()).resolves.toBeUndefined();
    await vi.advanceTimersByTimeAsync(250);
    await warmed;
    expect(fetcher).toHaveBeenCalledTimes(2);
    fetcher.mockResolvedValueOnce(route(newBase)).mockResolvedValueOnce(json({ id, status: "queued" }, 202));
    await expect(warmResearchEndpoint()).resolves.toBeUndefined();
    await expect(submitResearchJob("ACL Graph", 30, signal())).resolves.toMatchObject({ id });
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(fetcher.mock.calls[3][0]).toBe(newBase + "/api/research/jobs");
  });

  it("keeps polling through unavailable discovery and resumes against the recovered endpoint", async () => {
    vi.stubEnv("VITE_RESEARCH_API_BASE", "");
    const fetcher = vi.fn().mockRejectedValueOnce(new TypeError("offline"))
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(route(newBase)).mockResolvedValueOnce(json(complete));
    vi.stubGlobal("fetch", fetcher);
    const { watchResearchJob } = await import("./research-polling");
    const onJob = vi.fn();
    const onReconnecting = vi.fn();
    const watching = expect(watchResearchJob(id, signal(), onJob, onReconnecting)).resolves.toBeUndefined();
    await vi.advanceTimersByTimeAsync(250);
    expect(onReconnecting).toHaveBeenCalledWith(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1000);
    await watching;
    expect(onJob).toHaveBeenCalledWith(expect.objectContaining({
      id, report: { html: newBase + path + "/report.html", pdf: newBase + path + "/report.pdf" },
    }));
    expect(onReconnecting).toHaveBeenLastCalledWith(false);
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("uses the compiled service when the runtime document is invalid", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(route("http://unsafe.trycloudflare.com"))
      .mockResolvedValueOnce(route("http://unsafe.trycloudflare.com"))
      .mockResolvedValueOnce(json(complete));
    vi.stubGlobal("fetch", fetcher);
    const { getResearchJob } = await import("./research-api");
    const request = getResearchJob(id, signal());
    await vi.advanceTimersByTimeAsync(250);
    expect((await request).report?.html).toBe(compiled + path + "/report.html");
    expect(fetcher.mock.calls[2][0]).toBe(compiled + path);
  });
});
