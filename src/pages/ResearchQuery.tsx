import { useRef, useState } from "react";
import { useHref, useLocation, useSearchParams } from "react-router-dom";
import { Check, CheckCircle2, ChevronDown, Circle, Clock3, Copy, Download, ExternalLink, FileText, LoaderCircle, TriangleAlert } from "lucide-react";
import { researchTaskHref, type ResearchJob, type ResearchStage } from "./research-api";
import ResearchWorkbench from "./ResearchWorkbench";
import { workbenchEntry } from "./workbench-api";
import "./research-query.css";

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

export default function ResearchQuery() {
  const [parameters] = useSearchParams();
  const { pathname } = useLocation();
  if (pathname !== "/research/admin" && parameters.has("task")) return <section className="research-query"><h1>研究查询</h1><p role="status">旧匿名任务不在个人工作台中提供访问，也不会自动归入当前账号。请从研究查询入口登录并查看本人的研究。</p></section>;
  if (import.meta.env.VITE_WORKBENCH_MODE === "enabled") return <ResearchWorkbench />;
  const entry = workbenchEntry(import.meta.env.VITE_WORKBENCH_ORIGIN);
  return <section className="research-query research-query-gateway" aria-labelledby="research-title">
    <header className="research-query-heading"><h1 id="research-title">研究查询</h1><p>在个人研究中生成多份报告，登录后可跨设备找回研究和生成记录。</p></header>
    <div className="research-query-feedback"><h2>个人研究工作台</h2><p>研究和报告仅本人可见，使用 GitHub 登录并经管理员开通。公开日报、专题和已发布的组内 MOD 继续直接浏览。</p>
      {entry ? <a className="research-query-new-task" href={entry}>进入研究工作台</a> : <p role="status">工作台入口尚未配置，请联系管理员。</p>}
    </div></section>;
}
