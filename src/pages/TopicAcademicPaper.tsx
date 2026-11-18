import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowUpRight, Download } from "lucide-react";
import { Link } from "react-router-dom";
import type { Topic } from "./TopicPages";
import { academicPaperHeadings, academicPaperHrefs, revealPaperHeading, type AcademicPaper } from "./academic-paper";
import AclGraphSurveyMap from "./AclGraphSurveyMap";
import "./topic-academic-paper.css";

export function AcademicPaperCard({ topic, paper }: { topic: Topic; paper: AcademicPaper }) {
  if (!academicPaperHrefs(topic.id, paper)) return <li className="topic-card"><h2>{topic.title}</h2><p>论文版本元数据无效，等待修正。</p></li>;
  const route = `/topics/${topic.id}`;
  return <li className="topic-card survey-directory-card">
    <div className="survey-card-top">
      <span className="survey-status">学术综述稿</span>
      <time className="topic-meta" dateTime={paper.literatureCutoff}>{paper.literatureCutoff}</time>
    </div>
    <h2><Link to={route}>{paper.title} <ArrowUpRight size={16} /></Link></h2>
    <p className="survey-card-abstract">{paper.abstract}</p>
    <div className="survey-card-question"><span>关键词</span><p>{paper.keywords.join("；")}</p></div>
    <div className="survey-card-bottom"><Link to={route} className="survey-read-link">阅读论文全文 <ArrowUpRight size={14} /></Link></div>
  </li>;
}

export default function TopicAcademicPaper({ topic, paper, embedded = false }: { topic: Topic; paper: AcademicPaper; embedded?: boolean }) {
  const hrefs = academicPaperHrefs(topic.id, paper);
  const frame = useRef<HTMLIFrameElement>(null);
  const observer = useRef<ResizeObserver | null>(null);
  const [headings, setHeadings] = useState<{ id: string; title: string }[]>([]);
  const [height, setHeight] = useState(1000);
  useEffect(() => () => observer.current?.disconnect(), []);
  function loaded() {
    observer.current?.disconnect();
    setHeadings([]);
    try {
      const doc = frame.current?.contentDocument;
      if (!doc || !hrefs || new URL(doc.URL).href !== new URL(hrefs.html, window.location.href).href) return;
      setHeadings(academicPaperHeadings(doc));
      const resize = () => {
        const body = doc.body;
        const style = doc.defaultView?.getComputedStyle(body);
        const margins = style ? (parseFloat(style.marginTop) || 0) + (parseFloat(style.marginBottom) || 0) : 0;
        setHeight(Math.max(800, Math.ceil(body.getBoundingClientRect().height + margins)));
      };
      resize();
      if (typeof ResizeObserver !== "undefined" && doc.body) {
        observer.current = new ResizeObserver(resize);
        observer.current.observe(doc.body);
      }
    } catch { /* The ordinary full-text link remains available if frame inspection fails. */ }
  }
  function revealSection(id: string) {
    const doc = frame.current?.contentDocument;
    return doc ? revealPaperHeading(doc, id, window.matchMedia("(prefers-reduced-motion: reduce)").matches) : false;
  }

  if (!hrefs) {
    return <p role="alert">论文版本元数据无效，无法读取此稿。<Link to="/topics">返回专题目录</Link></p>;
  }
  const Title = embedded ? "h2" : "h1";
  const showMap = topic.id === "aclgraph" && !!topic.report;

  return (
    <div className="academic-paper-page">
      {!embedded && <Link className="topic-back" to="/topics"><ArrowLeft size={16} aria-hidden="true" /> 专题目录</Link>}
      <header className="topic-heading academic-paper-heading">
        <p className="topic-meta">资料截止 <time dateTime={paper.literatureCutoff}>{paper.literatureCutoff}</time></p>
        <Title>{paper.title}</Title>
        <div className="academic-paper-downloads">
          <a href={hrefs.pdf} download={`${topic.id}-${paper.version.slice(0, 12)}.pdf`}><Download size={16} aria-hidden="true" /> 下载同版 PDF</a>
          <button type="button" onClick={() => revealPaperHeading(document, "academic-paper-fulltext", window.matchMedia("(prefers-reduced-motion: reduce)").matches)}>跳到完整正文 <span aria-hidden="true">↓</span></button>
          {!embedded && topic.report && <Link to={{ search: "view=report" }}>查看动态报告</Link>}
        </div>
      </header>

      {showMap && <AclGraphSurveyMap topic={topic} htmlHref={hrefs.html} revealSection={revealSection} />}

      <section className="academic-paper-fulltext" aria-labelledby="academic-paper-fulltext">
        <div className="academic-paper-fulltext-heading">
          <h3 id="academic-paper-fulltext">完整正文</h3>
          <a href={hrefs.html} target="_blank" rel="noreferrer">独立打开 HTML 全文 <ArrowUpRight size={14} aria-hidden="true" /></a>
        </div>
        <details className="academic-paper-abstract">
          <summary>摘要与关键词</summary>
          <p lang="en">{paper.titleEn}</p>
          <p>{paper.abstract}</p>
          <p>关键词 {paper.keywords.join("、")}</p>
        </details>
        <details className="academic-paper-sources">
          <summary>可编辑源码与冻结清单</summary>
          <div className="topic-links">
            <a href={hrefs.latex} download>LaTeX</a>
            <a href={hrefs.bibtex} download>BibTeX</a>
            <a href={hrefs.markdown} download>Markdown</a>
            <a href={hrefs.sources} download>源码 ZIP（含重建说明）</a>
            <a href={hrefs.manifest} target="_blank" rel="noreferrer">版本与校验清单</a>
          </div>
          <p>稿件修订 {paper.manuscriptRevision}</p>
          <code>{paper.version}</code>
        </details>
        <div className="academic-paper-layout">
          {!!headings.length && (
            <nav aria-label="论文目录">
              <details open>
                <summary>论文目录</summary>
                {headings.map((heading) => (
                  <button type="button" key={heading.id} onClick={() => revealSection(heading.id)}>{heading.title}</button>
                ))}
              </details>
            </nav>
          )}
          <iframe
            key={paper.version}
            ref={frame}
            src={hrefs.html}
            title={`${paper.title} — 论文全文`}
            sandbox="allow-same-origin"
            referrerPolicy="no-referrer"
            onLoad={loaded}
            style={{ height }}
          />
        </div>
      </section>
    </div>
  );
}
