import type { Bundle, Mod, ModSearch, Question, Relation, Source } from "./types";
import { inferenceStageNames, modStageView, isInferenceStage, legacyStageLabels, hasLegacyStage } from "./stages";

export const kindLabels:Record<string,string>={runtime_mod:"运行时 MOD",connector_mod:"连接器 MOD",tool_mod:"工具 MOD"};
export const relationLabels:Record<string,string>={supported:"关联依据已核查",candidate:"候选待核查",unsupported:"已否定该关系",withdrawn:"已撤回该关系"};
export const relationStateLabels:Record<string,string>={supported:"有依据对照",candidate:"候选待核查",unassessed:"尚未形成对照",review_needed:"需复核",rejected:"已否定或撤回"};
export const questionKinds:Record<string,string>={evidence_gap:"证据缺口",validation_question:"条件验证",research_candidate:"研究候选"};
export const normalize=(s:string)=>s.normalize("NFKC").trim().toLocaleLowerCase();

export function searchMods(rows:ModSearch[],query:string) {
 const q=normalize(query);
 return rows.filter(m=>normalize([m.displayName,...m.aliases,m.problemSummary,...m.maintainerNames,...(m.relatedWorks||[])].join(" ")).includes(q));
}
export function relationState(bundle:Bundle,modId:string) {
 const rows=bundle.payload.relations.filter(r=>r.modId===modId);
 const active=rows.filter(r=>r.reviewStatus==="supported"||r.reviewStatus==="candidate");
 return active.some(r=>r.reviewNeeded)?"review_needed":active.some(r=>r.reviewStatus==="supported")?"supported":active.length?"candidate":rows.length?"rejected":"unassessed";
}
export function filterMods(bundle:Bundle,query:URLSearchParams):Mod[] {
 const q=normalize(query.get("q")||""),stage=query.get("stage"),kind=query.get("kind"),state=query.get("relationStatus");
 const stageMatches=(m:Mod)=>!stage||(isInferenceStage(stage)?modStageView(bundle,m).stages.includes(stage):Object.hasOwn(legacyStageLabels,stage)?hasLegacyStage(m,stage):true);
 return bundle.payload.mods.filter(m=>
  stageMatches(m)&&(!kind||!Object.hasOwn(kindLabels,kind)||m.kind===kind)&&
  (!state||!Object.hasOwn(relationStateLabels,state)||relationState(bundle,m.id)===state)&&
  (!q||normalize([m.displayName,m.sourceName,m.facts.problem,m.facts.summary,...m.aliases,...m.maintainers.map(v=>v.name+" "+v.login),...bundle.payload.relations.filter(r=>r.modId===m.id).flatMap(r=>{const source=bundle.payload.sourceSnapshots.find(s=>s.id===r.sourceSnapshotId);return [r.communityWorkId,source?.title,source?.titleZh];})].join(" ")).includes(q))
 );
}
// The denominator always covers all valid eight-stage associations in this snapshot.
export function stageDistribution(bundle:Bundle) {
 const views=bundle.payload.mods.map(m=>modStageView(bundle,m));
 const stages=Object.entries(inferenceStageNames).map(([id,name])=>({
  id,name,count:views.filter(v=>v.stages.includes(id)).length,
 }));
 const total=stages.reduce((sum,stage)=>sum+stage.count,0);
 const mappedCount=views.filter(v=>v.stages.length>0).length;
 return {total,mappedCount,unmappedCount:views.length-mappedCount,legacyProjectionCount:views.filter(v=>v.compatibilityProjection).length,stages:stages.map(stage=>({...stage,share:total?stage.count/total*100:0}))};
}
export function invalidFilters(bundle:Bundle,query:URLSearchParams) {
 const definitions:[string,Record<string,unknown>][]=[["stage",{...inferenceStageNames,...legacyStageLabels}],["kind",kindLabels],["relationStatus",relationStateLabels]];
 return definitions.filter(([key,values])=>query.has(key)&&!Object.hasOwn(values,query.get(key)!)).map(([key])=>key);
}
export function groupHref(componentId:string|null,query:URLSearchParams,changes:Record<string,string|null>={}) {
 const next=new URLSearchParams(query);
 for(const [key,value] of Object.entries(changes)){if(value===null)next.delete(key);else next.set(key,value);}
 const suffix=next.toString();
 return "/group-mods"+(componentId?"/"+encodeURIComponent(componentId):"")+(suffix?"?"+suffix:"");
}
export function resetModFilters(query:URLSearchParams) {
 const next=new URLSearchParams();
 if(query.has("snapshot"))next.set("snapshot",query.get("snapshot")!);
 return next;
}
export const isResearchQuestion=(q:Question)=>q.purpose?q.purpose==="research":q.kind==="research_candidate";
export const sourceIdentity=(s:Source)=>s.kind==="pr"?s.canonicalWorkId.replace(/^github:/,"").replace("#"," #"):s.canonicalWorkId.replace(/^paper:/,"");

/** Preserve editorial order. A source's date, number or score never determines importance. */
export function comparisonSelection(bundle:Bundle,modId:string,relationId:string|null=null) {
 const rows=bundle.payload.relations.filter(r=>r.modId===modId);
 const sourceKind=(r:Relation)=>bundle.payload.sourceSnapshots.find(s=>s.id===r.sourceSnapshotId)?.kind;
 const prs=rows.filter(r=>r.reviewStatus==="supported"&&sourceKind(r)==="pr");
 const papers=rows.filter(r=>r.reviewStatus==="supported"&&sourceKind(r)==="paper");
 const candidates=rows.filter(r=>r.reviewStatus==="candidate");
 const rejected=rows.filter(r=>r.reviewStatus==="unsupported"||r.reviewStatus==="withdrawn");
 const primaryId=bundle.payload.coverage.find(c=>c.modId===modId)?.primaryRelationId;
 const pool=prs.length?prs:papers;
 const primary=pool.find(r=>r.id===primaryId);
 const current=relationId?rows.find(r=>r.id===relationId):primary||pool[0];
 return {prs,papers,candidates,rejected,current,defaultFromSnapshotOrder:!relationId&&!primary&&pool.length>0};
}
export function featuredRelation(bundle:Bundle,modId:string) {
 return comparisonSelection(bundle,modId).current;
}
export function uniqueQuestions(questions:Question[]) {
 return [...new Map(questions.map(q=>[q.id,q])).values()];
}
