import type { ReactNode } from "react";
import { KvGuideLink } from "./KvGuideLink";

export function KvGuideChapterHeading({ number, category, title, children }: {
  number?: string; category: string; title: string; children: ReactNode;
}) {
  return <header className="kv-guide-chapter-heading">
    <p className="kv-guide-chapter-label">{number && <span>{number}</span>}{category}</p>
    <h3>{title}</h3><p className="kv-guide-chapter-lead">{children}</p>
  </header>;
}

export function KvGuideChapterEnd({ children, part, label }: {
  children: ReactNode; part: string; label: string;
}) {
  return <div className="kv-guide-chapter-end">
    <p><strong>记住这一点</strong>{children}</p>
    <KvGuideLink part={part}>{label}<span aria-hidden="true"> →</span></KvGuideLink>
  </div>;
}
