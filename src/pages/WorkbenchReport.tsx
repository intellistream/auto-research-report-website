import { useEffect, useRef, useState } from "react";
import { ResearchProgress } from "./ResearchQuery";
import { errorMessage, isAbort, type WorkbenchApi, type Job } from "./workbench-api";
import { Notice, dateText, generationWait, pending } from "./workbench-ui";
export default function WorkbenchReport({ api, job, available }: { api: WorkbenchApi; job: Job; available: boolean }) {
  const [preview, setPreview] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false), [attempt, setAttempt] = useState(0);
  const alive = useRef(true); useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    setPreview(""); setError(""); if (!job.report?.html || job.reportExpired) return;
    const controller = new AbortController(); let url = "";
    api.report(job.studyId, job.id, "html", controller.signal).then(async (blob) => {
      const text = await blob.text();
      if (controller.signal.aborted) return;
      const policy = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'">`;
      url = URL.createObjectURL(new Blob([policy, text], { type: "text/html" })); setPreview(url);
    }).catch((error) => { if (!controller.signal.aborted) setError(errorMessage(error)); });
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [api, job.id, job.studyId, job.report?.html, job.reportExpired, attempt]);
  async function download(format: "html" | "pdf" | "json") {
    if (busy || !available) return; setBusy(true); setError("");
    try {
      const blob = await api.report(job.studyId, job.id, format); if (!alive.current) return;
      const url = URL.createObjectURL(blob), link = document.createElement("a");
      link.href = url; link.download = `report-${job.id}.${format}`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { if (alive.current && !isAbort(error)) setError(errorMessage(error)); }
    finally { if (alive.current) setBusy(false); }
  }
  const labels: Record<string, string> = { approved: "审查通过", needs_review: "需进一步核查", unavailable: "不可用", insufficient_evidence: "证据不足", generated: "已生成" };
  return <div className="wb-reader"><h3>{job.query}</h3><dl className="wb-metadata"><div><dt>取材范围</dt><dd>最近 {job.days} 天</dd></div>
    <div><dt>提交时刻</dt><dd>{dateText(job.createdAt)}</dd></div><div><dt>生成时刻</dt><dd>{dateText(job.completedAt)}</dd></div>
    <div><dt>审查状态</dt><dd>{labels[job.reviewStatus ?? ""] ?? "尚未提供"}</dd></div><div><dt>证据与综合</dt><dd>{labels[job.synthesisStatus ?? ""] ?? "尚未提供"}</dd></div>
    <div><dt>文件到期</dt><dd>{dateText(job.reportExpiresAt)}</dd></div></dl><ResearchProgress job={job} />
    {job.reportExpired ? <Notice>报告文件已到期。仍可在本研究中生成新的报告，其他报告继续保留。</Notice>
      : job.report ? <><div className="wb-actions" aria-label="报告格式下载">{(["html", "pdf", "json"] as const).map((format) => job.report?.[format] &&
        <button key={format} disabled={busy || !available} onClick={() => void download(format)}>下载 {format.toUpperCase()}</button>)}</div>
        {!job.report.pdf && <p className="wb-muted">PDF 暂不可用，HTML 仍可阅读和下载。</p>}
        {preview ? <iframe title="当前报告预览" src={preview} sandbox="allow-popups allow-popups-to-escape-sandbox" referrerPolicy="no-referrer" /> : !error && <Notice>正在读取报告正文…</Notice>}
      </> : <Notice>{pending(job) ? generationWait : job.status === "failed" ? "本次生成失败，请返回本研究查看重试操作。" : "尚无可用报告文件，请刷新记录或联系管理员。"}</Notice>}
    {error && <Notice error>{error}<button onClick={() => setAttempt((v) => v + 1)}>重新读取报告</button></Notice>}
  </div>;
}
