const ttl = 10_000;

export function parseResearchRuntimeConfig(data: unknown): string {
  const config = data as { version?: unknown; apiBase?: unknown; updatedAt?: unknown } | null;
  if (!config || config.version !== 1 || typeof config.apiBase !== "string"
    || !/^https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.trycloudflare\.com\/?$/.test(config.apiBase)
    || typeof config.updatedAt !== "string"
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(config.updatedAt)
    || !Number.isFinite(Date.parse(config.updatedAt))) {
    throw new Error("调研服务地址配置无效。");
  }
  return new URL(config.apiBase).origin;
}

export function createResearchApiResolver(configuredUrl: string | undefined, fallbackBase: string) {
  let configUrl: URL | undefined;
  try {
    if (configuredUrl?.trim()) {
      const url = new URL(configuredUrl.trim());
      if (url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash) configUrl = url;
    }
  } catch { /* Keep the compiled service when discovery is not configured safely. */ }

  let currentBase: string | undefined;
  let expiresAt = 0;
  let pending: Promise<string> | undefined;

  async function refresh() {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const url = new URL(configUrl!);
    url.searchParams.set("v", String(Math.floor(Date.now() / ttl)));
    try {
      const request = (async () => {
        const response = await fetch(url.href, {
          cache: "no-store", credentials: "omit", signal: controller.signal,
        });
        if (!response.ok) throw new Error("调研服务地址暂不可用。");
        return parseResearchRuntimeConfig(await response.json());
      })();
      currentBase = await Promise.race([
        request,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new Error("读取调研服务地址超时。"));
          }, ttl);
        }),
      ]);
    } catch { /* A temporary discovery failure must not discard a known service. */ }
    finally {
      clearTimeout(timer);
      expiresAt = Date.now() + ttl;
      pending = undefined;
    }
    return currentBase ?? fallbackBase;
  }

  return {
    resolve(force = false): Promise<string> {
      if (!configUrl) return Promise.resolve(fallbackBase);
      if (pending) return pending;
      if (!force && Date.now() < expiresAt) return Promise.resolve(currentBase ?? fallbackBase);
      pending = refresh();
      return pending;
    },
    invalidate() { expiresAt = 0; },
  };
}
