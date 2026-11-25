import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createResearchApiResolver, isEphemeralQuickTunnelBase, parseResearchRuntimeConfig, ResearchEndpointUnavailableError,
} from "./research-endpoint";

const configUrl = "https://config.example.com/research-runtime.json";
const fallbackBase = "https://fixed.example.com";
const firstBase = "https://first-tunnel.trycloudflare.com";
const secondBase = "https://second-tunnel.trycloudflare.com";
const now = Date.parse("2026-11-23T03:00:00Z");

function config(apiBase = firstBase) {
  return { version: 1, apiBase, updatedAt: "2026-11-23T03:00:00Z" };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("research runtime configuration", () => {
  it("accepts single-label tunnel and Sage bases and retains old configuration timestamps", () => {
    for (const base of [firstBase, "https://research-api.sage.org.ai", "https://a.sage.org.ai"]) {
      expect(parseResearchRuntimeConfig(config(base))).toBe(base);
      expect(parseResearchRuntimeConfig(config(base + "/"))).toBe(base);
    }
    expect(parseResearchRuntimeConfig({ ...config(), updatedAt: "2020-01-01T00:00:00Z" })).toBe(firstBase);
  });

  it("rejects unsupported schemas, invalid timestamps and unsafe tunnel URLs", () => {
    for (const value of [
      null,
      [],
      {},
      { ...config(), version: 2 },
      { ...config(), version: "1" },
      { ...config(), updatedAt: undefined },
      { ...config(), updatedAt: "yesterday" },
      { ...config(), updatedAt: "2026-13-23T03:00:00Z" },
      { ...config(), updatedAt: "2026-11-23" },
    ]) {
      expect(() => parseResearchRuntimeConfig(value)).toThrow();
    }
    for (const apiBase of [
      "http://first-tunnel.trycloudflare.com",
      "https://FIRST-TUNNEL.trycloudflare.com",
      "https://trycloudflare.com",
      "https://first-tunnel.trycloudflare.com.attacker.example",
      "https://nested.first-tunnel.trycloudflare.com",
      "https://first-tunnel.trycloudflare.com:443",
      "https://first-tunnel.trycloudflare.com:8443",
      "https://user:secret@first-tunnel.trycloudflare.com",
      "https://attacker.example",
      "https://other.example",
      "http://research-api.sage.org.ai",
      "https://RESEARCH-API.sage.org.ai",
      "https://sage.org.ai",
      "https://nested.research-api.sage.org.ai",
      "https://research-api.sage.org.ai.attacker.example",
      "https://research-api.sage.org.ai:443",
      "https://research-api.sage.org.ai:8443",
      "https://user:secret@research-api.sage.org.ai",
      "https://research-api.sage.org.ai/api",
      "https://research-api.sage.org.ai?target=other",
      "https://research-api.sage.org.ai#target",
      "https://-invalid.sage.org.ai",
      "https://invalid-.sage.org.ai",
      `https://${"a".repeat(64)}.sage.org.ai`,
      firstBase + "/api",
      firstBase + "?target=other",
      firstBase + "#target",
      "javascript:alert(1)",
    ]) {
      expect(() => parseResearchRuntimeConfig(config(apiBase))).toThrow();
    }
  });

  it("identifies ephemeral tunnels by hostname without matching lookalike domains", () => {
    expect(isEphemeralQuickTunnelBase(firstBase)).toBe(true);
    expect(isEphemeralQuickTunnelBase(firstBase.toUpperCase() + "/api")).toBe(true);
    for (const base of [fallbackBase, "https://research-api.sage.org.ai", "https://trycloudflare.com",
      firstBase + ".attacker.example", "/", "not a URL"]) {
      expect(isEphemeralQuickTunnelBase(base)).toBe(false);
    }
  });

  it("marks unavailable discovery as retryable with an actionable pre-submission message", () => {
    const error = new ResearchEndpointUnavailableError();
    expect(error).toBeInstanceOf(Error);
    expect(error.retryable).toBe(true);
    expect(error.message).toBe("无法获取调研服务最新地址，任务尚未提交，请稍后重试。");
    expect(new ResearchEndpointUnavailableError("custom").message).toBe("custom");
  });
});

describe("research API discovery", () => {
  it("uses the compiled fallback without fetching absent or unsafe configuration URLs", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    for (const url of [
      undefined,
      "",
      "http://config.example.com/runtime.json",
      "javascript:alert(1)",
      "https://user:secret@config.example.com/runtime.json",
      configUrl + "?token=secret",
      configUrl + "#other",
    ]) {
      for (const base of [fallbackBase, firstBase, "/"]) {
        const resolver = createResearchApiResolver(url, base);
        expect(resolver.isConfigured()).toBe(false);
        expect(resolver.hasFresh()).toBe(true);
        await expect(resolver.resolve()).resolves.toBe(base);
        await expect(resolver.resolveForSubmission()).resolves.toBe(base);
      }
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects a missing fallback when discovery is not configured", async () => {
    const resolver = createResearchApiResolver(undefined);
    await expect(resolver.resolve()).rejects.toBeInstanceOf(ResearchEndpointUnavailableError);
    await expect(resolver.resolveForSubmission()).rejects.toBeInstanceOf(ResearchEndpointUnavailableError);
  });

  it("deduplicates warm-up, forced reads and submissions while bypassing cached responses", async () => {
    let respond: ((response: Response) => void) | undefined;
    const fetcher = vi.fn(() => new Promise<Response>((accept) => { respond = accept; }));
    vi.stubGlobal("fetch", fetcher);
    const resolver = createResearchApiResolver(configUrl, fallbackBase);
    const first = resolver.resolve();
    const concurrent = resolver.resolve(true);
    const submission = resolver.resolveForSubmission();
    expect(resolver.isConfigured()).toBe(true);
    expect(resolver.hasFresh()).toBe(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [request, options] = fetcher.mock.calls[0] as unknown as [string | URL, RequestInit];
    const url = new URL(String(request));
    expect(url.origin + url.pathname).toBe(configUrl);
    expect(url.searchParams.get("v")).toBe(String(Math.floor(now / 10000)));
    expect(options.cache).toBe("no-store");
    expect(options.credentials).toBe("omit");
    expect(options.signal).toBeInstanceOf(AbortSignal);
    respond!(Response.json(config()));
    await expect(first).resolves.toBe(firstBase);
    await expect(concurrent).resolves.toBe(firstBase);
    await expect(submission).resolves.toBe(firstBase);
    expect(resolver.hasFresh()).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("refreshes after ten seconds and allows invalidation without losing the last valid base", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json(config()))
      .mockResolvedValueOnce(Response.json(config(secondBase)))
      .mockRejectedValue(new TypeError("network unavailable"));
    vi.stubGlobal("fetch", fetcher);
    const resolver = createResearchApiResolver(configUrl, fallbackBase);
    await expect(resolver.resolve()).resolves.toBe(firstBase);
    await vi.advanceTimersByTimeAsync(9999);
    await expect(resolver.resolve()).resolves.toBe(firstBase);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2);
    await expect(resolver.resolve()).resolves.toBe(secondBase);
    expect(fetcher).toHaveBeenCalledTimes(2);
    resolver.invalidate();
    expect(resolver.hasFresh()).toBe(false);
    const failedRefresh = expect(resolver.resolve()).resolves.toBe(secondBase);
    await vi.advanceTimersByTimeAsync(250);
    await failedRefresh;
    expect(resolver.hasFresh()).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it("uses unique cache keys for retries and every forced refresh within the same bucket", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(Response.json(config()))
      .mockImplementation(() => Promise.resolve(Response.json(config())));
    vi.stubGlobal("fetch", fetcher);
    const resolver = createResearchApiResolver(configUrl, fallbackBase);
    const recovered = expect(resolver.resolve()).resolves.toBe(firstBase);
    await vi.advanceTimersByTimeAsync(250);
    await recovered;
    await expect(resolver.resolve(true)).resolves.toBe(firstBase);
    await expect(resolver.resolve(true)).resolves.toBe(firstBase);
    expect(fetcher).toHaveBeenCalledTimes(4);
    const keys = fetcher.mock.calls.map(([url]) => new URL(String(url)).searchParams.get("v"));
    const bucket = Math.floor(now / 10000);
    expect(keys[0]).toBe(String(bucket));
    expect(keys[1]).toMatch(new RegExp(`^${bucket}-2-`));
    expect(keys[2]).toMatch(new RegExp(`^${bucket}-1-`));
    expect(new Set(keys).size).toBe(4);
  });

  it.each(["network", "status", "json", "config"])("retries %s failures once with no negative cache", async (failure) => {
    const fetcher = vi.fn().mockImplementation(() => {
      if (failure === "network") return Promise.reject(new TypeError("offline"));
      if (failure === "status") return Promise.resolve(new Response("unavailable", { status: 503 }));
      if (failure === "json") return Promise.resolve(new Response("not JSON"));
      return Promise.resolve(Response.json(config("https://other.example")));
    });
    vi.stubGlobal("fetch", fetcher);
    const resolver = createResearchApiResolver(configUrl, fallbackBase);
    const first = expect(resolver.resolve()).resolves.toBe(fallbackBase);
    await vi.advanceTimersByTimeAsync(249);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await first;
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(resolver.hasFresh()).toBe(false);
    fetcher.mockResolvedValueOnce(Response.json(config()));
    await expect(resolver.resolve()).resolves.toBe(firstBase);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(Date.now() - now).toBe(250);
    expect(resolver.hasFresh()).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([undefined, "", firstBase])("ignores an absent or ephemeral fallback (%s) when discovery is configured", async (base) => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError("offline"));
    vi.stubGlobal("fetch", fetcher);
    const resolver = createResearchApiResolver(configUrl, base);
    const first = expect(resolver.resolve()).rejects.toBeInstanceOf(ResearchEndpointUnavailableError);
    await vi.advanceTimersByTimeAsync(250);
    await first;
    const submission = expect(resolver.resolveForSubmission()).rejects.toThrow("任务尚未提交");
    await vi.advanceTimersByTimeAsync(250);
    await submission;
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(resolver.hasFresh()).toBe(false);
  });

  it.each([fallbackBase, "https://research-api.sage.org.ai"])("retains explicit fixed fallback %s for submissions", async (base) => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError("offline"));
    vi.stubGlobal("fetch", fetcher);
    const resolver = createResearchApiResolver(configUrl, base);
    const submission = expect(resolver.resolveForSubmission()).resolves.toBe(base);
    await vi.advanceTimersByTimeAsync(250);
    await submission;
    expect(resolver.hasFresh()).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("refreshes an expired base before submission and refuses stale tunnels after discovery failure", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(config()))
      .mockResolvedValueOnce(Response.json(config(secondBase)))
      .mockRejectedValue(new TypeError("offline"));
    vi.stubGlobal("fetch", fetcher);
    const resolver = createResearchApiResolver(configUrl, firstBase);
    await expect(resolver.resolve()).resolves.toBe(firstBase);
    await expect(resolver.resolveForSubmission()).resolves.toBe(firstBase);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10000);
    expect(resolver.hasFresh()).toBe(false);
    await expect(resolver.resolveForSubmission()).resolves.toBe(secondBase);
    expect(fetcher).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(10000);
    const rejected = expect(resolver.resolveForSubmission()).rejects.toBeInstanceOf(ResearchEndpointUnavailableError);
    await vi.advanceTimersByTimeAsync(250);
    await rejected;
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(resolver.hasFresh()).toBe(false);
  });

  it("uses the fixed fallback instead of a stale discovered base for submissions", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(config()))
      .mockRejectedValue(new TypeError("offline"));
    vi.stubGlobal("fetch", fetcher);
    const resolver = createResearchApiResolver(configUrl, fallbackBase);
    await resolver.resolve();
    resolver.invalidate();
    const submission = expect(resolver.resolveForSubmission()).resolves.toBe(fallbackBase);
    await vi.advanceTimersByTimeAsync(250);
    await submission;
    expect(resolver.hasFresh()).toBe(false);
  });

  it("aborts each stalled attempt after ten seconds with one short retry and no negative cache", async () => {
    const fetcher = vi.fn()
      .mockImplementation(() => new Promise<Response>(() => {}));
    vi.stubGlobal("fetch", fetcher);
    const resolver = createResearchApiResolver(configUrl, fallbackBase);
    const stalled = expect(resolver.resolve()).resolves.toBe(fallbackBase);
    await vi.advanceTimersByTimeAsync(10000);
    const calls = fetcher.mock.calls as unknown as [string, RequestInit][];
    expect(calls[0][1].signal?.aborted).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(250);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(calls[1][1].signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(10000);
    await stalled;
    expect(calls[1][1].signal?.aborted).toBe(true);
    expect(resolver.hasFresh()).toBe(false);
    fetcher.mockResolvedValueOnce(Response.json(config()));
    await expect(resolver.resolve()).resolves.toBe(firstBase);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
  });
});
