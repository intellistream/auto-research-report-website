import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getResearchJob, type ResearchJob } from "./research-api";
import { watchResearchJob } from "./research-polling";

vi.mock("./research-api", () => ({
  getResearchJob: vi.fn(),
  isRetryableResearchError: (cause: unknown) => cause instanceof Error && cause.name === "RetryableError",
}));

const id = "569aeb71-ff29-4ea6-9c87-8dfe537a7795";
const queued: ResearchJob = { id, status: "queued" };
const running: ResearchJob = { id, status: "running", stage: "synthesizing" };
const complete: ResearchJob = { id, status: "complete" };
const retryable = Object.assign(new Error("temporarily unavailable"), { name: "RetryableError" });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  vi.mocked(getResearchJob).mockReset();
});

afterEach(() => vi.useRealTimers());

describe("research task polling", () => {
  it("retains progress during transient failures and resets backoff after a good read", async () => {
    vi.mocked(getResearchJob)
      .mockResolvedValueOnce(queued)
      .mockRejectedValueOnce(retryable)
      .mockRejectedValueOnce(retryable)
      .mockResolvedValueOnce(running)
      .mockRejectedValueOnce(retryable)
      .mockResolvedValueOnce(complete);
    const jobs = vi.fn();
    const notice = vi.fn();
    const watching = watchResearchJob(id, new AbortController().signal, jobs, notice);
    await vi.advanceTimersByTimeAsync(4000);
    expect(jobs.mock.calls.map(([job]) => job)).toEqual([queued]);
    expect(notice.mock.calls.map(([value]) => value)).toEqual([false, true]);
    await vi.advanceTimersByTimeAsync(3000);
    expect(jobs.mock.calls.map(([job]) => job)).toEqual([queued, running]);
    await vi.advanceTimersByTimeAsync(1000);
    await watching;
    expect(jobs.mock.calls.map(([job]) => job)).toEqual([queued, running, complete]);
    expect(notice.mock.calls.map(([value]) => value)).toEqual([false, true, false, true, false]);
    expect(getResearchJob).toHaveBeenCalledTimes(6);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stops immediately on terminal read errors and failed jobs", async () => {
    const missing = new Error("task does not exist (404)");
    vi.mocked(getResearchJob).mockRejectedValueOnce(missing);
    const jobs = vi.fn();
    const notice = vi.fn();
    await expect(watchResearchJob(id, new AbortController().signal, jobs, notice)).rejects.toBe(missing);
    expect(getResearchJob).toHaveBeenCalledTimes(1);
    expect(jobs).not.toHaveBeenCalled();
    expect(notice).not.toHaveBeenCalled();
    const failed: ResearchJob = { id, status: "failed", error: "generation failed" };
    vi.mocked(getResearchJob).mockResolvedValueOnce(failed);
    await watchResearchJob(id, new AbortController().signal, jobs, notice);
    expect(jobs).toHaveBeenLastCalledWith(failed);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("exhausts four minutes of recovery and allows a new manual invocation", async () => {
    vi.mocked(getResearchJob).mockRejectedValue(retryable);
    const jobs = vi.fn();
    const notice = vi.fn();
    const controller = new AbortController();
    const watching = watchResearchJob(id, controller.signal, jobs, notice);
    const rejected = expect(watching).rejects.toBe(retryable);
    await vi.advanceTimersByTimeAsync(240000);
    await rejected;
    expect(jobs).not.toHaveBeenCalled();
    expect(notice).toHaveBeenCalledExactlyOnceWith(true);
    expect(controller.signal.aborted).toBe(false);
    const attempts = vi.mocked(getResearchJob).mock.calls.length;
    await vi.advanceTimersByTimeAsync(60000);
    expect(getResearchJob).toHaveBeenCalledTimes(attempts);
    expect(vi.getTimerCount()).toBe(0);
    vi.mocked(getResearchJob).mockResolvedValueOnce(complete);
    await watchResearchJob(id, controller.signal, jobs, notice);
    expect(jobs).toHaveBeenCalledExactlyOnceWith(complete);
    expect(notice).toHaveBeenLastCalledWith(false);
  });

  it("counts a pending read against the same recovery deadline", async () => {
    vi.mocked(getResearchJob)
      .mockRejectedValueOnce(retryable)
      .mockImplementationOnce(() => new Promise<ResearchJob>(() => {}));
    const jobs = vi.fn();
    const notice = vi.fn();
    const watching = watchResearchJob(id, new AbortController().signal, jobs, notice);
    const rejected = expect(watching).rejects.toBe(retryable);
    await vi.advanceTimersByTimeAsync(240000);
    await rejected;
    expect(getResearchJob).toHaveBeenCalledTimes(2);
    expect(jobs).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears a scheduled poll on cancellation", async () => {
    vi.mocked(getResearchJob).mockResolvedValue(running);
    const jobs = vi.fn();
    const notice = vi.fn();
    const controller = new AbortController();
    const watching = watchResearchJob(id, controller.signal, jobs, notice);
    const rejected = expect(watching).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(0);
    expect(jobs).toHaveBeenCalledExactlyOnceWith(running);
    controller.abort();
    await rejected;
    await vi.advanceTimersByTimeAsync(10000);
    expect(getResearchJob).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("suppresses callbacks when an old read resolves after cancellation", async () => {
    let respond: ((job: ResearchJob) => void) | undefined;
    vi.mocked(getResearchJob).mockImplementation(() => new Promise<ResearchJob>((accept) => { respond = accept; }));
    const jobs = vi.fn();
    const notice = vi.fn();
    const controller = new AbortController();
    const watching = watchResearchJob(id, controller.signal, jobs, notice);
    const rejected = expect(watching).rejects.toMatchObject({ name: "AbortError" });
    controller.abort();
    await rejected;
    respond!(complete);
    await vi.advanceTimersByTimeAsync(0);
    expect(jobs).not.toHaveBeenCalled();
    expect(notice).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
