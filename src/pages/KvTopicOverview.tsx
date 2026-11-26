import { Link } from "react-router-dom";
import overview from "./kv-overview.json";
import { communityEntries } from "./kv-community";
import { synthesisPaper, synthesisPaperLink } from "./kv-synthesis";
import { materialSearch, weeklySearch, weeklySource } from "./kv-weekly";
import { safeTopicSource } from "./topic-report";
import "./kv-overview.css";

type Evidence = { papers?: string[]; prs?: string[]; sources?: string[] };

function References({ evidence }: { evidence: Evidence }) {
  return <div className="kv-overview-references" aria-label="相关证据">
    {evidence.papers?.map(slug => {
      const paper = synthesisPaper(slug);
      return paper && <Link key={slug} to={synthesisPaperLink(slug)}>{paper.paper.shortName}</Link>;
    })}
    {evidence.prs?.map(id => {
      const entry = communityEntries.find(row => row.id === id);
      return entry && <Link key={id} to={{ search: materialSearch(id) }}>
        {entry.repository === "vllm" ? "vLLM" : "vLLM Ascend"} #{id.split("#")[1]}
      </Link>;
    })}
    {evidence.sources?.map(id => {
      const source = weeklySource(id);
      const url = safeTopicSource(source?.url ?? "");
      return source && url && <a key={id} href={url} target="_blank" rel="noreferrer">{source.label}</a>;
    })}
  </div>;
}

export default function KvTopicOverview() {
  const validation = overview.validation;
  return <article className="kv-overview">
    <header className="kv-overview-intro">
      <h2>{overview.title}</h2>
      <p>{overview.summary}</p>
      <p className="kv-overview-dates">PR 材料截至 <time dateTime={overview.materialThrough}>{overview.materialThrough}</time>
        <span>相关工作截至 <time dateTime={overview.relatedWorkThrough}>{overview.relatedWorkThrough}</time></span></p>
    </header>

    <section aria-labelledby="kv-overview-judgments">
      <h3 id="kv-overview-judgments" tabIndex={-1}>当前总体判断</h3>
      <div className="kv-overview-judgments">{overview.judgments.map(item => <article key={item.id}>
        <h4>{item.title}</h4><p>{item.body}</p><References evidence={item.evidence}/>
      </article>)}</div>
    </section>

    <section aria-labelledby="kv-overview-directions">
      <h3 id="kv-overview-directions" tabIndex={-1}>各方向的进展与边界</h3>
      <div className="kv-overview-directions">{overview.directions.map(direction => <article
        key={direction.id} id={`kv-overview-${direction.id}`} tabIndex={-1}>
        <header><h4>{direction.title}</h4><p>{direction.question}</p></header>
        <dl>
          <div><dt>已有进展</dt><dd>{direction.progress}</dd></div>
          <div><dt>仍受哪些限制</dt><dd>{direction.boundary}</dd></div>
        </dl>
        <References evidence={direction.evidence}/>
        <Link className="kv-overview-comparison" to={{ search: `view=survey&topic=${direction.id}` }}>比较本方向的方法与条件</Link>
      </article>)}</div>
    </section>

    <section className="kv-overview-validation" aria-labelledby="kv-overview-validation">
      <h3 id="kv-overview-validation" tabIndex={-1}>潜在研究方向</h3>
      <h4>{validation.title}</h4>
      {validation.problem.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
      <dl>
        <div><dt>现有不足</dt><dd>{validation.limitation}</dd></div>
        <div><dt>潜在改进方向</dt><dd>{validation.direction}</dd></div>
      </dl>
      <p className="kv-overview-boundary">{validation.boundary}</p>
      <References evidence={validation.evidence}/>
      <Link className="kv-overview-comparison" to={{ search: weeklySearch(new URLSearchParams(), validation.week, validation.questionId) }}>
        查看完整验证方案与跨周判断
      </Link>
    </section>
  </article>;
}
