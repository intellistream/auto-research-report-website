import { Link } from "react-router-dom";
import { BookOpen, CheckCircle2, CircleHelp, FileSearch, FlaskConical, GitBranch, Layers, ShieldCheck } from "lucide-react";
import type { Bundle, Mod, Question, Relation, Source } from "./types";
import { groupHref, kindLabels, relationLabels, featuredRelation, comparisonSelection, isResearchQuestion, sourceIdentity, uniqueQuestions } from "./selectors";
import { publicUrl } from "./data";
import { inferenceStageNames, modStageView, sourcePhaseLabels, stageMappingVersion } from "./stages";
import { stageDistribution } from "./selectors";
import { modIntroduction, communityIntroduction, dailyReferences, topicReferences, dailyReferenceLabel, comparisonBoundaries } from "./reading-guides";

export function External({href,children}:{href:string;children:React.ReactNode}) {
 const url=publicUrl(href);return url?<a href={url} target="_blank" rel="noopener noreferrer">{children}</a>:<span>{children}</span>;
}
export function Badge({children,tone=""}:{children:React.ReactNode;tone?:string}){return <span className={"gm-badge "+tone}>{children}</span>;}
export function CommunityIdentity({source,compact=true,showTitle=true}:{source:Source;compact?:boolean;showTitle?:boolean}) {
 const status=source.kind==="pr"?(source.version.merged?"已合入":source.version.state==="closed"?"已关闭，未合入":source.version.draft?"草稿，未合入":source.version.state==="open"?"开放，未合入":"合入状态未记录"):String(source.version.edition||"固定论文版本");
 return <div className="gm-community-identity">
  <p className="gm-work-id"><span>{source.kind==="pr"?"社区 PR":"论文参照"}</span><strong>{sourceIdentity(source)}</strong><External href={source.url}>{source.kind==="pr"?"PR 原文":"论文原文"}</External></p>
  {showTitle&&source.titleZh&&<strong>{source.titleZh}</strong>}
  {showTitle&&(!compact||!source.titleZh)&&<p className="gm-original-title">{source.title}</p>}
  <p className="gm-source-state">取材时：{status} · {source.observedOn}</p>
 </div>;
}
export function ModSummary({mod}:{mod:Mod}) {
 return <dl className="gm-mod-summary"><div><dt>做了什么</dt><dd>{modIntroduction(mod)}</dd></div><div><dt>针对什么问题</dt><dd>{mod.facts.problem||"当前公开来源未单列所针对的具体问题。"}</dd></div></dl>;
}
export function ModIntroduction({mod,query}:{mod:Mod;query:URLSearchParams}) {
 return <section className="gm-panel gm-mod-introduction" aria-label="MOD 简介"><h2>先了解 {mod.displayName}</h2><ModSummary mod={mod}/><p className="gm-muted">简介据官方公开实现摘要整理。<Link to={groupHref(mod.componentId,query,{view:"overview",relation:null,question:null})}>查看完整实现、条件与来源</Link></p></section>;
}
export function ReportReadingLinks({source}:{source:Source}) {
 if(source.kind!=="pr")return null;
 const daily=dailyReferences(source),topics=topicReferences(source);
 return <div className="gm-report-reading">{daily.length?<div className="gm-report-actions">{daily.map(ref=><Link key={ref.href} to={ref.href}>{dailyReferenceLabel(ref)}</Link>)}</div>:<><p className="gm-muted">当前材料未关联对应的日报条目。</p>{topics.length>0&&<div className="gm-report-actions">{topics.map(ref=><Link key={ref.href} to={ref.href}>{ref.title}</Link>)}</div>}</>}</div>;
}
export function ModCard({mod,bundle,query}:{mod:Mod;bundle:Bundle;query:URLSearchParams}) {
 const featured=featuredRelation(bundle,mod.id),stageView=modStageView(bundle,mod);
 const clue=bundle.payload.relations.find(r=>r.modId===mod.id&&r.reviewStatus==="candidate");
 const selected=featured||clue,source=selected&&bundle.payload.sourceSnapshots.find(s=>s.id===selected.sourceSnapshotId);
 return <article className="gm-card">
  <div className="gm-card-top"><Badge>{kindLabels[mod.kind]}</Badge><Badge tone={mod.lifecycle==="implemented_restricted"?"warn":""}>{mod.lifecycle==="implemented_restricted"?"已实现，条件受限":"已实现并登记"}</Badge></div>
  <h3><Link to={groupHref(mod.componentId,query,{view:"overview",relation:null,question:null})}>{mod.displayName}</Link></h3>
  <ModSummary mod={mod}/>
  {source&&<div className="gm-card-community"><p className="gm-choice-id">{source.kind==="pr"?(featured?"相关社区 PR":"待核查社区 PR 线索"):"论文参照"} · {sourceIdentity(source)}</p><strong>{source.titleZh||source.title}</strong>{!featured&&<p className="gm-muted">目前只有待核查线索，尚未形成可靠的社区对照。</p>}{source.kind==="pr"?<ReportReadingLinks source={source}/>:<p className="gm-muted">当前参照为论文，未作为社区 PR 收录。</p>}</div>}
  {!source&&<p className="gm-card-community gm-muted">{clue?"目前只有待核查线索，尚未形成可靠的社区对照。":"社区对照待整理。"}</p>}
  <p className="gm-card-meta">{stageView.stages.length?stageView.stages.map(id=>inferenceStageNames[id as keyof typeof inferenceStageNames]).join("、"):"八环节位置尚未明确"}<br/>登记维护者：{mod.maintainers.map(m=>m.name).join("、")||"未登记"}</p>
  <div className="gm-card-bottom">{featured?<Link to={groupHref(mod.componentId,query,{view:"compare",relation:null,question:null})}>查看社区对照</Link>:clue?<Link to={groupHref(mod.componentId,query,{view:"compare",relation:clue.id,question:null})}>查看待核查线索</Link>:<span>社区对照待整理</span>}</div>
 </article>;
}
function valueText(v:unknown):string {if(v==null)return "未明确";if(Array.isArray(v))return v.map(valueText).join("；");if(typeof v==="object")return Object.entries(v).map(([k,val])=>k+"："+valueText(val)).join("；");return String(v);}
export function SourceDetail({source}:{source:Source}) {
 return <details className="gm-source"><summary><FileSearch size={16} aria-hidden/>来源、版本与核查范围</summary>
  <p><External href={source.url}>{source.title}</External></p><p>{source.reviewScope}</p>
  {!!source.reportReferences?.length&&<><h4>站内研报出处</h4><ul>{source.reportReferences.map((r,i)=><li key={r.href+i}><Link to={r.href}>{r.title}</Link>{r.role==="daily_reference"&&"（正文附加引用）"}</li>)}</ul></>}
  <dl className="gm-kv"><dt>身份</dt><dd>{source.canonicalWorkId}</dd><dt>取材日期</dt><dd>{source.observedOn}</dd>
  {Object.entries(source.version).map(([k,v])=><div className="gm-kv-row" key={k}><dt>{k}</dt><dd>{valueText(v)}</dd></div>)}
  <dt>来源制品 SHA-256</dt><dd><code>{source.contentSha256}</code></dd></dl>
 </details>;
}
function StageMappingDetail({bundle,mod}:{bundle:Bundle;mod:Mod}) {
 const view=modStageView(bundle,mod);
 return <div className="gm-stage-basis">
  <p>{view.stages.length?"作用环节："+view.stages.map(id=>inferenceStageNames[id as keyof typeof inferenceStageNames]).join("、"):"八环节位置尚未明确；此 MOD 保留在完整目录，不计入环节关联。"}</p>
  <p>{view.basis}</p>
  <p className="gm-muted">官网阶段分类（辅助资料）：{view.sourcePhases.length?view.sourcePhases.map(id=>(sourcePhaseLabels[id]||id)+"（"+id+"）").join("、"):"此版本未提供可核对的原始阶段分类"}。</p>
  {view.compatibilityProjection&&<p className="gm-muted">原始快照分类：{mod.stages.map(id=>bundle.payload.stages[id]||id).join("、")||"未列出"}。历史正文保留，当前页面另用八环节映射展示。</p>}
  <details className="gm-source"><summary>映射版本与来源定位</summary><p>映射版本：{view.version}</p>{view.sourceRefs.map(ref=><div key={ref.sourceId+ref.jsonPointer}><p><External href={"https://vllm-hust.sage.org.ai/data/"+(ref.sourceId.includes("mod-taxonomy")?"mod-taxonomy":"ecosystem")+".json"}>{ref.sourceId.includes("mod-taxonomy")?"官网阶段分类":"官网 MOD 摘要"}</External> · <code>{ref.jsonPointer}</code></p><p><code>{ref.valueSha256}</code></p></div>)}</details>
 </div>;
}
export function StageMappingSources({bundle,query}:{bundle:Bundle;query:URLSearchParams}) {
 const {total,mappedCount,unmappedCount,legacyProjectionCount}=stageDistribution(bundle);
 return <section className="gm-panel"><h2>八环节与 MOD 映射口径</h2>
  <p>与首页一致，按{Object.values(inferenceStageNames).join("、")}的顺序展示；“全部环节”只表示不限制筛选。</p>
  <p>{mappedCount} 个 MOD 有可核对的环节位置，共 {total} 次有效关联；{unmappedCount} 个尚未映射，仍可在目录与社区对照中阅读。一个 MOD 涉及多环节时分环节关联，但目录只显示一次。</p>
  <p>状态生命周期、可观测与服务管理是官网辅助分类，不能直接当作新的推理流程环节，也不能统一改名为资源回收。占比分母使用所看快照的全部有效八环节关联，不随列表筛选变化。</p>
  {legacyProjectionCount>0&&<p className="gm-notice">此历史快照的原始分类和下载文件保持不变。页面仅在摘要哈希与官网分类版本相符时采用已核对映射；不匹配的来源保留未映射说明。旧辅助分类 stage 链接仍按其原始含义筛选，不改成新的流程环节。</p>}
  <details className="gm-stage-mapping-list"><summary>逐项映射依据（{bundle.payload.mods.length} 个 MOD）</summary><p className="gm-muted">映射版本 {bundle.payload.stageMappingVersion||stageMappingVersion}；下列判断仅说明展示位置，不表示实现、兼容或性能验收。</p>{bundle.payload.mods.map(mod=><section key={mod.id}><h3><Link to={groupHref(mod.componentId,query,{view:"overview",relation:null,question:null})}>{mod.displayName}</Link></h3><StageMappingDetail bundle={bundle} mod={mod}/></section>)}</details>
 </section>;
}
export function Profile({mod,bundle}:{mod:Mod;bundle:Bundle}) {
 const source=bundle.payload.sourceSnapshots.find(s=>s.id===mod.sourceRefs[0]?.sourceSnapshotId);
 const coverage=bundle.payload.coverage.find(c=>c.modId===mod.id),screening=coverage?.screening;
 const labels:Record<string,string>={status:"来源兼容状态",host:"宿主",versions:"固定版本",platforms:"硬件与执行模式",models:"模型",python:"Python",requirements_zh:"资格条件",requirements_en:"资格条件（原文）"};
 return <div className="gm-profile">
  <section className="gm-panel"><h2><Layers size={20} aria-hidden/>MOD 简介与针对的问题</h2><ModSummary mod={mod}/>
   <p className="gm-muted">{mod.facts.problemBasis==="source_insufficient"?"当前来源未明确具体问题，不从功能名称反推原有故障或瓶颈。":"本站根据官方实现摘要、已报告结果与适用条件归纳，非作者原文逐句引用。"}</p>
   <details className="gm-source"><summary>官方实现摘要原文</summary><p className="gm-preserve">{mod.facts.summary}</p></details></section>
  <section className="gm-panel"><h2>推理环节与来源分类</h2><StageMappingDetail bundle={bundle} mod={mod}/></section>
  <section className="gm-panel"><h2>社区材料核查进度</h2>{screening?<><p>已完成本轮材料初筛，召回 {screening.candidateCount} 条线索；已核查 {screening.reviewedCount} 条，待核查 {screening.pendingCount} 条。</p><p className="gm-muted">{screening.note}</p>{screening.candidateCount===0&&<p className="gm-muted">初筛未召回线索不表示社区没有相关工作。</p>}</>:<p>{coverage?.missingEvidenceMessage||"此快照未单列该 MOD 的材料初筛与核查进度；对照以各条来源记录为准。"}</p>}</section>
  <section className="gm-panel"><h2><ShieldCheck size={20} aria-hidden/>已报告成果与边界</h2>
   <p className="gm-preserve">{mod.facts.effect||"官方公开资料尚未单列效果；实现登记不等于性能收益已确认。"}</p>
   <p className="gm-notice">以上为官方资料中的结果及条件。本次核查未运行 MOD 或复现实验。</p>
   <details><summary>适用条件与原始状态</summary><dl className="gm-kv">
    {Object.entries(mod.facts.compatibility).filter(([k])=>k!=="requirements_en"||!mod.facts.compatibility.requirements_zh).map(([k,v])=><div className="gm-kv-row" key={k}><dt>{labels[k]||k}</dt><dd>{valueText(v)}</dd></div>)}
    {Object.entries(mod.originalStatus).map(([k,v])=><div className="gm-kv-row" key={k}><dt>{k}</dt><dd>{v||"未明确"}</dd></div>)}
   </dl></details></section>
  <section className="gm-panel"><h2>归属与来源</h2><p>{mod.attribution}</p>
   <p>官方登记维护者：{mod.maintainers.map(m=>m.name+"（"+m.login+"）").join("、")||"未登记"}。独立项目负责人未明确。</p>
   <div className="gm-actions"><External href={mod.canonicalPage}>官网 MOD 登记</External>{mod.repository?<External href={mod.repository}>公开实现仓库</External>:<span>本次来源未登记公开实现仓库</span>}</div>
   {source&&<SourceDetail source={source}/>}
   <details className="gm-source"><summary>具体登记定位</summary>{mod.sourceRefs.map(r=><dl className="gm-kv" key={r.locator}><dt>JSON 定位</dt><dd><code>{r.locator}</code></dd><dt>登记 ID</dt><dd>{r.identityValue}</dd><dt>字段内容 SHA-256</dt><dd><code>{r.valueSha256}</code></dd></dl>)}</details>
  </section>
  <details className="gm-panel gm-version-history"><summary>本 MOD 的版本与表述记录</summary><History bundle={bundle} modId={mod.id}/></details>
 </div>;
}
const resultNames:Record<string,string>={matched:"条件相符",different:"条件不同",incompatible:"条件不匹配",unknown:"尚未明确",not_applicable:"不适用"};
const applicabilityNames:Record<string,string>={comparable:"可比较所述机制",partially_comparable:"部分条件不同",incompatible:"当前配置存在冲突",unknown:"适用条件尚未明确"};
function EvidenceLinks({relation:r,bundle,code=false}:{relation:Relation;bundle:Bundle;code?:boolean}) {
 const mod=bundle.payload.mods.find(m=>m.id===r.modId)!;
 const community=bundle.payload.sourceSnapshots.find(s=>s.id===r.sourceSnapshotId);
 const modSources=[...new Set(r.modEvidence.map(e=>e.sourceSnapshotId))].map(id=>bundle.payload.sourceSnapshots.find(s=>s.id===id)).filter((s):s is Source=>!!s);
 return <p className="gm-evidence-links"><span>来源：</span>{modSources.length?modSources.map((s,i)=><External key={s.id} href={s.url}>MOD 原文{modSources.length>1?" "+(i+1):""}</External>):<External href={mod.canonicalPage}>MOD 登记</External>}{community&&<External href={community.url}>{community.kind==="pr"?"PR 原文":"论文原文"}</External>}{community?.reportReferences?.slice(0,2).map((ref,i)=><Link key={ref.href+i} to={ref.href}>{ref.title}</Link>)}{code&&r.codeReferences?.map((e,i)=><External key={e.url+e.label} href={e.url}>{e.side==="mod"?"MOD":"社区"}代码{r.codeReferences!.length>1?" "+(i+1):""}</External>)}</p>;
}
function ResearchInsight({relation,bundle,query}:{relation:Relation;bundle:Bundle;query:URLSearchParams}) {
 if(relation.reviewStatus!=="supported")return null;
 const questions=uniqueQuestions(bundle.payload.questions.filter(q=>isResearchQuestion(q)&&q.relationIds.includes(relation.id)));
 const mod=bundle.payload.mods.find(m=>m.id===relation.modId)!;
 if(!questions.length)return null;
 return <aside className="gm-research-insight" aria-label="由这项对照提出的研究问题"><h3>研究启示</h3><div>{questions.map(q=><section key={q.id}><Link className="gm-insight-title" to={groupHref(mod.componentId,query,{view:"compare",relation:relation.id,question:q.id})}>{q.title}</Link><p>{q.researchContext?.significance||q.basis}</p><p className="gm-insight-observations"><strong>怎样观察：</strong>{q.minimumValidation.metrics.join("；")}。</p></section>)}<p className="gm-insight-state">这些是待验证的研究问题；完整假设、对照方案与否证标准在下方保留。</p></div></aside>;
}
function ComparisonOverview({mod,source,relation:r,bundle,query,conditions}:{mod:Mod;source:Source|undefined;relation:Relation;bundle:Bundle;query:URLSearchParams;conditions:{mod:string;community:string}}) {
 const boundaries=comparisonBoundaries(r,source);
 return <div className="gm-comparison-overview">
  <div className="gm-focus-banner"><strong>{r.reviewStatus==="supported"?"对照关注的问题":r.reviewStatus==="candidate"?"待核查线索":"已否定或撤回的关联"}</strong><p>{r.commonProblem}</p></div>
  <div className="gm-side-by-side" aria-label="组内 MOD 与社区工作的做法和边界">
   <section className="gm-side gm-side-mod"><span className="gm-side-tag">组内 MOD</span><h3>{mod.displayName}</h3><p className="gm-side-approach">{modIntroduction(mod)}</p><div className="gm-side-boundary"><h4>边界</h4><p>{boundaries?.mod||conditions.mod}</p></div><Link className="gm-side-source" to={groupHref(mod.componentId,query,{view:"overview",relation:null,question:null})}>查看 MOD 实现与来源</Link></section>
   <section className="gm-side gm-side-community"><span className="gm-side-tag">{source?.kind==="pr"?"社区 PR":"论文参照"}</span><h3>{source?.titleZh||source?.title||r.communityWorkId}</h3>{source&&<CommunityIdentity source={source} showTitle={false}/>}<p className="gm-side-approach">{source?communityIntroduction(source,r):r.communityApproach}</p><div className="gm-side-boundary"><h4>边界</h4><p>{boundaries?.community||conditions.community}</p></div>{source&&<ReportReadingLinks source={source}/>}</section>
  </div>
  <ResearchInsight relation={r} bundle={bundle} query={query}/>
 </div>;
}
export function Comparison({relation:r,bundle,query=new URLSearchParams()}:{relation:Relation;bundle:Bundle;query?:URLSearchParams}) {
 const source=bundle.payload.sourceSnapshots.find(s=>s.id===r.sourceSnapshotId);
 const mod=bundle.payload.mods.find(m=>m.id===r.modId)!;
 const rejected=r.reviewStatus==="unsupported"||r.reviewStatus==="withdrawn";
 const fallbackAxes=[
  {dimension:"具体问题",mod:mod.facts.problem||mod.facts.summary,community:r.commonProblem},
  {dimension:"处理方法",mod:r.modApproach,community:r.communityApproach},
  {dimension:"适用条件",mod:r.applicability.checks.map(c=>c.dimension+"："+c.mod).join("；")||"此版本未单列适用条件。",community:r.applicability.checks.map(c=>c.dimension+"："+c.community).join("；")||"此版本未单列适用条件。"},
  {dimension:"已有结果",mod:mod.facts.effect||"官方公开资料尚未单列效果。",community:"此版本未单列社区结果；需结合原文与所述核查范围阅读。"},
 ];
 const resultDimensions=["效果边界","实测与范围"];
 const usedDimensions=new Set<string>();
 const axes=fallbackAxes.map(fallback=>{
  const original=r.comparisonAxes?.find(a=>a.dimension===fallback.dimension)||(fallback.dimension==="已有结果"?r.comparisonAxes?.find(a=>resultDimensions.includes(a.dimension)):undefined);
  if(original)usedDimensions.add(original.dimension);
  return original?{...original,dimension:fallback.dimension}:fallback;
 });
 const extraAxes=(r.comparisonAxes||[]).filter(a=>!usedDimensions.has(a.dimension));
 function comparisonTable(rows:typeof axes,caption:string) {
  return <table className="gm-method-table"><caption>{caption}</caption><thead><tr><th scope="col">比较维度</th><th scope="col">{mod.displayName}</th><th scope="col">{source?.kind==="pr"?"社区 PR":"论文方法"}</th></tr></thead><tbody>{rows.map(a=><tr key={a.dimension}><th scope="row">{a.dimension}</th><td><span className="gm-cell-label">MOD · {mod.displayName}</span>{a.mod}</td><td><span className="gm-cell-label">{source?.kind==="pr"?"PR":"论文"} · {source?sourceIdentity(source):r.communityWorkId}</span>{a.community}</td></tr>)}</tbody></table>;
 }
 return <article className="gm-panel gm-comparison" id={r.id} tabIndex={-1}>
  <div className="gm-card-top"><Badge tone={r.reviewStatus==="supported"?"":"warn"}>{relationLabels[r.reviewStatus]}</Badge><Badge tone={r.applicability.state==="incompatible"?"warn":""}>{applicabilityNames[r.applicability.state]||"适用条件待核查"}</Badge>{r.reviewNeeded&&<Badge tone="warn">需复核</Badge>}</div>
  <h2>当前比较：{mod.displayName} ↔ {source?sourceIdentity(source):r.communityWorkId}</h2>
  <ComparisonOverview mod={mod} source={source} relation={r} bundle={bundle} query={query} conditions={axes.find(a=>a.dimension==="适用条件")!}/>
  {r.reviewNeeded&&<p className="gm-notice">{r.reviewNeededReasons.join(" ")}</p>}
  {rejected&&<p className="gm-notice">此关系已{r.reviewStatus==="withdrawn"?"撤回":"否定"}，仅保留核查记录，不作为可跟进候选或有据对照。</p>}
  <h3>{r.reviewStatus==="supported"?"为什么放在一起比较":r.reviewStatus==="candidate"?"线索的核查范围":"该关系的核查理由"}</h3>
  <p className="gm-association">{r.associationReason||r.commonProblem}</p>
  <EvidenceLinks relation={r} bundle={bundle}/>
  <h3>按相同维度比较</h3>
  {comparisonTable(axes,"组内 MOD 与"+(source?.kind==="pr"?"社区 PR":"论文参照")+"的问题、方法、条件与结果")}
  {!!extraAxes.length&&<details className="gm-comparison-supplement"><summary>更多机制与配置差异</summary>{comparisonTable(extraAxes,"原始对照中的补充维度")}</details>}
  {!!r.differences.length&&<><h3>需要保留的差异</h3><ul>{r.differences.map((d,i)=><li key={i}>{d}</li>)}</ul></>}
  <h3>这项对照说明什么</h3><p>{r.researchSignificance||r.reusableCapability}</p><p>{r.conclusionScope}</p>
  <EvidenceLinks relation={r} bundle={bundle} code/>
  <p className="gm-notice"><strong>{r.reviewStatus==="supported"?"验证边界：":"判断边界："}</strong>{r.forbiddenInference}</p>
  <details><summary>完整适用条件与验证边界</summary><div className="gm-condition-list">{r.applicability.checks.map((c,i)=><section className="gm-condition" key={i}><header><strong>{c.dimension}</strong><Badge tone={c.result==="incompatible"?"warn":""}>{resultNames[c.result]||"尚未明确"}</Badge></header><div><p><span>MOD</span>{c.mod}</p><p><span>社区工作</span>{c.community}</p></div></section>)}</div></details>
  {!!r.codeReferences?.length&&<details className="gm-code-references"><summary>代码摘录与固定版本（{r.codeReferences.length}）</summary>{r.codeReferences.map(e=><div key={e.url+e.label}><p><span>{e.side==="mod"?"MOD":"社区"}</span><External href={e.url}>{e.label}</External></p><p><small>固定版本 <code>{e.revision}</code></small></p><pre>{e.excerpt}</pre></div>)}</details>}
  <p className="gm-muted">核查日期：{r.assessedOn} · 记录者：{r.assessedBy}</p>
  {source&&<SourceDetail source={source}/>}
  <details className="gm-source"><summary>引用定位与核查记录</summary><h4>MOD 原文定位</h4>{r.modEvidence.map((e,i)=><p key={i}><code>{e.identityValue} · {e.jsonPointer}</code></p>)}<h4>社区原文定位</h4>{r.communityEvidence.map((e,i)=><p key={i}>{e.sourceId} · {valueText(e.locator)}</p>)}</details>
 </article>;
}
export function ComparisonCollection({bundle,modId,query,selectedRelation}:{bundle:Bundle;modId:string;query:URLSearchParams;selectedRelation:string|null}) {
 const {prs,papers,candidates,rejected,current,defaultFromSnapshotOrder}=comparisonSelection(bundle,modId,selectedRelation);
 const mod=bundle.payload.mods.find(m=>m.id===modId)!;
 function choices(rows:Relation[]) {
  return <ul className="gm-relation-choices">{rows.map(r=>{const source=bundle.payload.sourceSnapshots.find(s=>s.id===r.sourceSnapshotId);return <li key={r.id}><Link aria-current={current?.id===r.id?"page":undefined} to={groupHref(mod.componentId,query,{view:"compare",relation:r.id,question:null})}><span className="gm-choice-id">{source?sourceIdentity(source):r.communityWorkId}</span><strong>{source?.titleZh||source?.title||r.communityWorkId}</strong><span className="gm-choice-reason">{r.commonProblem}</span></Link>{source&&<ReportReadingLinks source={source}/>}</li>;})}</ul>;
 }
 return <>
  {(!!prs.length||!!papers.length)&&<section className="gm-panel gm-comparison-picker" aria-labelledby="gm-comparison-picker-title"><h2 id="gm-comparison-picker-title">选择比较对象</h2>
   {!!prs.length&&<nav aria-label="选择社区 PR"><h3>社区 PR</h3>{choices(prs)}</nav>}
   {!!papers.length&&<nav aria-label="选择论文参照"><h3>论文参照</h3><p className="gm-muted">论文单独列出，不计入社区 PR。</p>{choices(papers)}</nav>}
   {!prs.length&&!!papers.length&&<p className="gm-notice">本 MOD 当前仅有论文参照，尚未形成有据社区 PR 对照。</p>}
   {defaultFromSnapshotOrder&&<p className="gm-muted">此版本未指定默认核心{prs.length?" PR":"论文"}，按快照保留顺序显示首条有据{prs.length?" PR":"论文参照"}；可在上方切换。</p>}
  </section>}
  {!prs.length&&!papers.length&&<Empty>{bundle.payload.coverage.find(c=>c.modId===modId)?.missingEvidenceMessage||"本轮尚未完成该 MOD 的有据社区方法对照；不表示社区没有相关工作。"}</Empty>}
  {current?.reviewStatus==="supported"&&<Comparison relation={current} bundle={bundle} query={query}/>}
  {!!candidates.length&&<details className="gm-panel gm-secondary gm-candidate-records" open={current?.reviewStatus==="candidate"}><summary>待核查线索（{candidates.length}） · 不计入有据对照</summary><p className="gm-muted">以下关系仍待核查，不能据此推导共同方法、可直接复用能力或性能收益。选择一条查看核查范围。</p>{choices(candidates)}{current?.reviewStatus==="candidate"&&<Comparison relation={current} bundle={bundle} query={query}/>}</details>}
  {!!rejected.length&&<details className="gm-panel gm-secondary gm-rejected-records" open={current?.reviewStatus==="unsupported"||current?.reviewStatus==="withdrawn"}><summary>已否定或撤回的关系（{rejected.length}）</summary><p className="gm-muted">保留判断及来源记录，不列为可跟进候选。</p>{choices(rejected)}{(current?.reviewStatus==="unsupported"||current?.reviewStatus==="withdrawn")&&<Comparison relation={current} bundle={bundle} query={query}/>}</details>}
 </>;
}
export function QuestionCard({question:q,bundle,query,showModContext=true}:{question:Question;bundle:Bundle;query:URLSearchParams;showModContext?:boolean}) {
 const states:Record<string,string>={proposed:"待验证",validating:"验证中",resolved:"已形成有据结论",contradicted:"假设不成立",retired:"已停止跟踪"};
 const research=isResearchQuestion(q), context=q.researchContext;
 const relations=[...new Set(q.relationIds)].map(id=>bundle.payload.relations.find(r=>r.id===id)).filter((r):r is Relation=>!!r);
 return <article className={"gm-panel gm-question"+(research?"":" gm-verification")} id={q.id} tabIndex={-1}>
  <div className="gm-card-top"><Badge>{research?"后续研究问题":"附属验证待办"}</Badge><Badge tone="warn">{states[q.status]||q.status}</Badge><Badge>{q.experimentStatus==="not_run"?"未运行实验":q.experimentStatus}</Badge>{q.reviewNeeded&&<Badge tone="warn">需复核</Badge>}</div>
  <h2>{q.title}</h2>
  <div className="gm-question-targets"><span>{research?"从这组具体对照出发":"MOD 自身的验证任务"}</span><div className="gm-question-mods">{q.modIds.map(id=>{const m=bundle.payload.mods.find(x=>x.id===id);return m?<div key={id}><Link to={groupHref(m.componentId,query,{view:research?"compare":"overview",question:null,relation:null})}>{m.displayName}</Link>{showModContext?<ModSummary mod={m}/>:context&&<p className="gm-question-mod-progress">{context.modProgress}</p>}</div>:null;})}</div>
   {research&&(["pr","paper"] as const).map(kind=>{const rows=relations.filter(r=>bundle.payload.sourceSnapshots.find(s=>s.id===r.sourceSnapshotId)?.kind===kind);return rows.length?<section className="gm-question-work-group" key={kind}><h3>{kind==="pr"?"关联社区 PR":"论文参照"}</h3>{rows.map(r=>{const source=bundle.payload.sourceSnapshots.find(s=>s.id===r.sourceSnapshotId)!;const mod=bundle.payload.mods.find(m=>m.id===r.modId)!;return <div key={r.id}><CommunityIdentity source={source} compact/><p className="gm-community-summary">{communityIntroduction(source,r)}</p><ReportReadingLinks source={source}/><Link className="gm-inline-comparison-link" to={groupHref(mod.componentId,query,{view:"compare",relation:r.id,question:null})}>阅读这条具体对照</Link></div>;})}</section>:null;})}
  </div>
  {q.hypothesis&&<div className="gm-question-insight"><h3>研究启示与待验证假设</h3><p>{q.hypothesis}</p></div>}
  {research&&context&&<><div className="gm-progress-comparison"><section><h3>MOD 已有进展</h3><p>{context.modProgress}</p></section><section><h3>社区已有进展</h3><p>{context.communityProgress}</p></section></div><p><strong>已知差异：</strong>{context.difference}</p><p><strong>研究意义：</strong>{context.significance}</p></>}
  <p><strong>判断依据：</strong>{q.basis}</p>
  <details className="gm-experiment"><summary><FlaskConical size={16} aria-hidden/>{research?"对照实验方案：条件、指标与否证标准":"验证步骤与完成条件"}</summary>
   <p><strong>前置条件：</strong>{q.minimumValidation.prerequisites}</p>
   <h3>对比方案</h3><ul>{q.minimumValidation.baselines.map((v,i)=><li key={i}>{v}</li>)}</ul>
   <h3>固定条件与负载变化</h3><ul>{q.minimumValidation.controls.map((v,i)=><li key={i}>{v}</li>)}</ul>
   <h3>观测指标</h3><ul>{q.minimumValidation.metrics.map((v,i)=><li key={i}>{v}</li>)}</ul>
   <p><strong>什么结果会否定假设：</strong>{q.minimumValidation.failureCriterion}</p>
   {!!q.verificationTasks?.length&&<><h3>附属验证待办</h3><ul>{q.verificationTasks.map((v,i)=><li key={i}>{v}</li>)}</ul></>}
  </details>
  <p className="gm-muted">负责人：{q.owner||"待明确"} · 最后核查：{q.lastReviewedOn}</p>
 </article>;
}
export function QuestionCollection({questions,bundle,query,selectedQuestion,showAll=false,showModContext=true}:{questions:Question[];bundle:Bundle;query:URLSearchParams;selectedQuestion:string|null;showAll?:boolean;showModContext?:boolean}) {
 const visible=uniqueQuestions(questions).filter(q=>showAll||!selectedQuestion||q.id===selectedQuestion), research=visible.filter(isResearchQuestion), verification=visible.filter(q=>!isResearchQuestion(q));
 if(!visible.length)return <Empty>本轮当前筛选没有对应的后续研究问题或验证待办。</Empty>;
 return <>
  <p className="gm-result" role="status">{research.length} 个后续研究问题 · {verification.length} 个附属验证待办 · 实验方案不代表已运行实验</p>
  {research.map(q=><QuestionCard key={q.id} question={q} bundle={bundle} query={query} showModContext={showModContext}/>)}
  {!research.length&&<p className="gm-muted">本轮未形成由有据社区 PR 对照提出的研究问题；附属验证待办单独保留。</p>}
  {!!verification.length&&<details className="gm-panel gm-secondary" open={verification.some(q=>q.id===selectedQuestion)||query.get("kind")==="evidence_gap"}><summary>附属验证待办（{verification.length}）</summary><p className="gm-muted">生效记录、日志和版本核对用于确认验证条件，不代表新的算法研究问题。</p>{verification.map(q=><QuestionCard key={q.id} question={q} bundle={bundle} query={query} showModContext={showModContext}/>)}</details>}
 </>;
}
export function History({bundle,modId}:{bundle:Bundle;modId?:string}) {
 const p=bundle.payload, rows=p.changes.filter(c=>!modId||!c.modIds.length||c.modIds.includes(modId));
 return <div className="gm-history"><h2><GitBranch size={20} aria-hidden/>变化记录</h2>
  {!p.previousSnapshotId&&<p className="gm-notice">已建立首份快照，尚无前一份可对比。首次收录不计为新增研究进展。</p>}
  {rows.map(c=><article className="gm-panel" key={c.id}><small>{c.recordedOn}</small><h3>{c.title}</h3><p>{c.detail}</p>{c.before&&c.after&&<details><summary>查看记录变化</summary><div className="gm-compare-columns"><section><h4>之前</h4><p>{valueText(c.before)}</p></section><section><h4>本次</h4><p>{valueText(c.after)}</p></section></div></details>}{c.previousSnapshotId&&<Link to={"/group-mods/changes?snapshot="+c.previousSnapshotId}>查看前一份快照</Link>}</article>)}
  {!rows.length&&<p className="gm-empty">该 MOD 在所选快照中没有已记录的变化。</p>}
  <p className="gm-muted">来源版本变化只触发复核，不自动证明技术进展或性能改善。</p>
 </div>;
}
export function Empty({children}:{children:React.ReactNode}){return <div className="gm-empty"><CircleHelp size={23} aria-hidden/><p>{children}</p></div>;}
export const sectionIcons={overview:Layers,compare:BookOpen,questions:FlaskConical,history:CheckCircle2};
