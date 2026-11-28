import { useEffect, useRef, useState } from "react";
import { ResearchProgress } from "./ResearchQuery";
import { errorMessage, isAbort, type WorkbenchApi, type Job } from "./workbench-api";
import { Notice, dateText, generationWait, pending, workbenchStageLabels } from "./workbench-ui";
import { parseReportInfo, qualityLabels, reviewLabel, synthesisLabel, type ReportInfo } from "./workbench-quality";
export default function WorkbenchReport({ api, job, available }: { api: WorkbenchApi; job: Job; available: boolean }) {
  const [preview, setPreview] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false), [attempt, setAttempt] = useState(0);
  const [info, setInfo] = useState<ReportInfo>(), [infoError, setInfoError] = useState(""), [infoAttempt, setInfoAttempt] = useState(0);
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
  useEffect(() => {
    setInfo(undefined); setInfoError(""); if (!job.report?.json || job.reportExpired) return;
    const controller = new AbortController();
    api.report(job.studyId, job.id, "json", controller.signal).then(async (blob) => {
      const next = parseReportInfo(JSON.parse(await blob.text()));
      if (!controller.signal.aborted) setInfo(next);
    }).catch(() => { if (!controller.signal.aborted) setInfoError("暂时无法读取报告中的资料范围与质量说明，正文仍可阅读。"); });
    return () => controller.abort();
  }, [api, job.id, job.studyId, job.report?.json, job.reportExpired, infoAttempt]);
  async function download(format: "html" | "pdf" | "json") {
    if (busy || !available) return; setBusy(true); setError("");
    try {
      const blob = await api.report(job.studyId, job.id, format); if (!alive.current) return;
      const url = URL.createObjectURL(blob), link = document.createElement("a");
      link.href = url; link.download = `report-${job.id}.${format}`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { if (alive.current && !isAbort(error)) setError(errorMessage(error)); }
    finally { if (alive.current) setBusy(false); }
  }
  const quality = { ...job, reviewOutcome: job.reviewOutcome ?? job.reviewStatus ?? info?.reviewOutcome,
    synthesisOutcome: job.synthesisOutcome ?? job.synthesisStatus ?? info?.synthesisOutcome };
  const labels = qualityLabels(quality), readingInfo = !!job.report?.json && !job.reportExpired && !info && !infoError;
  return <div className="wb-reader"><h3>{job.query}</h3><dl className="wb-metadata"><div><dt>资料检索范围</dt><dd>本次选择：最近 {job.days} 天
      {info?.range ? <span className="wb-report-range">报告记录：<time dateTime={info.range.start}>{info.range.start}</time> 至 <time dateTime={info.range.end}>{info.range.end}</time>（北京时间）</span>
        : <span className="wb-report-range">{readingInfo ? "正在读取报告记录的起止日期…" : infoError ? "实际起止日期暂不可读取。" : "报告未提供实际起止日期。"}</span>}</dd></div>
    <div><dt>提交时刻</dt><dd>{dateText(job.createdAt)}</dd></div><div><dt>{job.status === "complete" ? "生成时刻" : "结束时刻"}</dt><dd>{dateText(job.completedAt)}</dd></div>
    <div><dt>审查状态</dt><dd>{reviewLabel(quality.reviewOutcome)}</dd></div><div><dt>证据与综合</dt><dd>{synthesisLabel(quality.synthesisOutcome)}</dd></div>
    <div><dt>文件到期</dt><dd>{dateText(job.reportExpiresAt)}</dd></div></dl>
    {job.status === "complete" && (labels.length > 0 || !!info?.issues.length) && <section className="wb-report-quality" aria-label="报告质量说明"><h4>报告中的质量说明</h4>
      {labels.length > 0 && <p>{labels.join(" · ")}</p>}
      {info?.issues.length ? <ul>{info.issues.map((issue, index) => <li key={index}>{issue.claim && <p>相关表述：{issue.claim}</p>}<p>{issue.reason}</p>{issue.sourceIds.length > 0 && <p className="wb-meta">来源编号：{issue.sourceIds.join("、")}</p>}</li>)}</ul>
        : <p className="wb-meta">{readingInfo ? "正在读取报告记录的说明…" : infoError ? "具体说明暂不可读取。" : "报告未提供具体问题或依据。"}</p>}
    </section>}
    {infoError && <Notice error>{infoError}<button onClick={() => setInfoAttempt((v) => v + 1)}>重新读取资料与质量说明</button></Notice>}
    {job.status !== "complete" ? <ResearchProgress job={job} /> : !!job.stageHistory?.length && <details className="wb-report-stages"><summary>执行阶段记录</summary><ol>{job.stageHistory.map((stage, index) => <li key={index}>{workbenchStageLabels[stage] ?? "阶段未提供"}</li>)}</ol></details>}
    {job.reportExpired ? <Notice>报告文件已到期。仍可在本研究中生成新的报告，其他报告继续保留。</Notice>
      : job.report ? <><div className="wb-actions" aria-label="报告格式下载">{(["html", "pdf", "json"] as const).map((format) => job.report?.[format] &&
        <button key={format} disabled={busy || !available} onClick={() => void download(format)}>下载 {format.toUpperCase()}</button>)}</div>
        {!job.report.pdf && <p className="wb-muted">PDF 暂不可用，HTML 仍可阅读和下载。</p>}
        {preview ? <iframe title="当前报告预览" src={preview} sandbox="allow-popups allow-popups-to-escape-sandbox" referrerPolicy="no-referrer" /> : !error && <Notice>正在读取报告正文…</Notice>}
      </> : <Notice>{pending(job) ? generationWait : job.status === "failed" ? "本次生成失败，请返回本研究查看重试操作。" : "尚无可用报告文件，请刷新记录或联系管理员。"}</Notice>}
    {error && <Notice error>{error}<button onClick={() => setAttempt((v) => v + 1)}>重新读取报告</button></Notice>}
  </div>;
}
