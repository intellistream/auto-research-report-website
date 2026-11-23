import { getResearchJob, isRetryableResearchError, type ResearchJob } from "./research-api";

const pollInterval = 2_000;
const retryDelays = [1_000, 2_000, 5_000, 10_000, 30_000];
const recoveryBudget = 240_000;

async function readJob(id: string, signal: AbortSignal) {
  signal.throwIfAborted();
  let onAbort: () => void = () => {};
  const interrupted = new Promise<never>((_, reject) => {
    onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    return await Promise.race([getResearchJob(id, signal), interrupted]);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

function wait(milliseconds: number, signal: AbortSignal) {
  signal.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export async function watchResearchJob(
  id: string,
  signal: AbortSignal,
  onJob: (job: ResearchJob) => void,
  onReconnecting: (value: boolean) => void,
): Promise<void> {
  signal.throwIfAborted();
  const controller = new AbortController();
  const onAbort = () => controller.abort(signal.reason);
  signal.addEventListener("abort", onAbort, { once: true });
  let recoveryTimer: ReturnType<typeof setTimeout> | undefined;
  let lastError: unknown;
  let retryCount = 0;
  let reconnecting = false;

  try {
    while (true) {
      controller.signal.throwIfAborted();
      const startedAt = Date.now();
      let job: ResearchJob;
      try {
        job = await readJob(id, controller.signal);
        controller.signal.throwIfAborted();
      } catch (cause) {
        signal.throwIfAborted();
        if (controller.signal.aborted) throw lastError ?? cause;
        if (!isRetryableResearchError(cause)) throw cause;
        lastError = cause;
        if (!reconnecting) {
          const remaining = recoveryBudget - (Date.now() - startedAt);
          if (remaining <= 0) throw cause;
          recoveryTimer = setTimeout(() => controller.abort(lastError), remaining);
          reconnecting = true;
          onReconnecting(true);
        }
        const delay = retryDelays[Math.min(retryCount, retryDelays.length - 1)];
        retryCount += 1;
        await wait(delay, controller.signal);
        continue;
      }

      clearTimeout(recoveryTimer);
      recoveryTimer = undefined;
      retryCount = 0;
      reconnecting = false;
      onJob(job);
      controller.signal.throwIfAborted();
      onReconnecting(false);
      if (job.status === "complete" || job.status === "failed") return;
      await wait(pollInterval, controller.signal);
    }
  } finally {
    clearTimeout(recoveryTimer);
    signal.removeEventListener("abort", onAbort);
  }
}
