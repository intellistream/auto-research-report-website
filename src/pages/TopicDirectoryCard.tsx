import { ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

type Props = {
  title: string;
  description: string;
  path?: string;
  status?: string;
  summary?: ReactNode;
  detail?: ReactNode;
  repositories?: Readonly<Record<string, number>>;
  sections?: readonly { label: string; search?: string }[];
};

export default function TopicDirectoryCard({
  title, description, path, status = "技术专题", summary, detail, repositories, sections,
}: Props) {
  const vllmCount = repositories?.vllm ?? 0;
  const ascendCount = repositories?.["vllm-ascend"] ?? 0;
  return (
    <li className="topic-directory-card">
      <div className="topic-directory-card-top">
        <span className="survey-status">{status}</span>
        {summary && <span className="topic-meta">{summary}</span>}
      </div>
      <h2>
        {path ? <Link to={path}>{title} <ArrowUpRight size={16} aria-hidden="true" /></Link> : title}
      </h2>
      <div className="topic-directory-content">
        <p className="topic-directory-description">{description}</p>
        {detail && <p className="topic-directory-detail">{detail}</p>}
      </div>
      {repositories && (
        <div className="topic-directory-evidence">
          <div className="topic-directory-ratio" aria-hidden="true">
            {vllmCount > 0 && <span className="topic-directory-vllm" style={{ flex: vllmCount }} />}
            {ascendCount > 0 && <span className="topic-directory-ascend" style={{ flex: ascendCount }} />}
          </div>
          <div className="topic-directory-counts">
            <span><i className="topic-directory-vllm" /> vLLM <strong>{vllmCount}</strong></span>
            <span><i className="topic-directory-ascend" /> vLLM Ascend <strong>{ascendCount}</strong></span>
          </div>
        </div>
      )}
      {path && sections?.length ? (
        <div className="topic-section-links">
          {sections.map(({ label, search }) => (
            <Link key={search ?? ""} to={{ pathname: path, search }}>{label}</Link>
          ))}
        </div>
      ) : null}
    </li>
  );
}
