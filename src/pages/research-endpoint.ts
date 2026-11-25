const ttl = 10_000;

export function isEphemeralQuickTunnelBase(url: string): boolean {
  try { return new URL(url).hostname.endsWith(".trycloudflare.com"); }
  catch { return false; }
}

export class ResearchEndpointUnavailableError extends Error {
  readonly retryable = true;

  constructor(message = "无法获取调研服务最新地址，任务尚未提交，请稍后重试。") {
    super(message);
    this.name = "ResearchEndpointUnavailableError";
  }
}

export function parseResearchRuntimeConfig(data: unknown): string {
  const config = data as { version?: unknown; apiBase?: unknown; updatedAt?: unknown } | null;
  if (!config || config.version !== 1 || typeof config.apiBase !== "string"
    || !/^https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.(?:trycloudflare\.com|sage\.org\.ai)\/?$/.test(config.apiBase)
    || typeof config.updatedAt !== "string"
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(config.updatedAt)
    || !Number.isFinite(Date.parse(config.updatedAt))) {
    throw new Error("调研服务地址配置无效。");
  }
  return new URL(config.apiBase).origin;
}

export function createResearchApiResolver(configuredUrl: string | undefined, fallbackBase?: string) {
  let configUrl: URL | undefined;
  try {
    if (configuredUrl?.trim()) {
      const url = new URL(configuredUrl.trim());
      if (url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash) configUrl = url;
    }
  } catch { /* Keep the compiled service when discovery is not configured safely. */ }

  const safeFallback = configUrl && (!fallbackBase || isEphemeralQuickTunnelBase(fallbackBase))
    ? undefined : fallbackBase;
  let currentBase: string | undefined;
  let expiresAt = 0;
  let pending: Promise<{ base: string | undefined; fresh: boolean }> | undefined;
  let nonce = 0;

  async function fetchLatest(force: boolean) {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      if (attempt > 1) await new Promise((resolve) => setTimeout(resolve, 250));
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const url = new URL(configUrl!);
      const bucket = Math.floor(Date.now() / ttl);
      url.searchParams.set("v", force || attempt > 1 ? `${bucket}-${attempt}-${++nonce}` : String(bucket));
      try {
        const request = (async () => {
          const response = await fetch(url.href, {
            cache: "no-store", credentials: "omit", signal: controller.signal,
          });
          if (!response.ok) throw new Error("调研服务地址暂不可用。");
          return parseResearchRuntimeConfig(await response.json());
        })();
        const resolved = await Promise.race([
          request,
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              controller.abort();
              reject(new Error("读取调研服务地址超时。"));
            }, ttl);
          }),
        ]);
        currentBase = resolved;
        expiresAt = Date.now() + ttl;
        return { base: resolved, fresh: true };
      } catch { /* Retry once without caching discovery failures. */ }
      finally { clearTimeout(timer); }
    }
    expiresAt = 0;
    return { base: currentBase ?? safeFallback, fresh: false };
  }

  function refresh(force = false) {
    pending ??= fetchLatest(force).finally(() => { pending = undefined; });
    return pending;
  }

  return {
    isConfigured(): boolean { return !!configUrl; },
    hasFresh(): boolean { return !configUrl || Date.now() < expiresAt; },
    async resolve(force = false): Promise<string> {
      if (!configUrl) {
        if (fallbackBase) return fallbackBase;
        throw new ResearchEndpointUnavailableError();
      }
      if (!pending && !force && Date.now() < expiresAt && currentBase) return currentBase;
      const { base } = await refresh(force);
      if (base) return base;
      throw new ResearchEndpointUnavailableError();
    },
    async resolveForSubmission(): Promise<string> {
      if (!configUrl) {
        if (fallbackBase) return fallbackBase;
        throw new ResearchEndpointUnavailableError();
      }
      if (Date.now() < expiresAt && currentBase) return currentBase;
      const result = await refresh(true);
      if (result.fresh && result.base) return result.base;
      if (safeFallback) return safeFallback;
      throw new ResearchEndpointUnavailableError();
    },
    invalidate() { expiresAt = 0; },
  };
}
