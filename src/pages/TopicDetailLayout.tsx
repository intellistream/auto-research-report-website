import { ArrowLeft } from "lucide-react";
import type { MouseEventHandler, ReactNode } from "react";
import { Link, type To } from "react-router-dom";
import "./topic-detail.css";

type TopicSection = {
  label: string;
  to: To;
  current?: "page" | "location";
  onClick?: MouseEventHandler<HTMLAnchorElement>;
};

export function TopicSectionNav({ label, sections, secondary = false }: {
  label: string;
  sections: readonly TopicSection[];
  secondary?: boolean;
}) {
  return (
    <nav className={secondary ? "topic-detail-subnav" : "topic-detail-nav"} aria-label={label}>
      {sections.map(({ label, to, current, onClick }) => (
        <Link key={label} to={to} aria-current={current} onClick={onClick}>{label}</Link>
      ))}
    </nav>
  );
}

type Props = {
  title: string;
  subtitle: string;
  sections: readonly TopicSection[];
  navLabel?: string;
  className?: string;
  headerId?: string;
  children: ReactNode;
};

export default function TopicDetailLayout({
  title, subtitle, sections, navLabel = `${title} 专题分区`, className, headerId, children,
}: Props) {
  return (
    <div className={className ? `topic-detail ${className}` : "topic-detail"}>
      <Link className="topic-back" to="/topics">
        <ArrowLeft size={16} aria-hidden="true" /> 专题目录
      </Link>
      <header className="topic-detail-header" id={headerId} tabIndex={headerId ? -1 : undefined}>
        <p className="topic-detail-kicker">技术专题</p>
        <h1>{title}</h1>
        <p className="topic-detail-subtitle">{subtitle}</p>
      </header>
      <TopicSectionNav label={navLabel} sections={sections} />
      {children}
    </div>
  );
}
