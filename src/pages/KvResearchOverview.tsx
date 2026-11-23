import { BookOpen, Check, FileText, Layers } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { filterResearch, kvResearch, researchReviewLabels } from "./kv-research";
import { kvSynthesis, synthesisGroup, synthesisPaper, synthesisPaperLink } from "./kv-synthesis";
import { safeTopicSource } from "./topic-report";
import study from "./kv-cache-study.json";
import { communityEntries, snapshotFor } from "./kv-community";
import "./kv-synthesis.css";

export default function KvResearchOverview() {
  const [query] = useSearchParams();
  const requestedTopic = query.get("topic");
  const group = synthesisGroup(requestedTopic);
  const label = kvResearch.taxonomy.find((topic) => topic.id === group.id)!.label;
  const material = filterResearch(kvResearch.entries, new URLSearchParams({ topic: group.id }));
  const papers = material.filter((entry) => entry.kind === "paper");
  const prs = filterResearch(communityEntries, new URLSearchParams({ topic: group.id }));
  const engineering = group.engineeringIds.map((id) => prs.find((entry) => entry.id === id))
    .filter((entry) => !!entry);
  const sourceEntries = [
    ...group.rows.flatMap((row) => { const entry = synthesisPaper(row.slug); return entry ? [entry] : []; }),
    ...engineering,
  ];
  const checkedAt = [...new Set(sourceEntries.map((entry) => entry.checkedAt))].sort();

  return <article className="kv-synthesis">
    <header className="kv-synthesis-intro">
      <p className="kv-synthesis-eyebrow"><Layers size={16} aria-hidden="true" /> 方法比较</p>
      <h2>从问题出发，看清方法之间的区别</h2>
      <p>选一个研究问题，比较代表论文改变了什么、能省下什么，以及为此付出的代价。</p>
    </header>

    <nav className="kv-synthesis-topics" aria-label="选择研究问题">
      {kvSynthesis.groups.map((item) => <Link
        key={item.id}
        to={{ search: `view=survey&topic=${item.id}` }}
        aria-current={item.id === group.id ? "location" : undefined}
      >
        <span>{item.shortLabel}{item.id === group.id && <Check size={15} aria-hidden="true" />}</span>
        <small>{item.hint}</small>
      </Link>)}
    </nav>

    {requestedTopic && requestedTopic !== group.id &&
      <p className="kv-synthesis-notice" role="status">未找到该研究问题，先展示缓存表示、布局与压缩。</p>}

    <section className="kv-synthesis-chapter" aria-labelledby="kv-synthesis-focus">
      <header className="kv-synthesis-question">
        <span className="kv-synthesis-label">{label}</span>
        <h3 id="kv-synthesis-focus" tabIndex={-1}>{group.question}</h3>
        <p>{group.summary}</p>
      </header>

      <div className="kv-synthesis-table-wrap">
        <table className="kv-synthesis-table">
          <caption>代表论文的方法比较</caption>
          <thead><tr>
            <th scope="col">代表论文</th>
            <th scope="col">改变了什么</th>
            <th scope="col">收益与适用场景</th>
            <th scope="col">条件与代价</th>
          </tr></thead>
          <tbody>{group.rows.map((row) => {
            const entry = synthesisPaper(row.slug);
            if (!entry) return null;
            const source = safeTopicSource(entry.url);
            return <tr key={entry.id} data-comparison-paper={row.slug}>
              <th scope="row">
                <Link className="kv-synthesis-paper-name" to={synthesisPaperLink(row.slug)}>{entry.paper.shortName}</Link>
                <span className="kv-synthesis-venue">{entry.paper.venue}</span>
                <div className="kv-synthesis-paper-links">
                  <Link to={synthesisPaperLink(row.slug)} aria-label={`阅读 ${entry.paper.shortName} 解读`}>阅读解读</Link>
                  {source && <a href={source} target="_blank" rel="noreferrer">原文</a>}
                </div>
              </th>
              <td data-label="改变了什么"><strong>{row.lever}</strong></td>
              <td data-label="收益与适用场景">{row.benefit}</td>
              <td data-label="条件与代价">{row.boundary}</td>
            </tr>;
          })}</tbody>
        </table>
      </div>

      <div className="kv-synthesis-takeaway">
        <span><BookOpen size={18} aria-hidden="true" /> 放在一起看</span>
        <p>{group.takeaway}</p>
      </div>
      <div className="kv-synthesis-measurement">
        <h4>比较效果时看什么</h4>
        <p>{group.measurement}</p>
      </div>
      <div className="kv-synthesis-reading-actions">
        <Link className="kv-synthesis-primary-link" to={{ search: `view=papers&topic=${group.id}&part=kv-papers-filters` }}>
          <BookOpen size={16} aria-hidden="true" /> 阅读本组 {papers.length} 篇论文
        </Link>
        <Link to={{ search: "view=papers&collection=recommended" }}>从推荐先读开始</Link>
      </div>
    </section>

    <section className="kv-synthesis-engineering" aria-labelledby="kv-synthesis-engineering-heading">
      <div className="kv-synthesis-section-heading">
        <div>
          <p className="kv-synthesis-eyebrow">从论文到工程问题</p>
          <h3 id="kv-synthesis-engineering-heading">实现中还需要处理什么？</h3>
        </div>
        <Link to={{ search: `view=evidence&kind=pr&topic=${group.id}` }}>查看本组 {prs.length} 条 PR</Link>
      </div>
      <p className="kv-synthesis-source-note">下面是共同关注这一问题的工程材料。关联依据是研究主题，不表示这些 PR 实现或复现了上面的论文。</p>
      <div className="kv-synthesis-engineering-grid">{engineering.map((entry) => {
        const method = study.methods.find((item) => item.workId === entry.id);
        const snapshot = snapshotFor(entry.id);
        const source = safeTopicSource(entry.url);
        return <article key={entry.id} data-comparison-evidence={entry.id}>
          <p className="kv-synthesis-pr-meta">
            {entry.repository === "vllm" ? "vLLM" : "vLLM Ascend"} #{entry.id.split("#")[1]}
            <span>{researchReviewLabels[entry.reviewLevel]}</span>
          </p>
          <h4>{entry.title}</h4>
          <p>{entry.summary}</p>
          <p className="kv-muted">说明核对于 {entry.checkedAt}{snapshot && snapshot.headSha !== entry.headSha ? " · 本期代码版本已变化，后续机制待复核" : ""}</p>
          <div className="kv-synthesis-pr-links">
            <Link to={{ search: "view=evidence&q=" + entry.id.split("#")[1] }}>查看社区 PR 记录</Link>
            {method && <Link to={{ search: `view=compare&part=kv-pr-${method.number}` }}>阅读机制与对照条件</Link>}
            {source && <a href={source} target="_blank" rel="noreferrer">原始 PR</a>}
          </div>
        </article>;
      })}</div>
    </section>

    <aside className="kv-synthesis-evidence-note" aria-label="已有深入工程对比">
      <FileText size={23} aria-hidden="true" />
      <div>
        <p className="kv-synthesis-eyebrow">已有深入对比 · 前缀感知调度</p>
        <h3>少重算，还要看搬运和等待</h3>
        <p>PR #66558 的作者单 seed 模拟中，prompt 重算减少，同时 CPU 回载量和 p99 首 token 等待增加。它提示我们：命中更多缓存之后，仍需核对数据在哪里、怎样恢复，以及谁在等待。</p>
        <Link to={{ search: "view=compare&part=kv-pr-66558" }}>查看原始条件和四条 PR 的方法对比</Link>
      </div>
    </aside>

    <footer className="kv-synthesis-footer">
      <p>综合整理于 <time dateTime={kvSynthesis.editedAt}>{kvSynthesis.editedAt}</time> · 来源核对日期 {checkedAt.join("、")}</p>
      <p>基于已收录论文的相关章节和既有 PR 核对记录。各项实验结果保留在对应解读中，本页比较机制与适用条件。</p>
    </footer>
  </article>;
}
