import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useHref, useSearchParams } from "react-router-dom";
import { Check, CheckCircle2, ChevronDown, Circle, Clock3, Copy, Download, ExternalLink, FileText, LoaderCircle, Search, TriangleAlert } from "lucide-react";
import { isResearchTaskId, mergeResearchJobProgress, researchTaskHref, submitResearchJob, type ResearchJob, type ResearchStage } from "./research-api";
import { watchResearchJob } from "./research-polling";
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
const stageTitles: Record<ResearchStage, string> = {
  searching: "检索资料",
  supplementing_1: "补查·第 1 轮",
  supplementing_2: "补查·第 2 轮",
  synthesizing: "综合分析",
  reviewing: "审查报告",
  revising: "修订报告",
  rendering: "生成文件",
};
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
  const records = job?.stage && history.at(-1) !== job.stage ? [...history, job.stage] : history;
  const activeStage = !complete ? job?.stage ?? records.at(-1) : undefined;
  const synthesisIncomplete = complete && (job.synthesisStatus === "unavailable"
    || job.synthesisStatus === "insufficient_evidence");
  let state: "current" | "complete" | "failed" | "unknown" = "current";
  let message = statusText[job?.stage ?? "running"];
  let note = "";
  if (submitting) {
    message = "正在提交调研任务…";
  } else if (interrupted) {
    state = "unknown";
    message = "任务状态更新中断";
  } else if (failed) {
    state = "failed";
    message = "调研未完成";
  } else if (complete) {
    state = "complete";
    message = job.cached ? "已复用近期报告" : "调研已完成";
    const evidenceNote = synthesisIncomplete
      ? job.synthesisStatus === "insufficient_evidence" ? "证据不足，综合分析未生成" : "综合分析未生成"
      : "";
    note = [evidenceNote, job.reviewStatus && reviewLabels[job.reviewStatus]].filter(Boolean).join(" · ");
    if (synthesisIncomplete || (job.reviewStatus && job.reviewStatus !== "approved")) state = "unknown";
  } else if (job?.status === "queued") {
    message = statusText.queued;
  }
  if ((failed || interrupted) && activeStage) note = `最后记录的阶段为${stageTitles[activeStage]}`;
  const waiting = submitting || job?.status === "queued";
  const StatusIcon = state === "complete" ? CheckCircle2
    : state === "failed" || state === "unknown" ? TriangleAlert : waiting ? Clock3 : LoaderCircle;

  return (
    <section className="research-query-progress" data-state={state} aria-label="调研进度">
      <div className="research-query-current">
        <span className="research-query-status-icon" aria-hidden="true">
          <StatusIcon size={21} className={!waiting && state === "current" ? "research-query-spinning" : undefined} />
        </span>
        <div role="status" aria-atomic="true">
          <p className="research-query-status">{message}</p>
          {note && <p className="research-query-status-note">{note}</p>}
        </div>
      </div>
      {records.length > 0 && (
        <details className="research-query-history">
          <summary>执行记录 <ChevronDown size={14} aria-hidden="true" /></summary>
          <ol aria-label="阶段记录">
            {records.map((stage, index) => {
              const active = index === records.length - 1 && !complete;
              let recordState = active ? state : "complete";
              let label = active ? "进行中" : "已完成";
              if (active && state === "failed") label = "失败";
              if (active && (interrupted || !job?.stage)) {
                recordState = "unknown";
                label = "状态待确认";
              }
              if (synthesisIncomplete && stage === "synthesizing") {
                recordState = "unknown";
                label = job.synthesisStatus === "insufficient_evidence" ? "证据不足" : "综合未生成";
              }
              const RecordIcon = recordState === "complete" ? Check : Circle;
              return (
                <li key={index} data-state={recordState} aria-current={active ? "step" : undefined}>
                  <RecordIcon size={14} aria-hidden="true" />
                  <span>{stageTitles[stage]}</span>
                  <small className={recordState === "complete" ? "research-query-sr-only" : undefined}>{label}</small>
                </li>
              );
            })}
          </ol>
        </details>
      )}
    </section>
  );
}

