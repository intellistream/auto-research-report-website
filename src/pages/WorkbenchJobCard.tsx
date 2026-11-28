import { useEffect, useRef } from "react";
import { MoreHorizontal } from "lucide-react";
import type { Job } from "./workbench-api";
import { dateText, listDateText, pending, workbenchStageLabels } from "./workbench-ui";
import { qualityLabels } from "./workbench-quality";
export default function WorkbenchJobCard({ job, available, busy, retryDisabled, interrupted, onOpen, onRemove, onRetry }: {
  job: Job; available: boolean; busy: boolean; retryDisabled: boolean; interrupted: boolean;
  onOpen: () => void; onRemove: () => void; onRetry: () => void;
}) {
  const more = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (event: PointerEvent) => { if (more.current && event.target instanceof Node && !more.current.contains(event.target)) more.current.open = false; };
    document.addEventListener("pointerdown", close); return () => document.removeEventListener("pointerdown", close);
  }, []);
  const terminal = !pending(job), status = { complete: "已生成", failed: "生成失败", queued: "排队中", running: "生成中" }[job.status];
  const labels = job.status === "complete" ? qualityLabels(job) : [];
  function closeMenu() { if (more.current) { more.current.open = false; more.current.querySelector("summary")?.focus(); } }
  return <li><article className="wb-job" data-testid={`job-${job.id}`} aria-labelledby={`wb-job-${job.id}`}>
    <div className="wb-job-main"><h4 id={`wb-job-${job.id}`}><span className="wb-job-number">#{job.number}</span><span>{job.query}</span></h4>
      <div className="wb-job-signals"><span className={`wb-status wb-status-${job.status}`}>{status}</span>{labels.map((label) => <span className="wb-quality" key={label}>{label}</span>)}</div>
      <button onClick={onOpen}>{job.status === "complete" && !job.reportExpired ? "查看报告" : "查看生成记录"}</button>
      {terminal && <details className="wb-job-more" ref={more} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); closeMenu(); } }}>
        <summary aria-label={`生成记录 #${job.number} 更多操作`} title="更多操作"><MoreHorizontal size={19} aria-hidden="true" /></summary>
        <div className="wb-job-menu" role="group" aria-label={`生成记录 #${job.number} 的操作`}>
          <button className="wb-danger-text" disabled={!available || busy} onClick={() => { closeMenu(); onRemove(); }}>{job.status === "complete" ? "删除这份报告" : "删除这条记录"}</button>
        </div></details>}
    </div>
    <div className="wb-job-meta"><span>提交于 <time dateTime={job.createdAt} title={dateText(job.createdAt)}>{listDateText(job.createdAt)}</time></span>
      <span>{job.status === "complete" ? job.reportExpired ? "文件已到期" : "文件到期" : "本次尚未生成报告文件"}{job.status === "complete" && <> <time dateTime={job.reportExpiresAt} title={dateText(job.reportExpiresAt)}>{listDateText(job.reportExpiresAt, true)}</time></>}</span>
      {job.retryOf && <span>来自失败重试</span>}
    </div>
    {pending(job) && <p className="wb-job-update">{interrupted ? "状态暂未更新 · " : ""}{job.status === "queued" ? "等待开始" : workbenchStageLabels[job.stage ?? ""] ? `正在${workbenchStageLabels[job.stage!]}` : "具体执行阶段尚未提供"}</p>}
    {job.status === "failed" && <div className="wb-job-update"><p>{job.error || "本次生成未完成，可重试。"}</p>{job.retryable !== false && <button disabled={retryDisabled} onClick={onRetry}>重试（计一次生成）</button>}</div>}
  </article></li>;
}
