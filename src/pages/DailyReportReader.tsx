import { useEffect, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import ChapterIntro from "./ChapterIntro";
import { hasChapterIntro } from "./chapter-intros";
import InferenceFlow, { type FlowEntry } from "./InferenceFlow";
import ReportCounts from "./ReportCounts";
import { historyArchive, pipelineStatuses, reportAsset, type Catalog, type Report, type Version } from "./report-preview-data";

function Paragraph({ parts }: { parts: Report["intro"][number] }) {
  return (
    <p className="docx-paragraph">
      {parts.map((part, index) =>
        part.url ? (
          <a key={index} href={part.url} target="_blank" rel="noreferrer">{part.text}</a>
        ) : <span key={index}>{part.text}</span>,
      )}
    </p>
  );
}

function reportFlow(report: Report, version?: string): FlowEntry[] {
  return report.sections.flatMap((section) => section.key === "papers" ? [] : section.blocks.flatMap((block) => {
    if (block.kind !== "entry" || !block.workId) return [];
    const source = block.number.startsWith("A") ? "vLLM Ascend" : "vLLM";
    const query = new URLSearchParams({ section: block.number });
    if (version) query.set("version", version);
    return [{
      stage: section.key,
      id: block.workId,
      label: `${source} #${block.workId.split("#").at(-1)}`,
      title: block.title,
      to: { pathname: `/reports/${report.day}`, search: query.toString() },
    }];
  }));
}

export default function DailyReportReader({ catalog, days, day, version, result }: {
  catalog: Catalog;
  days: string[];
  day: string;
  version: Version;
  result?: { data?: Report; error?: string };
}) {
  const [query] = useSearchParams();
  const record = catalog.days[day];
  const report = result?.data;
  const flow = useMemo(() => report ? reportFlow(report, version.sha256) : [], [report, version.sha256]);
  const section = query.get("section");
  useEffect(() => {
    if (!report) return;
    const frame = requestAnimationFrame(() => {
      const target = section ? document.getElementById(section) : null;
      if (target) {
        target.scrollIntoView();
        target.querySelector<HTMLElement>("h2, h4")?.focus({ preventScroll: true });
      } else {
        window.scrollTo(0, 0);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [report, section]);
  if (result?.error) return <p role="alert">{result.error}。<Link to="/reports">返回日报档案</Link></p>;
  if (!report) return <p role="status">正在加载日报…</p>;
  if (report.day !== day || report.sha256 !== version.sha256) return <p role="alert">日报日期或版本与目录不一致。</p>;
  const position = days.indexOf(day);
  const reportLink = (anchor: string) => {
    const next = new URLSearchParams(query);
    next.set("section", anchor);
    return { pathname: `/reports/${day}`, search: next.toString() };
  };

  return (
    <>
      <header className="docx-heading">
        <time dateTime={day}>{day}</time>
        <h1>{report.title}</h1>
        <ReportCounts counts={report.counts} />
        {report.pipelineStatus && (
          <p className="docx-paragraph">
            系统日报 · {report.publicationStatus === "reviewed" ? "已复核发布" : "预览"}
            {" · "}{pipelineStatuses[report.pipelineStatus]}
          </p>
        )}
        <nav className="docx-actions" aria-label="日报操作">
          {days[position + 1] && <Link to={`/reports/${days[position + 1]}`}>← 上一期</Link>}
          {days[position - 1] && <Link to={`/reports/${days[position - 1]}`}>下一期 →</Link>}
          {report.original && <a href={reportAsset(report.original)} download={report.originalName}>下载 Word 原件</a>}
          {!report.pipelineStatus && !report.original && day >= "2026-10-23" && day <= "2026-11-08" && (
            <a href={historyArchive}>下载历史 Word 原件 ZIP</a>
          )}
        </nav>
        {record.versions.length > 1 && (
          <details>
            <summary>查看修订版本</summary>
            <ul>
              {record.versions.map((item, index) => (
                <li key={item.sha256}>
                  <Link to={`/reports/${day}?version=${item.sha256}`}>
                    第 {index + 1} 版 {item.sha256 === record.current ? "（当前版本）" : ""}
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        )}
      </header>
      <div className="docx-columns">
        <nav className="docx-toc" aria-label="日报目录">
          <strong>本期目录</strong>
          {report.sections.map((item) => (
            <Link key={item.key} to={reportLink(item.key)} aria-current={section === item.key ? "location" : undefined}>
              {item.title}
            </Link>
          ))}
        </nav>
        <article className="docx-article">
          {report.intro.map((parts, index) => <Paragraph key={index} parts={parts} />)}
          {report.sections.map((item) => (
            <section key={item.key} id={item.key}>
              <h2 tabIndex={-1}>{item.title}</h2>
              {hasChapterIntro(item.intro) && <ChapterIntro chapter={{
                day, version: version.sha256, stage: item.key, title: item.title, intro: item.intro,
                sources: [...new Set(item.blocks.flatMap((block) => block.kind === "entry" ? [block.workId?.split("#")[0] ?? "unknown"] : []))],
                workIds: item.blocks.flatMap((block) => block.kind === "entry" && block.workId ? [block.workId] : []),
              }} />}
              {item.key === "flow" && (
                <InferenceFlow key={version.sha256} entries={flow} />
              )}
              {item.figure && (
                <details className="docx-original-figure">
                  <summary>{report.pipelineStatus ? "查看系统生成的流程图" : "查看 Word 流程原图"}</summary>
                  <a className="docx-figure" href={reportAsset(item.figure)} target="_blank" rel="noreferrer">
                    <img src={reportAsset(item.figure)} alt="单个请求的推理主线与优化位置" loading="lazy" />
                  </a>
                </details>
              )}
              {item.blocks.map((block, index) => {
                if (block.kind === "paragraph") return block.chapterIntro && hasChapterIntro(item.intro) ? null : <Paragraph key={index} parts={block.parts} />;
                if (block.kind === "group") return <h3 key={index}>{block.title}</h3>;
                return (
                  <section className="docx-entry" key={block.number} id={block.number}>
                    <h4 tabIndex={-1}><Link to={reportLink(block.number)}>{block.number} {block.brief ? "短讯 " : ""}{block.title}</Link></h4>
                    {(block.needsReview || block.provisionalLocation || block.titlePending) && (
                      <p className="docx-paragraph">
                        {[
                          block.needsReview && "系统标记待核对",
                          block.provisionalLocation && "暂列此环节",
                          block.titlePending && "中文标题待补",
                        ].filter(Boolean).join(" · ")}
                      </p>
                    )}
                    {block.paragraphs.map((parts, i) => <Paragraph key={i} parts={parts} />)}
                  </section>
                );
              })}
            </section>
          ))}
          {report.warnings.length > 0 && (
            <details>
              <summary>导入待核对项</summary>
              <ul>{report.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul>
            </details>
          )}
        </article>
      </div>
    </>
  );
}
