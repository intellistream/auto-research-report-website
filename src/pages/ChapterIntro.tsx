import { Link } from "react-router-dom";
import type { IndexedChapter } from "./chapter-intros";
import "./chapter-intro.css";

export default function ChapterIntro({ chapter }: { chapter?: IndexedChapter }) {
  if (!chapter) return <p className="chapter-intro-missing">当前日期与来源范围内未提供适用的问题总结。</p>;
  const search = new URLSearchParams({ version: chapter.version, section: chapter.stage });
  return (
    <p className="chapter-intro">
      <Link className="chapter-intro-text" to={{ pathname: `/reports/${chapter.day}`, search: search.toString() }}>
        当日聚焦：{chapter.intro}
      </Link>
    </p>
  );
}
