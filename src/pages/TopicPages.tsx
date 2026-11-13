import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import "./topics.css";

type Entry = {
  workId: string;
  title: string;
  repository: "vllm" | "vllm-ascend";
  url: string;
  day: string;
  version: string;
  number: string;
  label: string;
  reason: string;
  method: "manual" | "rule";
  summary: string;
};
type Topic = {
  id: string;
  title: string;
  description: string;
  labels: Record<string, string>;
  coverage: { firstDay: string; lastDay: string; days: number; prs: number };
  counts: { total: number; byRepository: Record<string, number> };
  entries: Entry[];
};
export type TopicIndex = { schemaVersion: 1; topics: Topic[] };
const community = { vllm: "vLLM", "vllm-ascend": "vLLM Ascend" };

function TopicDetail({ topic }: { topic: Topic }) {
  const [query, setQuery] = useSearchParams();
  const repo = query.get("repo") ?? "";
  const label = query.get("label") ?? "";
  function filter(key: string, value: string) {
    const next = new URLSearchParams(query);
    if (value) next.set(key, value);
    else next.delete(key);
    setQuery(next, { replace: true });
  }
  const rows = topic.entries.filter((entry) =>
    (!repo || entry.repository === repo) && (!label || entry.label === label));
  return (
    <>
      <Link className="topic-back" to="/topics"><ArrowLeft size={16} /> 全部专题</Link>
      <header className="topic-heading">
        <div className="docx-eyebrow">技术专题 · 试运行</div>
        <h1>{topic.title}</h1>
        <p>{topic.description}</p>
      </header>
      <dl className="docx-flow-summary">
        <div><dt>专题收录 PR</dt><dd>{topic.counts.total}</dd></div>
        {Object.entries(community).map(([id, title]) => (
          <div key={id}><dt>{title}</dt><dd>{topic.counts.byRepository[id] ?? 0}</dd></div>
        ))}
      </dl>
      <p className="topic-coverage">归档覆盖 {topic.coverage.firstDay} 至 {topic.coverage.lastDay}，共 {topic.coverage.days} 期、{topic.coverage.prs} 条去重主 PR。规则匹配为初筛，日期为日报收录日。</p>
      <div className="topic-filters">
        <label>社区<select value={repo} onChange={(event) => filter("repo", event.target.value)}>
          <option value="">全部社区</option>
          {Object.entries(community).map(([id, title]) => <option key={id} value={id}>{title}</option>)}
        </select></label>
        <label>子方向<select value={label} onChange={(event) => filter("label", event.target.value)}>
          <option value="">全部方向</option>
          {Object.entries(topic.labels).map(([id, title]) => <option key={id} value={id}>{title}</option>)}
        </select></label>
        <span role="status">{rows.length} 条结果</span>
      </div>
      {rows.length === 0 ? <p>当前筛选下没有收录条目。</p> : (
        <ul className="topic-entries">
          {rows.map((entry) => {
            const reportQuery = new URLSearchParams({ version: entry.version, section: entry.number });
            const reportLink = { pathname: `/reports/${entry.day}`, search: reportQuery.toString() };
            return (
              <li key={entry.workId} className="topic-card">
                <div className="topic-meta">
                  <time dateTime={entry.day}>{entry.day}</time>
                  <span>{community[entry.repository]} #{entry.workId.split("#")[1]}</span>
                  <span className="topic-tag">{topic.labels[entry.label]}</span>
                  {entry.method === "manual" && <span className="topic-tag">人工纳入</span>}
                </div>
                <h2><Link to={reportLink}>{entry.title}</Link></h2>
                {entry.summary && <p>{entry.summary}</p>}
                <p className="topic-reason">{entry.reason}</p>
                <div className="topic-links">
                  <Link to={reportLink}>查看日报正文</Link>
                  <a href={entry.url} target="_blank" rel="noreferrer">GitHub PR <ArrowUpRight size={14} /></a>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

export default function TopicPages({ index, error }: { index?: TopicIndex; error?: string }) {
  const { topicId } = useParams();
  if (error) return <p role="alert">暂无可用的专题索引。<Link to="/reports">查看日报档案</Link></p>;
  if (!index) return <p role="status">正在加载专题…</p>;
  if (index.schemaVersion !== 1 || !Array.isArray(index.topics)) {
    return <p role="alert">专题索引格式不受支持。</p>;
  }
  const topic = index.topics.find((row) => row.id === topicId);
  if (topicId && !topic) return <p>没有找到该专题。<Link to="/topics">查看全部专题</Link></p>;
  return (
    <div className="topic-page">
      {topic ? <TopicDetail key={topic.id} topic={topic} /> : (
        <>
          <header className="topic-heading">
            <div className="docx-eyebrow">跨日报追踪 · 试运行</div>
            <h1>技术专题</h1>
            <p>按技术方向追踪 vLLM 和 vLLM Ascend 的改动，并回到对应日报阅读原文。</p>
          </header>
          <ul className="topic-directory">
            {index.topics.map((row) => (
              <li key={row.id} className="topic-card">
                <h2><Link to={`/topics/${row.id}`}>{row.title} <ArrowUpRight size={17} /></Link></h2>
                <p>{row.description}</p>
                <div className="topic-meta"><span>{row.counts.total} 条 PR</span><span>覆盖至 {row.coverage.lastDay}</span></div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
