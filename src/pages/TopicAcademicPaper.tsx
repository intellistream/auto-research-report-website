import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Download } from "lucide-react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import TopicDetailLayout from "./TopicDetailLayout";
import TopicDirectoryCard from "./TopicDirectoryCard";
import type { Topic } from "./TopicPages";
import { academicPaperHeadings, academicPaperHrefs, parsePaperSectionParam, revealPaperHeading, revealPendingPaperSection, type AcademicPaper } from "./academic-paper";
import "./topic-academic-paper.css";

export function AcademicPaperCard({ topic, paper }: { topic: Topic; paper: AcademicPaper }) {
  if (!academicPaperHrefs(topic.id, paper)) {
    return <TopicDirectoryCard title={topic.title} status="学术综述稿" description="论文版本元数据无效，等待修正。" />;
  }
  return (
    <TopicDirectoryCard
      title={paper.title}
      description={paper.abstract}
      path={`/topics/${topic.id}`}
      status="学术综述稿"
      summary={<time dateTime={paper.literatureCutoff}>{paper.literatureCutoff}</time>}
      detail={`关键词：${paper.keywords.join("；")}`}
      repositories={topic.counts.byRepository}
      sections={[{ label: "阅读论文全文" }]}
    />
  );
}

export default function TopicAcademicPaper({ topic, paper, embedded = false, reportAvailable = Boolean(topic.report) }: { topic: Topic; paper: AcademicPaper; embedded?: boolean; reportAvailable?: boolean }) {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const targetSection = parsePaperSectionParam(searchParams);
  const requestKey = targetSection ? `${paper.version}:${location.key}:${targetSection}` : "";
  const hrefs = academicPaperHrefs(topic.id, paper);
  const frame = useRef<HTMLIFrameElement>(null);
  const observer = useRef<ResizeObserver | null>(null);
  const lastRevealedKey = useRef<string | null>(null);
  const [frameReady, setFrameReady] = useState(false);
  const [headings, setHeadings] = useState<{ id: string; title: string }[]>([]);
  const [height, setHeight] = useState(1000);
  function alignFrameHeading(id: string, reducedMotion: boolean) {
    const iframe = frame.current;
    const doc = iframe?.contentDocument;
    const heading = doc?.getElementById(id);
    if (iframe && doc && heading && /^H[1234]$/.test(heading.tagName)) {
      const headerOffset = 84;
      const iframeScrollY = doc.defaultView?.scrollY ?? 0;
      const targetTop = Math.max(0, window.scrollY + iframe.getBoundingClientRect().top + heading.getBoundingClientRect().top + iframeScrollY - headerOffset);
      window.scrollTo({ top: targetTop, behavior: reducedMotion ? "instant" : "smooth" });
    }
  }
  useEffect(() => () => observer.current?.disconnect(), []);
  useEffect(() => {
    if (!targetSection) {
      lastRevealedKey.current = null;
      return;
    }
    if (!frameReady || !headings.length || lastRevealedKey.current === requestKey) return;
    // Wait for React to commit the iframe height and the browser to lay it out.
    let raf2: number | undefined;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const result = revealPendingPaperSection({
          doc: frame.current?.contentDocument,
          targetSection,
          frameReady,
          lastRevealedKey: lastRevealedKey.current,
          requestKey,
          reducedMotion,
        });
        if (result.revealed) alignFrameHeading(targetSection, reducedMotion);
        lastRevealedKey.current = result.nextRevealedKey;
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      if (raf2 !== undefined) cancelAnimationFrame(raf2);
    };
  }, [frameReady, headings, height, requestKey, targetSection]);
  function loaded() {
    setFrameReady(false);
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
      setFrameReady(true);
      if (typeof ResizeObserver !== "undefined" && doc.body) {
        observer.current = new ResizeObserver(resize);
        observer.current.observe(doc.body);
      }
    } catch { /* The ordinary full-text link remains available if frame inspection fails. */ }
  }
  function revealSection(id: string) {
    const doc = frame.current?.contentDocument;
    if (!doc) return false;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const revealed = revealPaperHeading(doc, id, reducedMotion);
    if (revealed) alignFrameHeading(id, reducedMotion);
    return revealed;
  }

  const FulltextHeading = embedded ? "h3" : "h2";
  const contents = hrefs ? (
    <div className="academic-paper-page" data-target-section={targetSection ?? undefined}>
      <header className="topic-heading academic-paper-heading">
        <p className="topic-meta">资料截止 <time dateTime={paper.literatureCutoff}>{paper.literatureCutoff}</time></p>
        {embedded && <h2>{paper.title}</h2>}
        <div className="academic-paper-downloads">
          <a href={hrefs.pdf} download={`${topic.id}-${paper.version.slice(0, 12)}.pdf`}><Download size={16} aria-hidden="true" /> 下载同版 PDF</a>
          {hrefs.word && <a href={hrefs.word} download={`${topic.id}-${paper.manuscriptRevision}.docx`}><Download size={16} aria-hidden="true" /> 下载 Word</a>}
          <button type="button" onClick={() => revealPaperHeading(document, "academic-paper-fulltext", window.matchMedia("(prefers-reduced-motion: reduce)").matches)}>跳到完整正文 <span aria-hidden="true">↓</span></button>
        </div>
      </header>

      <section className="academic-paper-fulltext" aria-labelledby="academic-paper-fulltext">
        <div className="academic-paper-fulltext-heading">
          <FulltextHeading id="academic-paper-fulltext">完整正文</FulltextHeading>
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
  ) : (
    <p role="alert">论文版本元数据无效，无法读取此稿。{embedded && <Link to="/topics">返回专题目录</Link>}</p>
  );
  return embedded ? contents : (
    <TopicDetailLayout
      title={hrefs ? paper.title : topic.title}
      subtitle={topic.description}
      sections={[
        { label: "学术综述稿", to: { search: "view=paper" }, current: "page" },
        ...(reportAvailable ? [{ label: "动态报告", to: { search: "view=report" } }] : []),
      ]}
    >
      {contents}
    </TopicDetailLayout>
  );
}
