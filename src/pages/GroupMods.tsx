import { useEffect } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { Boxes, GitBranch, Search } from "lucide-react";
import { useGroupData,groupAsset } from "../features/group-mods/data";
import { filterMods,groupHref,invalidFilters,kindLabels,questionKinds,isResearchQuestion,relationStateLabels,resetModFilters } from "../features/group-mods/selectors";
import { Badge,ComparisonCollection,Empty,External,History,ModCard,Profile,QuestionCollection,StageMappingSources } from "../features/group-mods/components";
import type { Bundle,GroupIndex } from "../features/group-mods/types";
import { inferenceStageNames, isInferenceStage, legacyStageLabels, modStageView } from "../features/group-mods/stages";
import { StageDistribution } from "../features/group-mods/StageDistribution";
import "../features/group-mods/group-mods.css";

export default function GroupMods() {
 const [query]=useSearchParams();const result=useGroupData(query.get("snapshot"));
 if(result.error)return <section className="gm-page"><h1>组内 MOD</h1><p className="gm-error" role="alert">{result.error}</p><Link to="/group-mods">打开当前有效快照</Link></section>;
 if(!result.bundle||!result.index)return <p className="overview-status-card" role="status">正在核验并打开组内 MOD 数据…</p>;
 return <GroupModContent bundle={result.bundle} index={result.index}/>;
}
export function GroupModContent({bundle,index}:{bundle:Bundle;index:GroupIndex}) {
 const location=useLocation();const [query,setQuery]=useSearchParams();
 const p=bundle.payload;
 const routeSegment=location.pathname.replace(/^\/group-mods\/?/,"").replace(/\/$/,"");
 const selectedRelation=query.get("relation"),selectedQuestion=query.get("question");
 const segment=routeSegment||(!selectedRelation&&(selectedQuestion||query.get("view")==="questions")?"questions":!selectedRelation&&query.get("view")==="history"?"sources":"");
 const global=["questions","changes","sources"].includes(segment);
 const relationOwner=!segment&&selectedRelation?p.relations.find(r=>r.id===selectedRelation)?.modId:undefined;
 const mod=!global?(segment?p.mods.find(m=>m.componentId===segment):p.mods.find(m=>m.id===relationOwner)):undefined;
 const view=query.get("view")||(selectedRelation?"compare":selectedQuestion?"questions":mod&&p.relations.some(r=>r.modId===mod.id&&r.reviewStatus==="supported")?"compare":"overview");
 const badRelation=selectedRelation&&!p.relations.some(r=>r.id===selectedRelation&&r.modId===mod?.id);
 const badQuestion=selectedQuestion&&!p.questions.some(q=>q.id===selectedQuestion&&(!mod||q.modIds.includes(mod.id)));
 useEffect(()=>{
  const id=selectedQuestion||selectedRelation;
  if(!id)return;
  const frame=requestAnimationFrame(()=>{const el=document.getElementById(id);if(el){el.scrollIntoView({block:"start",behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth"});el.focus({preventScroll:true});}});
  return ()=>cancelAnimationFrame(frame);
 },[selectedRelation,selectedQuestion,view,location.pathname,bundle.payloadSha256]);
 function update(key:string,value:string){const q=new URLSearchParams(query);if(value)q.set(key,value);else q.delete(key);setQuery(q);}
 const validViews=["overview","compare","questions","history"];
 const invalidObject=Boolean(segment&&!global&&!mod)||Boolean(mod&&!validViews.includes(view))||Boolean(badRelation)||Boolean(badQuestion);
 const row=index.snapshots.find(s=>s.snapshotId===bundle.payloadSha256);
 const priority=(id:string)=>p.relations.some(r=>r.modId===id&&r.reviewStatus==="supported")?0:p.relations.some(r=>r.modId===id&&r.reviewStatus==="candidate")?1:2;
 const selectedStage=query.get("stage")||"";
 const stageExamples=isInferenceStage(selectedStage)?p.mods.filter(m=>modStageView(bundle,m).stages.includes(selectedStage)):[];
 const filtered=[...filterMods(bundle,query)].sort((a,b)=>priority(a.id)-priority(b.id));
 const modQuestions=mod?p.questions.filter(q=>q.modIds.includes(mod.id)):[];
 const questions=p.questions.filter(q=>(!mod||q.modIds.includes(mod.id))&&(!query.get("mod")||q.modIds.includes("mod:vllm-hust:"+query.get("mod")))&&(!query.get("kind")||!Object.hasOwn(questionKinds,query.get("kind")!)||q.kind===query.get("kind"))&&(!query.get("status")||q.status===query.get("status"))&&(!query.get("review")||q.reviewNeeded));
 const linkQuery=new URLSearchParams();if(query.has("snapshot"))linkQuery.set("snapshot",query.get("snapshot")!);
 const directoryHref=groupHref(null,query,{view:null,relation:null,question:null,mod:null,status:null,review:null,kind:Object.hasOwn(kindLabels,query.get("kind")||"")?query.get("kind"):null});
 function globalHref(path:string){return "/group-mods"+path+(linkQuery.size?"?"+linkQuery.toString():"");}
 return <div className="gm-page">
  <header className="gm-hero"><div><span className="gm-eyebrow"><Boxes size={16} aria-hidden/>GROUP RESEARCH</span><h1>{mod?mod.displayName:segment==="questions"?"后续研究问题":["changes","sources"].includes(segment)?"来源与纳入口径":"MOD 与社区 PR 对照"}</h1>
   <p>{mod?(mod.facts.problem||mod.facts.summary):"从组内 MOD 出发，比较具体社区 PR 的问题、方法和适用条件，并查看后续研究问题。"}</p>
   <div className="gm-hero-meta"><span>取材截至 {p.asOf}</span><span>资料版本 {bundle.payloadSha256.slice(0,8)}</span><Link to={globalHref("/sources")}>来源与版本</Link></div></div>
   {["sources","changes"].includes(segment)&&<div className="gm-version"><label htmlFor="gm-snapshot">查看版本</label><select id="gm-snapshot" value={bundle.payloadSha256} onChange={e=>update("snapshot",e.target.value)}>{index.snapshots.map(s=><option key={s.snapshotId} value={s.snapshotId} disabled={s.withdrawn}>{s.asOf+" · "+s.snapshotId.slice(0,8)+(s.withdrawn?"（正文已撤回）":s.isBaseline?" · 初始":"")}</option>)}</select>
    {row?.bundlePath&&<a href={groupAsset(row.bundlePath)} download={"group-mods-"+bundle.payloadSha256.slice(0,8)+".json"}>下载所看版本 JSON</a>}</div>}
  </header>
  <nav className="gm-nav" aria-label="组内 MOD 导航"><Link aria-current={!global?"page":undefined} to={directoryHref}>MOD 与社区 PR</Link><Link aria-current={segment==="questions"?"page":undefined} to={globalHref("/questions")}>后续研究问题</Link><Link aria-current={["sources","changes"].includes(segment)?"page":undefined} to={globalHref("/sources")}>来源与口径</Link></nav>
  {invalidObject?<Empty>未找到所指定的 MOD、视图、关系或问题。请核对链接；这里不会改为显示另一条记录。</Empty>:mod?<div>
   <Link className="gm-back" to={directoryHref}>返回 MOD 目录与筛选</Link>
   <div className="gm-card-top"><Badge>{kindLabels[mod.kind]}</Badge><Badge tone={mod.lifecycle==="implemented_restricted"?"warn":""}>{mod.lifecycle==="implemented_restricted"?"已实现，条件受限":"已实现并登记"}</Badge></div>
   <nav className="gm-tabs" aria-label="MOD 详情"><Link aria-current={view==="compare"?"page":undefined} to={groupHref(mod.componentId,query,{view:"compare",question:null})}>社区对照</Link><Link aria-current={view==="questions"?"page":undefined} to={groupHref(mod.componentId,query,{view:"questions",relation:null})}>后续研究问题</Link><Link aria-current={["overview","history"].includes(view)?"page":undefined} to={groupHref(mod.componentId,query,{view:"overview",relation:null,question:null})}>MOD 概况与来源</Link></nav>
   {view==="overview"?<Profile mod={mod} bundle={bundle}/>:view==="compare"?<>
    <p className="gm-muted">“有依据”针对所述方法或边界关系；迁移收益仍需单独验证。</p>
    <ComparisonCollection bundle={bundle} modId={mod.id} query={query} selectedRelation={selectedRelation}/>
    <section className="gm-mod-questions" aria-labelledby="gm-mod-questions-title"><h2 id="gm-mod-questions-title">后续研究问题</h2><QuestionCollection questions={modQuestions} bundle={bundle} query={query} selectedQuestion={selectedQuestion} showAll/></section>
    <TopicContexts bundle={bundle} modId={mod.id}/>
   </>:view==="questions"?<QuestionCollection questions={modQuestions} bundle={bundle} query={query} selectedQuestion={selectedQuestion}/>:<><p className="gm-muted">版本与判断修订记录；不把资料导入和文字调整当作技术进展。</p><History bundle={bundle} modId={mod.id}/></>}
  </div>:segment==="questions"?<>
   <div className="gm-filters"><label>MOD<select value={query.get("mod")||""} onChange={e=>update("mod",e.target.value)}><option value="">全部 MOD</option>{p.mods.map(m=><option key={m.id} value={m.componentId}>{m.displayName}</option>)}</select></label>
    <label>问题类型<select value={query.get("kind")||""} onChange={e=>update("kind",e.target.value)}><option value="">全部类型</option>{Object.entries(questionKinds).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
    <label>状态<select value={query.get("status")||""} onChange={e=>update("status",e.target.value)}><option value="">全部状态</option><option value="proposed">待验证</option><option value="validating">验证中</option><option value="resolved">已形成有据结论</option><option value="contradicted">假设不成立</option></select></label>
    <label>复核<select value={query.get("review")||""} onChange={e=>update("review",e.target.value)}><option value="">全部</option><option value="needed">仅需复核</option></select></label></div>
   <QuestionCollection questions={questions} bundle={bundle} query={query} selectedQuestion={selectedQuestion}/>
  </>:["changes","sources"].includes(segment)?<Sources bundle={bundle} historyOpen={segment==="changes"||query.get("view")==="history"}/>:<>
   <div className="gm-metrics"><Metric value={p.mods.length} label="已实现并登记的组内 MOD"/><Metric value={new Set(p.relations.filter(r=>r.reviewStatus==="supported").map(r=>r.modId)).size} label="有据社区对照的 MOD"/><Metric value={p.relations.filter(r=>r.reviewStatus==="supported"&&p.sourceSnapshots.find(s=>s.id===r.sourceSnapshotId)?.kind==="pr").length} label="有据社区 PR 对照"/><Metric value={p.questions.filter(isResearchQuestion).length} label="后续研究问题"/></div>
   <StageDistribution bundle={bundle} selectedStage={isInferenceStage(selectedStage)?selectedStage:null} onSelect={stage=>update("stage",stage)}/>
   {isInferenceStage(selectedStage)&&<section className="gm-panel"><h2>{inferenceStageNames[selectedStage as keyof typeof inferenceStageNames]}关注的问题</h2>{stageExamples.length?<><p className="gm-muted">本轮登记项目的问题示例；据各项目公开资料归纳。</p><ul>{stageExamples.slice(0,3).map(m=><li key={m.id}><Link to={groupHref(m.componentId,query,{view:"overview"})}>{m.displayName}</Link>：{m.facts.problem||m.facts.summary}</li>)}</ul></>:<p>当前快照尚无可确认映射到此环节的 MOD；不表示该方向没有研究。</p>}</section>}
   {Object.hasOwn(legacyStageLabels,selectedStage)&&<p className="gm-notice" role="status">此链接保留旧辅助分类“{legacyStageLabels[selectedStage]}”的筛选。该分类不对应独立推理环节，不计入八环节图表；选择具体环节或重置可退出旧分类筛选。</p>}
   <div className="gm-filters"><label className="gm-search"><span><Search size={15} aria-hidden/>检索 MOD</span><input value={query.get("q")||""} onChange={e=>update("q",e.target.value)} placeholder="名称、问题、PR 编号或维护者"/></label>
    <label>推理环节<select value={isInferenceStage(selectedStage)?selectedStage:""} onChange={e=>update("stage",e.target.value)}><option value="">全部环节</option>{Object.entries(inferenceStageNames).map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
    <label>类型<select value={query.get("kind")||""} onChange={e=>update("kind",e.target.value)}><option value="">全部类型</option>{Object.entries(kindLabels).map(([k,v])=><option value={k} key={k}>{v}</option>)}</select></label>
    <label>对照状态<select value={query.get("relationStatus")||""} onChange={e=>update("relationStatus",e.target.value)}><option value="">全部状态</option>{Object.entries(relationStateLabels).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
    <button type="button" onClick={()=>setQuery(resetModFilters(query))}>重置筛选</button></div>
   {invalidFilters(bundle,query).length>0&&<p className="gm-notice">已忽略无效筛选：{invalidFilters(bundle,query).join("、")}</p>}
   <p className="gm-result" role="status">{filtered.length} / {p.mods.length} 个 MOD{selectedStage&&" · "+(isInferenceStage(selectedStage)?inferenceStageNames[selectedStage as keyof typeof inferenceStageNames]:legacyStageLabels[selectedStage]?"旧辅助分类："+legacyStageLabels[selectedStage]:"全部环节")}</p>
   <p className="gm-muted">有据社区对照优先显示。问题与约束据公开资料归纳；候选与尚未评估的项目分别保留，不硬配 PR。</p>
   {filtered.length?<div className="gm-grid">{filtered.map(m=><ModCard key={m.id} mod={m} bundle={bundle} query={query}/>)}</div>:<Empty>当前筛选未收录对应已实现 MOD；这不代表该方向无人研究。</Empty>}
  </>}
 </div>;
}
function Metric({value,label}:{value:number;label:string}){return <div><strong>{value}</strong><span>{label}</span></div>;}
function TopicContexts({bundle,modId}:{bundle:Bundle;modId:string}) {
 const coverage=bundle.payload.coverage.find(c=>c.modId===modId);
 const names:Record<string,string>={"kv-cache":"KV Cache","aclgraph":"ACL Graph","speculative-decoding":"推测解码"};
 return coverage?.topicContexts.length?<section className="gm-panel"><h2>继续阅读相关专题</h2><p>以下是范围导航，不计为已确认的方法关系。</p><div className="gm-actions">{coverage.topicContexts.map(c=><Link key={c.topicId} to={"/topics/"+c.topicId}>{names[c.topicId]||c.topicId}</Link>)}</div></section>:null;
}
function Sources({bundle,historyOpen=false}:{bundle:Bundle;historyOpen?:boolean}) {
 const p=bundle.payload;const [query,setQuery]=useSearchParams();
 const decisions:Record<string,string>={included:"纳入组内主统计",reference_only:"外部参照，不计组内",pending:"待核查，未计入",excluded:"未符合本次 MOD 范围"};
 return <div className="gm-profile"><section className="gm-panel"><h2>怎样计入“已做成 MOD”</h2><p>采用官网公开登记的组件身份，并同时核对正式 MOD 分类、已实现生命周期、组内归属和公开范围。统计单位是 MOD 登记项，不是仓库、独立课题或人数。</p><p>只有 implemented / implemented_restricted 且符合组内归属的 runtime_mod、connector_mod、tool_mod 进入主统计。证据标签和性能数字不覆盖生命周期。</p><p>{p.scopeNotice}</p></section>
  <StageMappingSources bundle={bundle} query={query}/>
  <section className="gm-panel"><h2>社区 PR 材料范围</h2>{p.corpusSummary?<><p>当前日报覆盖 {p.corpusSummary.periodStart} 至 {p.corpusSummary.periodEnd}；日报与专题共使用 {p.corpusSummary.inputCount} 份版本锁定的输入文件。</p><p>{p.corpusSummary.note}</p></>:<p>此快照尚未附完整社区 PR 材料范围摘要；已形成的对照以各条来源记录为准。</p>}</section>
  <section className="gm-panel"><h2>来源发布链</h2><p>官网部署会装配锁定的 benchmark 发布数据，并执行公开范围过滤。这里保存三段版本与公开文件哈希。</p><External href="https://github.com/vLLM-HUST/vllm-hust-website">官方来源仓库</External><details className="gm-source"><summary>查看版本与内容哈希</summary><pre>{JSON.stringify(p.sourceChain,null,2)}</pre></details></section>
  <section className="gm-panel"><h2>纳入与未纳入清单</h2>{Object.entries(decisions).map(([decision,label])=><details className="gm-audit" key={decision}><summary>{label} · {p.audit.filter(a=>a.decision===decision).length}</summary><ul>{p.audit.filter(a=>a.decision===decision).map(a=><li key={a.id}><strong>{a.name}</strong><span>{a.reason} · {a.kind||"无正式 MOD 分类"} · {a.lifecycle||"生命周期未明确"}</span></li>)}</ul></details>)}</section>
  <section className="gm-panel"><h2><GitBranch size={20} aria-hidden/>更新与判断边界</h2><p>资料经离线核查后生成新快照。来源版本变化会标记受影响的判断“需复核”，不会自动确认收益、创新性或关闭研究问题。首次收录只建立基线。</p><p>维护者不自动等于负责人；“已实现登记”与“性能已验证”分别记录。公开范围撤回时，历史正文也停止提供。</p></section>
  <details className="gm-panel gm-version-history" open={historyOpen}><summary>版本与判断记录</summary><p className="gm-muted">保留来源与表述修订，不将导入版本变化当作近期技术进展。</p><label className="gm-inline-label">仅看 MOD<select value={query.get("mod")||""} onChange={e=>{const next=new URLSearchParams(query);if(e.target.value)next.set("mod",e.target.value);else next.delete("mod");setQuery(next);}}><option value="">全部 MOD</option>{p.mods.map(m=><option key={m.id} value={m.componentId}>{m.displayName}</option>)}</select></label><History bundle={bundle} modId={query.get("mod")?"mod:vllm-hust:"+query.get("mod"):undefined}/></details>
 </div>;
}
