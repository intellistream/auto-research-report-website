import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";

type Props = {
  title: string;
  description: string;
  path: string;
  status?: string;
  summary: string;
  detail?: string;
  vllmCount: number;
  ascendCount: number;
  sections: readonly { id: string; label: string; search: string }[];
};

export default function TopicDirectoryCard({
  title, description, path, status = "技术专题", summary, detail, vllmCount, ascendCount, sections,
}: Props) {
  return (
    <li className="topic-directory-card">
      <div className="survey-card-top">
        <span className="survey-status">{status}</span>
        <span className="topic-meta">{summary}</span>
      </div>
      <h2>
        <Link to={path}>
          {title} <ArrowUpRight size={16} aria-hidden="true" />
        </Link>
      </h2>
      <p className="eng-dir-desc">{description}</p>
      {detail && <p className="topic-directory-detail topic-meta">{detail}</p>}
      <div className="eng-dir-bar-wrap">
        <div className="eng-dir-ratio-bar" aria-hidden="true">
          {vllmCount > 0 && <span className="bar-vllm" style={{ flex: vllmCount }} />}
          {ascendCount > 0 && <span className="bar-ascend" style={{ flex: ascendCount }} />}
        </div>
        <div className="eng-dir-counts">
          <span><i className="dot-vllm" /> vLLM <strong>{vllmCount}</strong></span>
          <span><i className="dot-ascend" /> vLLM Ascend <strong>{ascendCount}</strong></span>
        </div>
      </div>
      <div className="acl-topic-card-sections">
        {sections.map(({ id, label, search }) => (
          <Link key={id} to={{ pathname: path, search }}>{label}</Link>
        ))}
      </div>
    </li>
  );
}