export function ResearchReport({ job, query }: { job: ResearchJob; query: string }) {
  const report = job.report;
  if (!report) return null;
  return (
    <section className="research-query-report" aria-labelledby="research-report-title">
      <header>
        <div className="research-query-report-heading" aria-live="polite">
          <h2 id="research-report-title">{query ? `${query} 调研报告` : "调研报告"}</h2>
        </div>
        <div className="research-query-actions" role="group" aria-label="报告操作">
          {report.pdf && (
            <a className="research-query-primary-action" href={`${report.pdf}?download=1`} download>
              <FileText size={16} aria-hidden="true" /> 下载 PDF
            </a>
          )}
          <a className={!report.pdf ? "research-query-primary-action" : undefined} href={report.html} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={16} aria-hidden="true" /> 打开 HTML
          </a>
          <a href={`${report.html}?download=1`} download>
            <Download size={16} aria-hidden="true" /> 下载 HTML
          </a>
        </div>
      </header>
      {!report.pdf && <p className="research-query-print-note">需要 PDF 时，可打开 HTML 后在浏览器中打印并选择「另存为 PDF」。</p>}
      <div className="research-query-preview">
        <iframe
          className="research-query-frame"
          title={query ? `${query} 调研报告预览` : "调研报告预览"}
          src={report.html}
          sandbox="allow-popups allow-popups-to-escape-sandbox"
          referrerPolicy="no-referrer"
        />
      </div>
    </section>
  );
}

export function ResearchTaskLink({ id }: { id: string }) {
  const routeHref = useHref({ pathname: "/research", search: "?" + new URLSearchParams({ task: id }) });
  const href = typeof window === "undefined" ? routeHref : researchTaskHref(id, window.location.href);
  const field = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");

  async function copyLink() {
    try {
      if (!navigator.clipboard) throw new Error();
      await navigator.clipboard.writeText(href);
      setMessage("任务链接已复制。");
    } catch {
      field.current?.focus();
      field.current?.select();
      setMessage("已选中链接，请复制后保存。");
    }
  }

  return (
    <aside className="research-query-task" aria-labelledby="research-task-title">
      <h2 id="research-task-title">任务链接</h2>
      <p>保存此链接，可查看任务和下载报告。</p>
      <div className="research-query-task-actions">
        <input ref={field} aria-label="调研任务链接" readOnly value={href} onFocus={(event) => event.currentTarget.select()} />
        <button type="button" onClick={copyLink}><Copy size={15} aria-hidden="true" />复制链接</button>
        <a href={href} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} aria-hidden="true" />打开任务</a>
      </div>
      {message && <p className="research-query-copy-status" role="status">{message}</p>}
    </aside>
  );
}

