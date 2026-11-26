import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BookOpen,
  Check,
  ChevronDown,
  Download,
  ExternalLink,
  Link2,
  ListTree,
  RotateCcw,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import ChapterIntro from "./ChapterIntro";
import { hasChapterIntro } from "./chapter-intros";
import InferenceFlow, { type FlowEntry } from "./InferenceFlow";
import ReportCounts from "./ReportCounts";
import {
  historyArchive,
  pipelineStatuses,
  reportAsset,
  type Catalog,
  type Report,
  type Version,
} from "./report-preview-data";
import "../views/reader.css";

type Part = Report["intro"][number][number];

function RichParts({ parts }: { parts: Part[] }) {
  return (
    <>
      {parts.map((part, index) =>
        part.url ? (
          <a key={index} className="reader-inline-link" href={part.url} target="_blank" rel="noreferrer">
            {part.text}
            <ExternalLink size={12} aria-hidden />
          </a>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </>
  );
}

function Paragraph({ parts, className = "docx-paragraph" }: { parts: Part[]; className?: string }) {
  return (
    <p className={className}>
      <RichParts parts={parts} />
    </p>
  );
}

type ParsedRow =
  | { kind: "labeled"; tag: string; tone: "problem" | "method" | "effect"; parts: Part[] }
  | { kind: "source"; parts: Part[] }
  | { kind: "plain"; parts: Part[] };

function parseEntryParagraph(parts: Part[]): ParsedRow {
  if (!parts.length) return { kind: "plain", parts };
  const first = parts[0];
  if (first.url) return { kind: "plain", parts };

  const patterns: { regex: RegExp; tag: string; tone: "problem" | "method" | "effect" }[] = [
    { regex: /^(问题|背景与问题)[：:]\s*/, tag: "问题", tone: "problem" },
    { regex: /^(优化方法|核心方法|方法)[：:]\s*/, tag: "方法", tone: "method" },
    { regex: /^(效果与边界|实验与边界|效果)[：:]\s*/, tag: "边界", tone: "effect" },
  ];

  for (const { regex, tag, tone } of patterns) {
    const match = first.text.match(regex);
    if (match) {
      const restText = first.text.slice(match[0].length);
      const nextParts = restText ? [{ ...first, text: restText }, ...parts.slice(1)] : parts.slice(1);
      return { kind: "labeled", tag, tone, parts: nextParts };
    }
  }

  const sourceMatch = first.text.match(/^(来源|参考来源)[：:]\s*/);
  if (sourceMatch) {
    const restText = first.text.slice(sourceMatch[0].length);
    const nextParts = restText ? [{ ...first, text: restText }, ...parts.slice(1)] : parts.slice(1);
    return { kind: "source", parts: nextParts };
  }

  return { kind: "plain", parts };
}

function entrySourceKind(number: string, workId?: string): "vllm" | "ascend" | "paper" {
  if (number.startsWith("P") || workId?.startsWith("arxiv:")) return "paper";
  if (number.startsWith("A") || workId?.includes("vllm-ascend")) return "ascend";
  return "vllm";
}

function stripLeadingIndex(title: string) {
  return title.replace(/^[一二三四五六七八九十百]+[、\s]+/, "");
}

function reportFlow(report: Report, version?: string): FlowEntry[] {
  return report.sections.flatMap((section) =>
    section.key === "papers"
      ? []
      : section.blocks.flatMap((block) => {
        if (block.kind !== "entry" || !block.workId) return [];
        const source = block.number.startsWith("A") ? "vLLM Ascend" : "vLLM";
        const query = new URLSearchParams({ section: block.number });
        if (version) query.set("version", version);
        return [
          {
            stage: section.key,
            id: block.workId,
            label: `${source} #${block.workId.split("#").at(-1)}`,
            title: block.title,
            to: { pathname: `/reports/${report.day}`, search: query.toString() },
          },
        ];
      }),
  );
}

export default function DailyReportReader({
  catalog,
  days,
  day,
  version,
  result,
}: {
  catalog: Catalog;
  days: string[];
  day: string;
  version: Version;
  result?: { data?: Report; error?: string };
}) {
  const [query] = useSearchParams();
  const record = catalog.days[day];
  const report = result?.data;
  const flow = useMemo(() => (report ? reportFlow(report, version.sha256) : []), [report, version.sha256]);
  const section = query.get("section");

  const [sourceFilter, setSourceFilter] = useState<"" | "vllm" | "ascend" | "paper">("");
  const [searchTerm, setSearchTerm] = useState("");
  const [activeSection, setActiveSection] = useState<string>("");
  const [tocMobileOpen, setTocMobileOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string>("");
  const [scrollProgress, setScrollProgress] = useState(0);
  const articleRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setSourceFilter("");
    setSearchTerm("");
    setTocMobileOpen(false);
  }, [day, version.sha256]);

  useEffect(() => {
    if (!report) return;
    const frame = requestAnimationFrame(() => {
      const target = section ? document.getElementById(section) : null;
      if (target) {
        target.scrollIntoView({ block: "start" });
        target.querySelector<HTMLElement>("h2, h4")?.focus({ preventScroll: true });
      } else {
        window.scrollTo(0, 0);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [report, section]);

  // ScrollSpy & Reading Progress
  useEffect(() => {
    if (!report) return;
    const onScroll = () => {
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      setScrollProgress(docHeight > 0 ? Math.min(100, Math.max(0, (window.scrollY / docHeight) * 100)) : 0);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    if (typeof IntersectionObserver === "undefined") {
      return () => window.removeEventListener("scroll", onScroll);
    }

    const elements = report.sections
      .map((s) => document.getElementById(s.key))
      .filter((el): el is HTMLElement => Boolean(el));

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveSection(visible[0].target.id);
      },
      { rootMargin: "-80px 0px -68% 0px", threshold: 0 },
    );
    for (const el of elements) observer.observe(el);

    return () => {
      window.removeEventListener("scroll", onScroll);
      observer.disconnect();
    };
  }, [report]);

  if (result?.error) {
    return (
      <div className="reader-state-box error" role="alert">
        <p>{result.error}。</p>
        <Link className="docx-secondary" to="/reports">
          返回日报档案
        </Link>
      </div>
    );
  }
  if (!report) return <p className="reader-loading" role="status">正在加载日报正文…</p>;
  if (report.day !== day || report.sha256 !== version.sha256) {
    return <p className="reader-state-box error" role="alert">日报日期或版本与目录不一致。</p>;
  }

  const position = days.indexOf(day);
  const prevDay = days[position + 1];
  const nextDay = days[position - 1];

  const reportLink = (anchor: string) => {
    const next = new URLSearchParams(query);
    next.set("section", anchor);
    return { pathname: `/reports/${day}`, search: next.toString() };
  };

  const needle = searchTerm.trim().toLowerCase().replace(/^#\s*/, "");
  const isFiltering = Boolean(sourceFilter || needle);

  const entryMatch = (block: Extract<Report["sections"][number]["blocks"][number], { kind: "entry" }>) => {
    const kind = entrySourceKind(block.number, block.workId);
    if (sourceFilter && kind !== sourceFilter) return false;
    if (!needle) return true;
    const textBody = block.paragraphs.flatMap((p) => p.map((x) => x.text)).join(" ");
    return `${block.number} ${block.title} ${block.workId ?? ""} ${textBody}`.toLowerCase().includes(needle);
  };

  const allEntries = report.sections.flatMap((s) =>
    s.blocks.filter((b): b is Extract<typeof b, { kind: "entry" }> => b.kind === "entry"),
  );
  const matchedEntryCount = isFiltering ? allEntries.filter(entryMatch).length : allEntries.length;

  function copyAnchorLink(anchor: string) {
    const url = new URL(window.location.href);
    const hashBase = `#/reports/${day}`;
    const sp = new URLSearchParams(query);
    sp.set("section", anchor);
    url.hash = `${hashBase}?${sp.toString()}`;
    navigator.clipboard?.writeText(url.toString()).then(() => {
      setCopiedId(anchor);
      window.setTimeout(() => setCopiedId((curr) => (curr === anchor ? "" : curr)), 1800);
    });
  }

  const currentHighlightedSection = activeSection || section || report.sections[0]?.key;

  return (
    <div className="reader-v3">
      <div className="reader-progress-track" aria-hidden="true">
        <span style={{ width: `${scrollProgress}%` }} />
      </div>

      {/* Issue Masthead */}
      <header className="docx-heading reader-masthead">
        <div className="reader-masthead-top">
          <Link className="reader-back-link" to="/reports">
            <ArrowLeft size={15} aria-hidden /> 日报档案
          </Link>

          <nav className="reader-issue-stepper" aria-label="相邻期次切换">
            {prevDay && (
              <Link className="stepper-btn" to={`/reports/${prevDay}`} title={`上一期：${prevDay}`}>
                <ArrowLeft size={14} aria-hidden /> 上一期 · {prevDay.slice(5)}
              </Link>
            )}
            {nextDay && (
              <Link className="stepper-btn" to={`/reports/${nextDay}`} title={`下一期：${nextDay}`}>
                下一期 · {nextDay.slice(5)} <ArrowRight size={14} aria-hidden />
              </Link>
            )}
          </nav>
        </div>

        <div className="reader-title-block">
          <div className="reader-meta-badges">
            <time className="reader-date-pill" dateTime={day}>
              {day}
            </time>
            {report.pipelineStatus ? (
              <span className="reader-status-pill">
                系统日报 · {report.publicationStatus === "reviewed" ? "已复核发布" : "预览"} ·{" "}
                {report.sourceReview
                  ? report.sections.some((item) => item.blocks.some((block) => block.kind === "entry" && block.needsReview))
                    ? "仍有条目待补证据" : "待核对项已核完"
                  : pipelineStatuses[report.pipelineStatus]}
              </span>
            ) : (
              <span className="reader-status-pill subtle">历史归档研报</span>
            )}
          </div>

          <h1>{report.title}</h1>

          {report.intro.length > 0 && (
            <div className="reader-intro-deck">
              {report.intro.map((parts, index) => (
                <Paragraph key={index} parts={parts} className="reader-deck-line" />
              ))}
            </div>
          )}

          <div className="reader-counts-and-downloads">
            <ReportCounts counts={report.counts} />

            <div className="docx-actions reader-download-group">
              {report.original && (
                <a className="docx-secondary" href={reportAsset(report.original)} download={report.originalName}>
                  <Download size={15} aria-hidden /> 下载 Word 原件
                </a>
              )}
              {!report.pipelineStatus && !report.original && day >= "2026-10-23" && day <= "2026-11-08" && (
                <a className="docx-secondary" href={historyArchive}>
                  <Download size={15} aria-hidden /> 下载历史 Word 原件 ZIP
                </a>
              )}
              {record.versions.length > 1 && (
                <details className="reader-version-dropdown">
                  <summary className="docx-secondary">
                    修订版本 ({record.versions.length}) <ChevronDown size={14} aria-hidden />
                  </summary>
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
            </div>
          </div>
        </div>
      </header>

      {/* In-Report Entry Filter & Search Bar */}
      <div className="reader-filter-bar" role="region" aria-label="本期条目快速筛选">
        <div className="segmented-pills" role="group" aria-label="按来源筛选本期条目">
          {(
            [
              ["", `全部 (${allEntries.length})`],
              ["vllm", `vLLM (${report.counts.upstream})`],
              ["ascend", `Ascend (${report.counts.ascend})`],
              ...(report.counts.papers > 0 ? ([["paper", `论文 (${report.counts.papers})`]] as const) : []),
            ] as const
          ).map(([key, label]) => (
            <button
              key={key || "all"}
              type="button"
              aria-pressed={sourceFilter === key}
              className={sourceFilter === key ? "pill-btn active" : "pill-btn"}
              onClick={() => setSourceFilter(key as typeof sourceFilter)}
            >
              {label}
            </button>
          ))}
        </div>

        <label className="reader-inline-search">
          <Search size={15} aria-hidden />
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="在本期正文中检索算子、模型、PR 编号…"
            aria-label="在本期正文中检索"
            autoComplete="off"
          />
          {searchTerm && (
            <button
              type="button"
              className="archive-clear-input"
              aria-label="清空页内搜索"
              onClick={() => setSearchTerm("")}
            >
              <X size={13} />
            </button>
          )}
        </label>

        {isFiltering && (
          <div className="reader-filter-status" role="status">
            <span>
              命中 <strong>{matchedEntryCount}</strong> / {allEntries.length} 条
            </span>
            <button
              type="button"
              className="filter-reset-btn"
              onClick={() => {
                setSourceFilter("");
                setSearchTerm("");
              }}
            >
              <RotateCcw size={12} aria-hidden /> 重置
            </button>
          </div>
        )}
      </div>

      {/* Main 2-Column Reader Workspace */}
      <div className="docx-columns reader-columns">
        <aside className="reader-toc-wrap">
          <button
            type="button"
            className="reader-toc-mobile-btn"
            aria-expanded={tocMobileOpen}
            onClick={() => setTocMobileOpen((v) => !v)}
          >
            <ListTree size={16} aria-hidden />
            <span>本期章节目录（{report.sections.length} 章）</span>
            <ChevronDown size={15} aria-hidden />
          </button>

          <nav
            className={tocMobileOpen ? "docx-toc reader-toc open" : "docx-toc reader-toc"}
            aria-label="日报目录"
          >
            <div className="reader-toc-header">
              <BookOpen size={14} aria-hidden />
              <strong>本期目录</strong>
            </div>

            {report.sections.map((item, idx) => {
              const sectionEntries = item.blocks.filter((b) => b.kind === "entry").length;
              const isCurrent = currentHighlightedSection === item.key;
              return (
                <Link
                  key={item.key}
                  to={reportLink(item.key)}
                  aria-current={isCurrent ? "location" : undefined}
                  onClick={() => setTocMobileOpen(false)}
                >
                  <span className="toc-index">{String(idx + 1).padStart(2, "0")}</span>
                  <span className="toc-text">{stripLeadingIndex(item.title)}</span>
                  {sectionEntries > 0 && <small className="toc-count">{sectionEntries}</small>}
                </Link>
              );
            })}
          </nav>
        </aside>

        <article className="docx-article reader-article" ref={articleRef}>
          {report.sections.map((item, sectionIndex) => {
            const entryBlocks = item.blocks.filter(
              (b): b is Extract<typeof b, { kind: "entry" }> => b.kind === "entry",
            );
            const visibleEntries = isFiltering ? entryBlocks.filter(entryMatch) : entryBlocks;

            // Hide empty content chapters when filtering entries, keeping summary & flow visible if not searching
            if (isFiltering && item.key !== "summary" && item.key !== "flow" && visibleEntries.length === 0) {
              return null;
            }

            const isSummary = item.key === "summary";

            return (
              <section
                key={item.key}
                id={item.key}
                className={isSummary ? "reader-section reader-summary-section" : "reader-section"}
              >
                <div className="reader-section-head">
                  <span className="reader-section-num">
                    {isSummary ? <Sparkles size={13} aria-hidden /> : null}
                    CHAPTER {String(sectionIndex + 1).padStart(2, "0")}
                  </span>
                  <h2 tabIndex={-1}>{item.title}</h2>
                </div>

                {hasChapterIntro(item.intro) && (
                  <div className="reader-chapter-focus">
                    <ChapterIntro
                      chapter={{
                        day,
                        version: version.sha256,
                        stage: item.key,
                        title: item.title,
                        intro: item.intro,
                        sources: [
                          ...new Set(
                            item.blocks.flatMap((block) =>
                              block.kind === "entry" ? [block.workId?.split("#")[0] ?? "unknown"] : [],
                            ),
                          ),
                        ],
                        workIds: item.blocks.flatMap((block) =>
                          block.kind === "entry" && block.workId ? [block.workId] : [],
                        ),
                      }}
                    />
                  </div>
                )}

                {item.key === "flow" && <InferenceFlow key={version.sha256} entries={flow} />}

                {item.figure && (
                  <details className="docx-original-figure reader-figure-drawer">
                    <summary>{report.pipelineStatus ? "查看系统生成的流程图" : "查看 Word 流程原图"}</summary>
                    <a className="docx-figure" href={reportAsset(item.figure)} target="_blank" rel="noreferrer">
                      <img src={reportAsset(item.figure)} alt="单个请求的推理主线与优化位置" loading="lazy" />
                    </a>
                  </details>
                )}

                {isSummary ? (
                  <div className="reader-summary-callout">
                    {item.blocks.map((block, index) =>
                      block.kind === "paragraph" ? <Paragraph key={index} parts={block.parts} /> : null,
                    )}
                  </div>
                ) : (
                  item.blocks.map((block, index) => {
                    if (block.kind === "paragraph") {
                      if (isFiltering) return null;
                      return block.chapterIntro && hasChapterIntro(item.intro) ? null : (
                        <Paragraph key={index} parts={block.parts} className="docx-paragraph reader-lead-para" />
                      );
                    }
                    if (block.kind === "group") {
                      if (isFiltering) return null;
                      return (
                        <h3 key={index} className="reader-group-heading">
                          {block.title}
                        </h3>
                      );
                    }

                    if (isFiltering && !entryMatch(block)) return null;

                    const sourceTone = entrySourceKind(block.number, block.workId);
                    const parsedRows = block.paragraphs.map(parseEntryParagraph);
                    const bodyRows = parsedRows.filter((r) => r.kind !== "source");
                    const sourceRows = parsedRows.filter((r): r is Extract<ParsedRow, { kind: "source" }> => r.kind === "source");
                    const flags = [
                      block.needsReview && "系统标记待核对",
                      block.provisionalLocation && "暂列此环节",
                      block.titlePending && "中文标题待补",
                    ].filter(Boolean) as string[];

                    return (
                      <section
                        className={`docx-entry reader-entry-card tone-${sourceTone}`}
                        key={block.number}
                        id={block.number}
                      >
                        <header className="reader-entry-header">
                          <span className={`entry-num-badge tone-${sourceTone}`}>{block.number}</span>
                          {block.brief && <span className="entry-brief-pill">短讯</span>}
                          <h4 tabIndex={-1}>
                            <Link to={reportLink(block.number)}>{block.title}</Link>
                          </h4>
                          <button
                            type="button"
                            className="entry-copy-anchor"
                            onClick={() => copyAnchorLink(block.number)}
                            aria-label={`复制条目 ${block.number} 链接`}
                            title="复制此条目直达链接"
                          >
                            {copiedId === block.number ? <Check size={14} aria-hidden /> : <Link2 size={14} aria-hidden />}
                          </button>
                        </header>

                        {flags.length > 0 && (
                          <div className="entry-warning-chips">
                            {flags.map((flag) => (
                              <span key={flag} className="entry-warn-chip">
                                {flag}
                              </span>
                            ))}
                          </div>
                        )}

                        <div className="reader-entry-body">
                          {bodyRows.map((row, rIdx) =>
                            row.kind === "labeled" ? (
                              <div key={rIdx} className="entry-anatomy-row">
                                <span className={`anatomy-tag tone-${row.tone}`}>{row.tag}</span>
                                <p className="docx-paragraph anatomy-text">
                                  <RichParts parts={row.parts} />
                                </p>
                              </div>
                            ) : (
                              <Paragraph key={rIdx} parts={row.parts} />
                            ),
                          )}
                        </div>

                        {block.sourceReview && (
                          <details className="reader-source-review">
                            <summary>
                              {block.sourceReview.status === "corrected" ? "专家修订后通过" :
                                block.sourceReview.status === "passed" ? "专家核对通过" : "核对后仍待补证据"}
                              {" · "}{block.sourceReview.reviewedAt.slice(0, 10)}
                            </summary>
                            <p>{block.sourceReview.summary}</p>
                            <p>审核：{block.sourceReview.reviewer}</p>
                            <div className="source-foot-links">
                              {block.sourceReview.sources.map((url, index) => (
                                <RichParts key={url} parts={[{ text: `核对依据 ${index + 1}`, url }]} />
                              ))}
                            </div>
                          </details>
                        )}

                        {sourceRows.length > 0 && (
                          <footer className="reader-entry-sources">
                            <span className="source-foot-label">原始来源</span>
                            <div className="source-foot-links">
                              {sourceRows.map((row, sIdx) => (
                                <span key={sIdx}>
                                  <RichParts parts={row.parts} />
                                </span>
                              ))}
                            </div>
                          </footer>
                        )}
                      </section>
                    );
                  })
                )}
              </section>
            );
          })}

          {isFiltering && matchedEntryCount === 0 && (
            <div className="reader-state-box">
              <p>本期日报中没有匹配当前筛选条件的条目。</p>
              <button
                type="button"
                className="docx-secondary"
                onClick={() => {
                  setSourceFilter("");
                  setSearchTerm("");
                }}
              >
                显示本期全部内容
              </button>
            </div>
          )}

          {report.warnings.length > 0 && (
            <details className="reader-warnings-drawer">
              <summary>导入待核对项（{report.warnings.length}）</summary>
              <ul>
                {report.warnings.map((warning, i) => (
                  <li key={i}>{warning}</li>
                ))}
              </ul>
            </details>
          )}

          {/* Bottom Issue Pagination */}
          <footer className="reader-bottom-nav" aria-label="报告底部翻页">
            <div className="reader-bottom-cards">
              {prevDay ? (
                <Link className="bottom-nav-card" to={`/reports/${prevDay}`}>
                  <span>← 上一期日报</span>
                  <strong>{prevDay}</strong>
                </Link>
              ) : (
                <Link className="bottom-nav-card" to="/reports">
                  <span>← 返回列表</span>
                  <strong>全部日报档案</strong>
                </Link>
              )}

              {nextDay ? (
                <Link className="bottom-nav-card align-end" to={`/reports/${nextDay}`}>
                  <span>下一期日报 →</span>
                  <strong>{nextDay}</strong>
                </Link>
              ) : (
                <Link className="bottom-nav-card align-end" to="/">
                  <span>已是最新一期 →</span>
                  <strong>返回推理优化总览</strong>
                </Link>
              )}
            </div>

            <button
              type="button"
              className="reader-back-top"
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            >
              <ArrowUp size={14} aria-hidden /> 回到页面顶部
            </button>
          </footer>
        </article>
      </div>
    </div>
  );
}
