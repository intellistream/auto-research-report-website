import { Link } from "react-router-dom";
import type { IndexedChapter } from "./chapter-summaries";
import "./chapter-summary.css";

export default function ChapterSummary({ summary }: { summary?: IndexedChapter }) {
  if (!summary) return <p className="chapter-summary-missing">当前日期与来源范围内未提供适用的问题总结。</p>;
  const search = new URLSearchParams({ version: summary.version, section: summary.stage });
  return (
    <p className="chapter-summary">
      <Link className="chapter-summary-text" to={{ pathname: `/reports/${summary.day}`, search: search.toString() }}>
        {summary.chapter_summary}
      </Link>
    </p>
  );
}
