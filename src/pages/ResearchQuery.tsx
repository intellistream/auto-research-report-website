import { useEffect, useRef, useState, type FormEvent } from "react";
import { Download, ExternalLink, FileText, Search } from "lucide-react";
import { getResearchJob, mergeResearchJobProgress, submitResearchJob, type ResearchJob, type ResearchStage } from "./research-api";
import "./research-query.css";

const windows = [7, 30, 90, 180, 365];
const statusText = {
  queued: "任务已提交，正在排队。",
  running: "正在生成调研报告…",
  searching: "正在检索论文和 PR…",
  supplementing_1: "Agent 正在定向补查资料（第 1 轮）…",
  supplementing_2: "Agent 正在定向补查资料（第 2 轮）…",
  synthesizing: "正在整理进展和研究缺口…",
  reviewing: "正在审查报告结论和证据…",
  revising: "正在根据审查结果修订报告…",
  rendering: "正在生成报告文件…",
};
const phases = [
  { id: "queued", label: "排队" },
  { id: "searching", label: "检索资料" },
  { id: "supplementing_1", label: "补查·第 1 轮" },
  { id: "synthesizing", label: "综合分析" },
  { id: "reviewing", label: "审查报告" },
  { id: "supplementing_2", label: "补查·第 2 轮" },
  { id: "revising", label: "修订报告" },
  { id: "rendering", label: "生成文件" },
  { id: "complete", label: "完成" },
];
const phaseLabels = {
  complete: "已完成",
  current: "进行中",
  failed: "失败",
  unknown: "状态待确认",
  pending: "待开始",
  optional: "按需执行",
  skipped: "未执行",
  unrecorded: "未记录",
};
const optionalStages = new Set<string>(["supplementing_1", "supplementing_2", "revising"]);
const reviewLabels = {
  approved: "审查通过",
  needs_review: "需进一步核查",
  unavailable: "审查不可用",
  insufficient_evidence: "证据不足",
};

function isPending(job?: ResearchJob) {
  return job?.status === "queued" || job?.status === "running";
}

