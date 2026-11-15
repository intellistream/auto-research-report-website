import { Link } from "react-router-dom";
import type { IndexedChapter } from "./chapter-intros";
import "./chapter-intro.css";

export default function ChapterIntro({ chapter, omitCountPrefix = false }: {
  chapter?: IndexedChapter; omitCountPrefix?: boolean;
}) {
  if (!chapter) return <p className="chapter-intro-missing">当前日期与来源范围内未提供适用的问题总结。</p>;
  const search = new URLSearchParams({ version: chapter.version, section: chapter.stage });
  const text = omitCountPrefix ? chapter.intro.replace(/^\s*本章收录\s*\d+\s*项更新\s*[，,]\s*涉及\s*/, "") : chapter.intro;
  return (
    <p className="chapter-intro">
      <Link className="chapter-intro-text" to={{ pathname: `/reports/${chapter.day}`, search: search.toString() }}>
        当日聚焦：{text}
      </Link>
    </p>
  );
}
