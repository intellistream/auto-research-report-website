import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowUpRight, Download } from "lucide-react";
import { Link } from "react-router-dom";
import type { Topic } from "./TopicPages";
import { academicPaperHeadings, academicPaperHrefs, revealPaperHeading, type AcademicPaper } from "./academic-paper";
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
  if (!hrefs) return <p role="alert">论文版本元数据无效，无法读取此稿。<Link to="/topics">返回专题目录</Link></p>;
  const Title = embedded ? "h2" : "h1";
  return <div className="academic-paper-page">
    {!embedded && <Link className="topic-back" to="/topics"><ArrowLeft size={16} /> 专题目录</Link>}
    <header className="topic-heading"><p className="topic-meta">学术综述稿 · 资料截止 <time dateTime={paper.literatureCutoff}>{paper.literatureCutoff}</time> · 稿件修订 {paper.manuscriptRevision}</p><Title>{paper.title}</Title><p lang="en">{paper.titleEn}</p>
      <div className="academic-paper-downloads"><a href={hrefs.pdf} download={`${topic.id}-${paper.version.slice(0, 12)}.pdf`}><Download size={16} /> 下载同版 PDF</a>{!embedded && topic.report && <Link to={{ search: "view=report" }}>查看动态报告</Link>}<a href={hrefs.html} target="_blank" rel="noreferrer">独立打开 HTML 全文 <ArrowUpRight size={14} /></a></div>
      <details className="academic-paper-sources"><summary>可编辑源码与冻结清单</summary><div className="topic-links"><a href={hrefs.latex} download>LaTeX</a><a href={hrefs.bibtex} download>BibTeX</a><a href={hrefs.markdown} download>Markdown</a><a href={hrefs.sources} download>源码 ZIP（含重建说明）</a><a href={hrefs.manifest} target="_blank" rel="noreferrer">版本与校验清单</a></div><code>{paper.version}</code></details>
      <details className="academic-paper-abstract"><summary>摘要与关键词</summary><p>{paper.abstract}</p><p>关键词：{paper.keywords.join("；")}</p></details>
    </header>
    <div className="academic-paper-layout">{!!headings.length && <nav aria-label="论文目录"><details open><summary>论文目录</summary>{headings.map((heading) => <button key={heading.id} onClick={() => { const doc = frame.current?.contentDocument; if (doc) revealPaperHeading(doc, heading.id, window.matchMedia("(prefers-reduced-motion: reduce)").matches); }}>{heading.title}</button>)}</details></nav>}
      <iframe key={paper.version} ref={frame} src={hrefs.html} title={`${paper.title} — 论文全文`} sandbox="allow-same-origin" referrerPolicy="no-referrer" onLoad={loaded} style={{ height }} />
    </div>
    <p className="topic-meta">全文包含论文自身的公式、图表与参考文献。若嵌入阅读不可用，可使用上方 HTML 全文链接或同版 PDF。</p>
  </div>;
}
