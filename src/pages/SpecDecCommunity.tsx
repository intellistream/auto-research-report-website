import { useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { Topic } from "./TopicPages";
import { EvidenceList, EvidenceTimeline } from "./TopicEvidence";
import TopicResearchReport from "./TopicResearchReport";
import { revealTopicPart, safeTopicSource } from "./topic-report";
import { filterWeeklyLibrary, latestEdition, legacyEdition, prLabel, selectedEdition, weeklyEditions, weeklyView, type WeeklyEdition, type WeeklySource } from "./specdec-weekly";
import "./specdec-weekly.css";

function SourceLink({ source }: { source: WeeklySource }) {
  const href=safeTopicSource(source.url);
  return href ? <a href={href} target="_blank" rel="noreferrer">{prLabel(source)} ↗</a> : <span>{prLabel(source)}</span>;
}
function SourceLinks({ ids, edition }: { ids: string[]; edition: WeeklyEdition }) {
  return <div className="specdec-week-links">{ids.map(id=>{
    const source=edition.sources.find(s=>s.workId===id);
    return source ? <SourceLink key={id} source={source}/> : null;
  })}</div>;
}
function Jump({ edition, part, children }: { edition: WeeklyEdition; part: string; children: string }) {
  const [query]=useSearchParams();
  return <Link to={{search:new URLSearchParams({view:"report",edition:edition.id,part}).toString()}} onClick={event=>{
    if (event.button===0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && query.get("part")===part && query.get("edition")===edition.id) revealTopicPart(document,part,window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }}>{children}</Link>;
}
function WeeklyReport({ edition }: { edition: WeeklyEdition }) {
  const [query]=useSearchParams();
  const part=query.get("part");
  useEffect(()=>{
    if (!part?.startsWith("week-")) return;
    const frame=requestAnimationFrame(()=>revealTopicPart(document,part,window.matchMedia("(prefers-reduced-motion: reduce)").matches));
    return ()=>cancelAnimationFrame(frame);
  },[part,edition.id]);
  const count=(repo: string)=>edition.sources.filter(s=>s.repository===repo).length;
  const byId=new Map(edition.sources.map(s=>[s.workId,s]));
  return <article className="specdec-week-article">
    <header className="specdec-week-header">
      <p className="specdec-week-kicker">每周研究报告 · {edition.id===latestEdition.id?"最新一期":"历史期次"}</p>
      <h2>{edition.title}</h2>
      <div className="specdec-week-meta"><span>观察窗口 <time>{edition.periodStart}</time> — <time>{edition.periodEnd}</time></span><span>来源核查 <time>{edition.checkedAt}</time></span></div>
      <div className="specdec-week-counts"><span><strong>{edition.sources.length}</strong> 条日报收录</span><span><strong>{count("vllm")}</strong> vLLM</span><span><strong>{count("vllm-ascend")}</strong> vLLM-Ascend</span></div>
      <p>{edition.overview}</p>
      <div className="specdec-week-links"><Link to={{search:"view=evidence&week="+edition.id}}>查看本期 PR 列表</Link><Link to={{search:"view=report&tab=archive"}}>历期报告</Link></div>
      <details className="specdec-week-scope"><summary>本期取材与证据口径</summary><p>{edition.scope}</p></details>
    </header>
    <nav className="specdec-week-toc" aria-label="本期目录">{edition.stories.map((story,i)=><Jump key={story.slug} edition={edition} part={"week-"+story.slug}>{String(i+1).padStart(2,"0")+" · "+story.title}</Jump>)}<Jump edition={edition} part="week-other">其他工程更新</Jump><Jump edition={edition} part="week-synthesis">综合观察与后续方向</Jump></nav>
    {edition.stories.map((story,i)=><section key={story.slug} className="specdec-week-section" id={"week-"+story.slug} tabIndex={-1}>
      <header><p className="specdec-week-kicker">重点进展 {String(i+1).padStart(2,"0")}</p><h3>{story.title}</h3><p className="specdec-week-lead">{story.lead}</p></header>
      {story.paragraphs.map(p=><p key={p}>{p}</p>)}
      {!!story.metrics.length && <div className="specdec-week-table"><table><caption>提交方报告的代表性对照</caption><thead><tr><th scope="col">PR / 环境</th><th scope="col">观察结果</th><th scope="col">适用条件与边界</th></tr></thead><tbody>{story.metrics.map(m=><tr key={m.sourceId}><th scope="row">{byId.has(m.sourceId)&&<SourceLink source={byId.get(m.sourceId)!}/>}<small>{m.environment}</small></th><td>{m.result}</td><td>{m.boundary}</td></tr>)}</tbody></table></div>}
      <p className="specdec-week-assessment"><strong>本期判断：</strong>{story.assessment}</p>
      <SourceLinks ids={story.sourceIds} edition={edition}/>
    </section>)}
    <section className="specdec-week-section" id="week-other" tabIndex={-1}><h3>其他工程更新</h3><ul className="specdec-week-other">{edition.otherIds.map(id=>{const s=byId.get(id);return s&&<li key={id}><SourceLink source={s}/><strong>{s.title}</strong><p>{s.summary}</p></li>})}</ul></section>
    <section className="specdec-week-section" id="week-synthesis" tabIndex={-1}><h3>综合观察与后续方向</h3>{edition.synthesis.map(item=><div key={item.title} className="specdec-week-observation"><h4>{item.title}</h4><p>{item.body}</p><SourceLinks ids={item.sourceIds} edition={edition}/></div>)}</section>
    <details className="specdec-week-sources"><summary>本期来源与版本（{edition.sources.length} 条）</summary><p>合入状态与 head 以本期核查时点为准；作者测量不保证来自最终 head。每条同时保留冻结的日报来源。</p><ul>{edition.sources.map(s=><li key={s.workId}><div><SourceLink source={s}/> · {s.title}</div><small>已合并 {s.mergedAt.slice(0,10)} UTC · {s.review==="patch"?"描述与关键变更路径/片段":"描述级核对"} · head <code>{s.headSha.slice(0,7)}</code></small><div className="specdec-week-links"><Link to={{pathname:"/reports/"+s.day,search:new URLSearchParams({version:s.version,section:s.number}).toString()}}>日报 {s.day}</Link><a href={s.url+"/files"} target="_blank" rel="noreferrer">PR Diff ↗</a><a href={"https://github.com/vllm-project/"+s.repository+"/commit/"+s.headSha} target="_blank" rel="noreferrer">固定 head ↗</a></div>{s.files.length>0&&<small className="specdec-week-files">{s.files.map(file=><a key={file} href={"https://github.com/vllm-project/"+s.repository+"/blob/"+s.headSha+"/"+file} target="_blank" rel="noreferrer">{file}</a>)}</small>}</li>)}</ul></details>
  </article>;
}
function Library({ topic }: { topic: Topic }) {
  const [query,setQuery]=useSearchParams();
  const rows=filterWeeklyLibrary(topic,query,false), filtered=filterWeeklyLibrary(topic,query);
  function filter(key: string,value: string){const next=new URLSearchParams(query);if(value)next.set(key,value);else next.delete(key);setQuery(next,{replace:true});}
  return <section className="specdec-week-library"><h2>PR 列表与趋势</h2><p>从日报中积累的去重 PR 线索，按收录日期统计。已收录不等于已经完成一手核验；周报只综合有实际证据的工作。</p>
    <div className="topic-filters specdec-week-search" role="search" aria-label="检索推测解码 PR"><label>关键词<input type="search" value={query.get("q")??""} placeholder="PR 编号、模型或机制" onChange={e=>filter("q",e.target.value)}/></label><label>周报期次<select value={query.get("week")??""} onChange={e=>filter("week",e.target.value)}><option value="">全部期次</option>{weeklyEditions.map(e=><option key={e.id} value={e.id}>{e.periodStart} — {e.periodEnd}</option>)}</select></label><button type="button" onClick={()=>setQuery({view:"evidence"},{replace:true})}>清空筛选</button></div>
    <EvidenceTimeline topic={{...topic,entries:filtered}}/>
    <EvidenceList entries={rows} labels={topic.labels}/>
  </section>;
}
function Archive({ topic }: { topic: Topic }) {
  return <section className="specdec-week-archive"><h2>历史版本</h2><p>每期周报保留独立的来源快照和观察，不随新日报覆盖。</p><ul>{weeklyEditions.map(e=><li key={e.id}><time>{e.periodStart} — {e.periodEnd}</time><h3><Link to={{search:"view=report&edition="+e.id}}>{e.title}</Link></h3><p>{e.sources.length} 条收录 PR · 核查 {e.checkedAt}</p></li>)}{topic.report&&<li><time>{topic.report.asOf}</time><h3><Link to={{search:"view=report&edition="+legacyEdition}}>初始动态研究报告（历史专题稿）</Link></h3><p>保留原八章报告、证据与版本下载。</p></li>}</ul></section>;
}
export default function SpecDecCommunity({ topic }: { topic: Topic }) {
  const [query]=useSearchParams();
  const view=weeklyView(query), edition=selectedEdition(query);
  useEffect(()=>{if(!query.get("part"))window.scrollTo(0,0);},[view,edition?.id]); // changes in filters should not jump
  return <div className="specdec-community"><nav className="specdec-week-nav" aria-label="动态报告板块"><Link to={{search:"view=report"}} aria-current={view==="weekly"?"page":undefined}>每周研究报告</Link><Link to={{search:"view=evidence"}} aria-current={view==="evidence"?"page":undefined}>PR 与趋势</Link><Link to={{search:"view=report&tab=archive"}} aria-current={view==="archive"||view==="legacy"?"page":undefined}>历史版本</Link></nav>
    {view==="weekly"&&(edition?<WeeklyReport key={edition.id} edition={edition}/>:<p role="status">未找到该期周报。<Link to={{search:"view=report&tab=archive"}}>查看历史版本</Link></p>)}
    {view==="evidence"&&<Library topic={topic}/>}
    {view==="archive"&&<Archive topic={topic}/>}
    {view==="legacy"&&(topic.report?<><p className="specdec-week-legacy-note">历史专题稿 · {topic.report.asOf}。<Link to={{search:"view=report"}}>返回最新周报</Link></p><TopicResearchReport key={topic.report.version} topic={topic} report={topic.report} embedded/></>:<p>历史报告暂无。</p>)}
  </div>;
}
