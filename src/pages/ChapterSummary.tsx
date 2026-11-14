import { Link } from "react-router-dom";
import { summarySources, type IndexedChapter } from "./chapter-summaries";
import "./chapter-summary.css";

export default function ChapterSummary({ summary }: { summary?: IndexedChapter }) {
  if (!summary) return <p className="chapter-summary-missing">当前日期与来源范围内未提供适用的问题总结。</p>;
  const caption = `${summary.day} · 版本 ${summary.version.slice(0, 8)}`;
  const sources = `本章来源：${summarySources(summary.sources)}`;
  const search = new URLSearchParams({ version: summary.version, section: summary.stage });
  return (
    <div className="chapter-summary">
      <strong>问题总结</strong>
      <p className="chapter-summary-text">{summary.chapter_summary}</p>
      <p className="chapter-summary-meta">
        <Link to={{ pathname: `/reports/${summary.day}`, search: search.toString() }} title={summary.version}>{caption} · 查看章原文</Link>
      </p>
      <p className="chapter-summary-meta">{sources} · 仅对应此日报整章</p>
    </div>
  );
}
