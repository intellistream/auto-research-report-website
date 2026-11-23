import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createResearchApiResolver, parseResearchRuntimeConfig } from "./research-endpoint";

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
  it("accepts a valid tunnel base and retains old configuration timestamps", () => {
    expect(parseResearchRuntimeConfig(config())).toBe(firstBase);
    expect(parseResearchRuntimeConfig(config(firstBase + "/"))).toBe(firstBase);
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
      firstBase + "/api",
      firstBase + "?target=other",
      firstBase + "#target",
      "javascript:alert(1)",
    ]) {
      expect(() => parseResearchRuntimeConfig(config(apiBase))).toThrow();
    }
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
      await expect(createResearchApiResolver(url, fallbackBase).resolve()).resolves.toBe(fallbackBase);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("deduplicates in-flight reads and omits credentials while bypassing cached responses", async () => {
    let respond: ((response: Response) => void) | undefined;
    const fetcher = vi.fn(() => new Promise<Response>((accept) => { respond = accept; }));
    vi.stubGlobal("fetch", fetcher);
    const resolver = createResearchApiResolver(configUrl, fallbackBase);
    const first = resolver.resolve();
    const concurrent = resolver.resolve(true);
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
  });

  it("refreshes after ten seconds and allows invalidation without losing the last valid base", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json(config()))
      .mockResolvedValueOnce(Response.json(config(secondBase)))
      .mockRejectedValueOnce(new TypeError("network unavailable"));
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
    await expect(resolver.resolve()).resolves.toBe(secondBase);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("forces a fresh read and keeps the compiled or last known base on bad responses", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(Response.json(config()))
      .mockResolvedValueOnce(Response.json({ ...config(), apiBase: "https://other.example" }))
      .mockResolvedValueOnce(new Response("not JSON", { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    const resolver = createResearchApiResolver(configUrl, fallbackBase);
    await expect(resolver.resolve()).resolves.toBe(fallbackBase);
    await expect(resolver.resolve(true)).resolves.toBe(firstBase);
    await expect(resolver.resolve(true)).resolves.toBe(firstBase);
    await expect(resolver.resolve(true)).resolves.toBe(firstBase);
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it("aborts a stalled discovery after ten seconds and allows a later successful refresh", async () => {
    const fetcher = vi.fn()
      .mockImplementationOnce((_url: unknown, options: RequestInit) => new Promise<Response>((_accept, reject) => {
        options.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
      }))
      .mockResolvedValueOnce(Response.json(config()));
    vi.stubGlobal("fetch", fetcher);
    const resolver = createResearchApiResolver(configUrl, fallbackBase);
    const stalled = resolver.resolve();
    await vi.advanceTimersByTimeAsync(10001);
    await expect(stalled).resolves.toBe(fallbackBase);
    const options = fetcher.mock.calls[0][1] as RequestInit;
    expect(options.signal?.aborted).toBe(true);
    await expect(resolver.resolve(true)).resolves.toBe(firstBase);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