export function ResearchProgress({ job, submitting = false, interrupted = false }: {
  job?: ResearchJob;
  submitting?: boolean;
  interrupted?: boolean;
}) {
  if (!job && !submitting) return null;
  const complete = job?.status === "complete";
  const failed = job?.status === "failed";
  const history = job?.stageHistory ?? job?.observedStages ?? [];
  const phase = job?.status === "queued" || complete ? job.status : job?.stage ?? (failed ? history.at(-1) : undefined);
  const priorHistory = phase && history.at(-1) === phase && !complete ? history.slice(0, -1) : history;
  const completedStages = new Set<string>(priorHistory);
  const synthesisIncomplete = complete && (job.synthesisStatus === "unavailable"
    || job.synthesisStatus === "insufficient_evidence");
  let message: string | undefined;
  if (submitting) message = "正在提交调研任务…";
  else if (job && isPending(job) && !interrupted) {
    message = job.status === "queued" ? statusText.queued : statusText[job.stage ?? "running"];
  }

  return (
    <section className="research-query-progress" aria-label="调研进度">
      {message && <p role="status">{message}</p>}
      <ol aria-label="处理阶段">
        {phases.map((step) => {
          const active = step.id === phase && !complete;
          const done = !active && (completedStages.has(step.id)
            || (step.id === "queued" && !!job && job.status !== "queued") || (step.id === "complete" && complete));
          let state: keyof typeof phaseLabels = optionalStages.has(step.id) ? "optional" : "pending";
          if (complete) state = job?.stageHistory ? "skipped" : "unrecorded";
          if (failed) state = "unknown";
          if (active) {
            state = failed ? "failed" : interrupted ? "unknown" : "current";
            if (failed && !job?.stage) state = "unknown";
          }
          if (done) state = "complete";
          let label = state === "current" && job?.status === "queued" ? "等待中" : phaseLabels[state];
          if (synthesisIncomplete && step.id === "synthesizing") {
            state = "unknown";
            label = job.synthesisStatus === "insufficient_evidence" ? "证据不足" : "综合未生成";
          }
          if (complete && step.id === "reviewing" && job.reviewStatus) {
            state = job.reviewStatus === "approved" ? "complete" : "unknown";
            label = reviewLabels[job.reviewStatus];
          }
          return (
            <li key={step.id} data-state={state} aria-current={active ? "step" : undefined}>
              <span>{step.label}</span>
              <small>{label}</small>
            </li>
          );
        })}
      </ol>
      {history.length > 0 && (
        <details className="research-query-history">
          <summary>实际执行顺序</summary>
          <ol aria-label="阶段记录">
            {history.map((stage: ResearchStage, index) => (
              <li key={index}>{phases.find((step) => step.id === stage)?.label}</li>
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}

export default function ResearchQuery() {
  const [query, setQuery] = useState("");
  const [days, setDays] = useState(30);
  const [job, setJob] = useState<ResearchJob>();
  const [searchedQuery, setSearchedQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const submitRequest = useRef<AbortController>(null);
  const keyword = query.trim();
  const validQuery = [...keyword].length >= 2 && /[\p{L}\p{N}]/u.test(keyword);

  useEffect(() => () => submitRequest.current?.abort(), []);

  useEffect(() => {
    if (!job || !isPending(job) || error) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      getResearchJob(job.id, controller.signal).then((next) => {
        if (!controller.signal.aborted) setJob((previous) => mergeResearchJobProgress(previous, next));
      }).catch((cause: Error) => {
        if (!controller.signal.aborted) setError(cause.message);
      });
    }, 2000);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [job, error]);

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validQuery || submitRequest.current || (isPending(job) && !error)) return;
    const controller = new AbortController();
    submitRequest.current = controller;
    setError("");
    setJob(undefined);
    setSearchedQuery(keyword);
    setSubmitting(true);
    try {
      const next = await submitResearchJob(keyword, days, controller.signal);
      if (!controller.signal.aborted) setJob(mergeResearchJobProgress(undefined, next));
    } catch (cause) {
      if (!controller.signal.aborted && cause instanceof Error) setError(cause.message);
    } finally {
      submitRequest.current = null;
      if (!controller.signal.aborted) setSubmitting(false);
    }
  }

  const busy = submitting || (isPending(job) && !error);
  const report = job?.report;
  return (
    <section className="research-query" aria-labelledby="research-title">
      <header className="research-query-heading">
        <h1 id="research-title">研究查询</h1>
        <p>输入研究方向，获取近期论文、相关 PR 时间线和有来源可核查的 Research Gap。</p>
      </header>

      <form className="research-query-form" onSubmit={search}>
        <label>
          <span>研究方向</span>
          <input
            type="search"
            name="query"
            placeholder="如 KV Cache、推测解码、ACLGraph"
            maxLength={120}
            required
            aria-describedby={keyword && !validQuery ? "research-query-guidance" : undefined}
            disabled={busy}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label>
          <span>检索时间</span>
          <select name="days" value={days} disabled={busy} onChange={(event) => setDays(Number(event.target.value))}>
            {windows.map((days) => <option key={days} value={days}>最近 {days} 天</option>)}
          </select>
        </label>
        <button className="research-query-submit" type="submit" disabled={busy || !validQuery}>
          <Search size={17} aria-hidden="true" />
          生成调研报告
        </button>
        {keyword && !validQuery && (
          <p id="research-query-guidance" className="research-query-guidance">
            请输入至少两个字符，并包含文字或数字。
          </p>
        )}
      </form>

      <ResearchProgress job={job} submitting={submitting} interrupted={!!error} />
      {error && (
        <div className="research-query-feedback research-query-error" role="alert">
          <p>{error}</p>
          {isPending(job) && <button type="button" onClick={() => setError("")}>重新查询任务状态</button>}
        </div>
      )}
      {job?.status === "failed" && (
        <p className="research-query-feedback research-query-error" role="alert">
          {job.error || "生成调研报告失败，请重新提交。"}
        </p>
      )}

      {report && (
        <section className="research-query-report" aria-labelledby="research-report-title">
          <header>
            <div aria-live="polite">
              <h2 id="research-report-title">调研报告已生成</h2>
              <p>{searchedQuery}{job.cached && " · 已复用近期报告"}</p>
            </div>
            <div className="research-query-actions">
              <a href={report.html} target="_blank" rel="noopener noreferrer">
                <ExternalLink size={16} aria-hidden="true" /> 打开 HTML
              </a>
              <a href={`${report.html}?download=1`} download>
                <Download size={16} aria-hidden="true" /> 下载 HTML
              </a>
              {report.pdf && (
                <a href={`${report.pdf}?download=1`} download>
                  <FileText size={16} aria-hidden="true" /> 下载 PDF
                </a>
              )}
            </div>
          </header>
          {!report.pdf && <p className="research-query-print-note">需要 PDF 时，可打开 HTML 后在浏览器中打印并选择「另存为 PDF」。</p>}
          <iframe
            className="research-query-frame"
            title={`${searchedQuery} 调研报告预览`}
            src={report.html}
            sandbox="allow-popups allow-popups-to-escape-sandbox"
            referrerPolicy="no-referrer"
          />
        </section>
      )}
    </section>
  );
}