function ResearchQueryContent({ publicMode, taskId, invalidTask, onCreated }: {
  publicMode: boolean;
  taskId?: string;
  invalidTask: boolean;
  onCreated: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [days, setDays] = useState(30);
  const [job, setJob] = useState<ResearchJob>();
  const [searchedQuery, setSearchedQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loadingTask, setLoadingTask] = useState(!!taskId);
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const [reconnecting, setReconnecting] = useState(false);
  const [error, setError] = useState(invalidTask ? "调研任务链接无效，请重新发起调研。" : "");
  const submitRequest = useRef<AbortController>(null);
  const keyword = query.trim();
  const validQuery = [...keyword].length >= 2 && /[\p{L}\p{N}]/u.test(keyword);
  const activeTaskId = taskId ?? job?.id;

  useEffect(() => () => submitRequest.current?.abort(), []);

  useEffect(() => {
    if (job?.status !== "complete") return;
    const refresh = () => setRestoreAttempt((attempt) => attempt + 1);
    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pageshow", refresh);
    };
  }, [job?.id, job?.status]);

  useEffect(() => {
    if (!activeTaskId || (!taskId && job && !isPending(job))) return;
    const controller = new AbortController();
    setLoadingTask(!!taskId && !job);
    setReconnecting(false);
    setError("");
    watchResearchJob(activeTaskId, controller.signal, (next) => {
      if (controller.signal.aborted) return;
      setLoadingTask(false);
      setJob((previous) => mergeResearchJobProgress(previous, next));
      if (next.query) {
        setQuery(next.query);
        setSearchedQuery(next.query);
      }
      if (next.days) setDays(next.days);
    }, (retrying) => {
      if (!controller.signal.aborted) {
        setReconnecting(retrying);
        if (retrying) setLoadingTask(false);
      }
    }).catch((cause: Error) => {
      if (!controller.signal.aborted) setError(cause.message);
    }).finally(() => {
      if (!controller.signal.aborted) {
        setLoadingTask(false);
        setReconnecting(false);
      }
    });
    return () => controller.abort();
  }, [activeTaskId, restoreAttempt]);

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (invalidTask || loadingTask || !validQuery || submitRequest.current || (isPending(job) && !error)) return;
    const controller = new AbortController();
    submitRequest.current = controller;
    setError("");
    setJob(undefined);
    setReconnecting(false);
    setSearchedQuery(keyword);
    setSubmitting(true);
    try {
      const next = await submitResearchJob(keyword, days, controller.signal);
      if (!controller.signal.aborted) {
        if (publicMode) {
          if (!isResearchTaskId(next.id)) throw new Error("调研服务未返回有效的任务链接。");
          onCreated(next.id);
        }
        else setJob(mergeResearchJobProgress(undefined, next));
      }
    } catch (cause) {
      if (!controller.signal.aborted && cause instanceof Error) setError(cause.message);
    } finally {
      submitRequest.current = null;
      if (!controller.signal.aborted) setSubmitting(false);
    }
  }

  const busy = invalidTask || loadingTask || submitting || (isPending(job) && !error);
  return (
    <section className="research-query" aria-labelledby="research-title">
      <header className="research-query-heading">
        <h1 id="research-title">{taskId ? "调研任务" : "研究查询"}</h1>
        {taskId ? (
          <>
            {job?.query && <p>{job.query} · 最近 {job.days ?? days} 天</p>}
            <Link className="research-query-new-task" to="/research">发起新调研</Link>
          </>
        ) : <p>{publicMode ? "提交研究方向，在后台生成论文、PR 进展和 Research Gap 调研报告。" : "输入研究方向，获取近期论文、相关 PR 时间线和有来源可核查的 Research Gap。"}</p>}
      </header>

      {!taskId && !invalidTask && <form className="research-query-form" onSubmit={search}>
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
          {publicMode ? "创建调研任务" : "生成调研报告"}
        </button>
        {keyword && !validQuery && (
          <p id="research-query-guidance" className="research-query-guidance">
            请输入至少两个字符，并包含文字或数字。
          </p>
        )}
      </form>}

      {publicMode && taskId && !submitting && <ResearchTaskLink id={taskId} />}
      {loadingTask && <p className="research-query-feedback" role="status">正在读取调研任务…</p>}
      <ResearchProgress job={job} submitting={submitting} interrupted={!!error || reconnecting} />
      {reconnecting && <p className="research-query-feedback" role="status">连接暂时中断，正在自动恢复任务状态，请稍候…</p>}
      {error && (
        <div className="research-query-feedback research-query-error" role="alert">
          <p>{error}</p>
          {(isPending(job) || taskId) && <button type="button" onClick={() => {
            setRestoreAttempt((attempt) => attempt + 1);
          }}>重新查询任务状态</button>}
          {invalidTask && <Link to="/research">重新发起调研</Link>}
        </div>
      )}
      {job?.status === "failed" && (
        <p className="research-query-feedback research-query-error" role="alert">
          {job.error || "生成调研报告失败，请重新提交。"}
        </p>
      )}

      {job?.report && <ResearchReport job={job} query={searchedQuery} />}
    </section>
  );
}

export default function ResearchQuery() {
  const publicMode = import.meta.env.VITE_RESEARCH_MODE === "public";
  const [parameters, setParameters] = useSearchParams();
  const requested = parameters.getAll("task");
  const invalidTask = publicMode && (requested.length > 1 || (requested.length === 1 && !isResearchTaskId(requested[0])));
  const taskId = publicMode && !invalidTask ? requested[0]?.toLowerCase() : undefined;
  return (
    <ResearchQueryContent
      key={publicMode ? taskId ?? (invalidTask ? "invalid" : "new") : "private"}
      publicMode={publicMode}
      taskId={taskId}
      invalidTask={invalidTask}
      onCreated={(id) => setParameters({ task: id })}
    />
  );
}
