import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import KvMaterialLibrary from "./KvMaterialLibrary";
import KvPapers from "./KvPapers";
import { KvCacheGuide, KvMethodComparison, KvProgressReport } from "./KvCacheStudy";
import { filterResearch, kvResearch, paperViewQuery } from "./kv-research";
import { revealTopicPart } from "./topic-report";

const sections = [
  { id: "guide", label: "导引" },
  { id: "papers", label: "论文" },
  { id: "compare", label: "方法对比" },
  { id: "report", label: "动态报告" },
  { id: "evidence", label: "PR 与趋势" },
] as const;

export function KvCacheTopicCard() {
  const included = filterResearch(kvResearch.entries, new URLSearchParams());
  return <li className="topic-card survey-directory-card">
    <div className="survey-card-top"><span className="survey-status">独立专题</span></div>
    <h2><Link to="/topics/kv-cache">KV Cache <ArrowUpRight size={16} aria-hidden="true" /></Link></h2>
    <p>{kvResearch.description}</p>
    <div className="topic-meta">
      <span>{included.filter((entry) => entry.kind === "pr").length} 条 PR</span>
      <span>{included.filter((entry) => entry.kind === "paper").length} 篇论文</span>
    </div>
    <div className="kv-topic-card-sections">{sections.map(({ id, label }) =>
      <Link key={id} to={{ pathname: "/topics/kv-cache", search: `view=${id}` }}>{label}</Link>)}</div>
  </li>;
}

export default function KvCacheTopic() {
  const [query] = useSearchParams();
  const view = query.get("view");
  const part = query.get("part");
  const filtered = ["repo", "label", "topic", "kind", "month"].some((key) => query.has(key));
  const section = sections.find((item) => item.id === view)?.id ?? (!view && filtered ? "evidence" : "guide");
  useEffect(() => {
    if (!part) {
      window.scrollTo(0, 0);
      return;
    }
    const frame = requestAnimationFrame(() => revealTopicPart(
      document, part, window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    ));
    return () => cancelAnimationFrame(frame);
  }, [section, part]);

  return <div className="kv-topic">
    <Link className="topic-back" to="/topics"><ArrowLeft size={16} aria-hidden="true" /> 专题目录</Link>
    <header className="topic-heading kv-topic-heading">
      <p className="kv-topic-kicker">独立技术专题</p>
      <h1>{kvResearch.title}</h1>
      <p>{kvResearch.description}</p>
    </header>
    <nav className="kv-topic-nav" aria-label="KV Cache 专题分区">
      {sections.map(({ id, label }) => {
        const next = id === "papers" ? paperViewQuery(query) : new URLSearchParams(query);
        if (id !== "papers") next.delete("q");
        next.set("view", id);
        next.delete("part");
        return <Link key={id} to={{ search: next.toString() }} aria-current={section === id ? "page" : undefined}>{label}</Link>;
      })}
    </nav>
    {section === "guide" && <KvCacheGuide />}
    {section === "papers" && <KvPapers />}
    {section === "compare" && <KvMethodComparison />}
    {section === "report" && <KvProgressReport />}
    {section === "evidence" && <KvMaterialLibrary />}
  </div>;
}
