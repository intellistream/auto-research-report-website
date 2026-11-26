import { describe,it,expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import actualIndex from "../../../public/group-research/index.json";
import { GroupModContent } from "../../pages/GroupMods";
import DocxPreview from "../../pages/DocxPreview";
import { decodeBundle,digest,validateIndex } from "./data";
import { comparisonSelection,filterMods,searchMods,groupHref,stageDistribution,resetModFilters,relationState } from "./selectors";
import { QuestionCard } from "./components";
import { inferenceStageNames,modStageView,stageMappingVersion } from "./stages";
import mappingDocument from "../../../data/group-research/inference-stage-mapping.v1.json";
import type { Bundle,GroupIndex,Question,Relation,Source } from "./types";

const index=actualIndex as unknown as GroupIndex;
const row=index.snapshots.find(s=>s.snapshotId===index.currentSnapshotId)!;
const frozen=import.meta.glob<string>("../../../public/group-research/versions/*/bundle.json",{eager:true,query:"?raw",import:"default"});
const text=Object.entries(frozen).find(([key])=>key.endsWith(row.bundlePath!))![1];
const bundle=JSON.parse(text) as Bundle;
const baselineRow=index.snapshots.find(s=>s.isBaseline)!;
const baselineBundle=JSON.parse(Object.entries(frozen).find(([key])=>key.endsWith(baselineRow.bundlePath!))![1]) as Bundle;
const render=(url:string,data:Bundle=bundle)=>renderToStaticMarkup(<MemoryRouter initialEntries={[url]}><GroupModContent bundle={data} index={index}/></MemoryRouter>);
const decode=(s:string)=>s.replace(/&amp;/g,"&");
const links=(html:string)=>[...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map(m=>({href:decode(m[1].match(/href="([^"]*)"/)?.[1]||""),text:m[2].replace(/<[^>]+>/g,""),attrs:m[1]}));
const articles=(html:string)=>[...html.matchAll(/<article class="gm-card">[\s\S]*?<\/article>/g)].map(m=>m[0]);
const comparisonIds=(html:string)=>[...html.matchAll(/<article class="gm-panel gm-comparison" id="([^"]+)"/g)].map(m=>m[1]);
const mainId="mod:vllm-hust:fixture",otherId="mod:vllm-hust:other";

/** Controlled relationships exercise UI behavior independently of the expanding corpus. */
function fixture() {
 const data=structuredClone(bundle),baseMod=data.payload.mods[0];
 data.payload.mods=[
  {...baseMod,id:mainId,componentId:"fixture",displayName:"Fixture MOD",aliases:["草稿状态"],kind:"runtime_mod",stages:["prefill","decode"],facts:{...baseMod.facts,problem:"公开约束中的客观问题",summary:"功能摘要"},maintainers:[{login:"reader",name:"维护者甲"}]},
  {...baseMod,id:otherId,componentId:"other",displayName:"Other MOD",aliases:[],kind:"tool_mod",stages:["decode"],maintainers:[]},
 ];
 data.payload.stages=inferenceStageNames;
 data.payload.stageMappingVersion=stageMappingVersion;
 data.payload.mods=data.payload.mods.map(m=>({...m,stageMapping:{version:stageMappingVersion,status:"mapped",basis:"隔离夹具的明确作用位置",unmappedReason:null,sourcePhases:m.stages,sourceRefs:[]}}));
 const baseSource=data.payload.sourceSnapshots.find(s=>s.kind==="pr")!;
 function source(id:string,number:number,kind="pr"):Source {
  return {...baseSource,id:"source-"+id,kind,canonicalWorkId:kind==="pr"?"github:example/runtime#"+number:"paper:arxiv:0000.00001",title:"Original "+id,titleZh:"准确中文标题 "+id,url:kind==="pr"?"https://github.com/example/runtime/pull/"+number:"https://arxiv.org/abs/0000.00001",observedOn:"2026-11-26",version:kind==="pr"?{state:"closed",merged:true}:{edition:"v1"}};
 }
 const sources=[source("a",101),source("b",102),source("paper",0,"paper"),source("candidate",103),source("withdrawn",104),source("denied",105)];
 const official=data.payload.sourceSnapshots.find(s=>s.kind!=="pr"&&s.kind!=="paper");
 data.payload.sourceSnapshots=[...(official?[official]:[]),...sources];
 const baseRelation=data.payload.relations[0];
 function relation(id:string,status:Relation["reviewStatus"]="supported",modId=mainId):Relation {
  const src=sources.find(s=>s.id==="source-"+id)!;
  return {...baseRelation,id:"rel-"+id,modId,sourceSnapshotId:src.id,communityWorkId:src.canonicalWorkId,reviewStatus:status,reviewNeeded:false,reviewNeededReasons:[],commonProblem:"关联问题 "+id,associationReason:"关联理由 "+id,researchSignificance:"关系结论 "+id,conclusionScope:"已核查范围 "+id,modEvidence:[],communityEvidence:[],differences:["有据差异 "+id],comparisonAxes:[
   {dimension:"具体问题",mod:"MOD 问题 "+id,community:"社区问题 "+id},
   {dimension:"处理方法",mod:"MOD 方法 "+id,community:"社区方法 "+id},
   {dimension:"适用条件",mod:"MOD 条件 "+id,community:"社区条件 "+id},
   {dimension:"已有结果",mod:"MOD 结果 "+id,community:"社区结果 "+id},
  ],codeReferences:[{side:"community",label:"固定代码 "+id,url:"https://github.com/example/runtime/blob/fixed/worker.py",revision:"a".repeat(40),excerpt:"code_excerpt_"+id}]};
 }
 // Paper precedes the PRs deliberately: default reading must still select a PR.
 data.payload.relations=[relation("paper"),relation("a"),relation("b"),relation("candidate","candidate"),relation("withdrawn","withdrawn"),relation("denied","unsupported"),{...relation("a","supported",otherId),id:"rel-other"}];
 const baseCoverage=data.payload.coverage[0];
 data.payload.coverage=[{...baseCoverage,modId:mainId,primaryRelationId:"rel-b",topicContexts:[]},{...baseCoverage,modId:otherId,primaryRelationId:"rel-other",topicContexts:[]}];
 const baseQuestion=data.payload.questions[0];
 function question(id:string,relationIds:string[],purpose:Question["purpose"]="research"):Question {
  return {...baseQuestion,id,title:"具体问题 "+id,modIds:[mainId],relationIds,purpose,kind:purpose==="research"?"research_candidate":"evidence_gap",basis:"由双方差异推导 "+id,hypothesis:purpose==="research"?"可否定的假设 "+id:null,researchContext:{modProgress:"MOD 进展 "+id,communityProgress:"社区进展 "+id,difference:"差异 "+id,significance:"意义 "+id}};
 }
 const multi=question("q-multi",["rel-a","rel-b","rel-paper"]);
 data.payload.questions=[multi,structuredClone(multi),question("q-second",["rel-b"]),question("q-verification",[],"verification"),{...question("q-other",["rel-other"]),modIds:[otherId]}];
 return data;
}

describe("snapshot-based filtering and navigation",()=>{
 it("counts each MOD once while retaining all stage associations in the denominator",()=>{
  const expected=bundle.payload.mods.reduce((n,m)=>n+(m.stageMapping?m.stages.length:(mappingDocument.mods as Record<string,{stages:string[]}>)[m.componentId].stages.length),0);
  expect(filterMods(bundle,new URLSearchParams())).toEqual(bundle.payload.mods);
  const distribution=stageDistribution(bundle);
  expect(distribution.total).toBe(expected);
  expect(distribution.stages.reduce((sum,s)=>sum+s.share,0)).toBeCloseTo(expected?100:0);
  const data=fixture(),before=stageDistribution(data);
  expect(filterMods(data,new URLSearchParams({stage:"decode"})).map(m=>m.id)).toEqual([mainId,otherId]);
  expect(filterMods(data,new URLSearchParams({stage:"prefill",kind:"runtime_mod",q:"Ｆｉｘｔｕｒｅ",relationStatus:"supported"})).map(m=>m.id)).toEqual([mainId]);
  expect(stageDistribution(data)).toEqual(before);
  expect(stageDistribution({...data,payload:{...data.payload,mods:[]}}).stages.every(s=>s.share===0)).toBe(true);
 });
 it("renders dropdown and legend from the same URL state without filtering the ring's denominator",()=>{
  const data=fixture(),total=stageDistribution(data).total;
  for(const stage of ["prefill","decode"]) {
   const html=render("/group-mods?stage="+stage+"&q=not-found",data);
   expect(html).toContain('<option value="'+stage+'" selected="">');
   const name=data.payload.stages[stage];
   expect(html).toMatch(new RegExp('aria-pressed="true"[^>]*>[\\s\\S]*?'+name));
   expect(html).toContain("共 "+total+" 次 MOD 与环节关联");
   expect(html).toContain("当前筛选未收录");
   const filters=html.match(/<div class="gm-filters">[\s\S]*?<\/div>/)![0];
   const positions=["检索 MOD","推理环节","类型","对照状态","重置筛选"].map(label=>filters.indexOf(label));
   expect(positions.every(n=>n>=0)).toBe(true);
   expect(positions).toEqual([...positions].sort((a,b)=>a-b));
  }
 });
 it("preserves filters and explicit snapshot in detail/return URLs and only clears filters on reset",()=>{
  const data=fixture(),query=new URLSearchParams({stage:"prefill",kind:"runtime_mod",q:"Fixture",snapshot:row.snapshotId,relationStatus:"supported"});
  const href=groupHref("fixture",query,{view:"compare",relation:"rel-a"});
  const html=render(href,data);
  const back=links(html).find(a=>a.text==="返回 MOD 目录与筛选")!;
  const backQuery=new URLSearchParams(back.href.split("?")[1]);
  expect(backQuery.toString()).toBe(query.toString());
  const restored=render(back.href,data);
  expect(restored).toContain('<option value="prefill" selected="">');
  expect(restored).toContain("共 3 次 MOD 与环节关联");
  expect(resetModFilters(new URLSearchParams(href.split("?")[1])).toString()).toBe("snapshot="+row.snapshotId);
  expect(resetModFilters(new URLSearchParams({stage:"decode"})).size).toBe(0);
  expect(query.get("stage")).toBe("prefill");
 });
 it("searches normalized names and PR identities while reporting invalid filters and no results honestly",()=>{
  const data=fixture();
  expect(filterMods(data,new URLSearchParams({q:"#102",stage:"prefill"})).map(m=>m.id)).toEqual([mainId]);
  expect(searchMods(index.modSearchIndex,"ＤｉｆｆＳｐｅｃ").some(m=>m.componentId==="diffspec")).toBe(true);
  expect(render("/group-mods?stage=bad",data)).toContain("已忽略无效筛选");
  expect(filterMods(data,new URLSearchParams({q:"not-a-real-mod"}))).toEqual([]);
 });
});

describe("concise directory and single comparison selection",()=>{
 it("always opens names in overview and exposes one semantic internal comparison link",()=>{
  const data=fixture(),html=render("/group-mods?snapshot="+row.snapshotId,data);
  const card=articles(html)[0],cardLinks=links(card);
  expect(cardLinks.find(a=>a.text==="Fixture MOD")!.href).toContain("view=overview");
  const compare=cardLinks.find(a=>a.text==="查看社区对照")!;
  expect(compare.href).toContain("/group-mods/fixture?");
  expect(compare.href).toContain("view=compare");
  expect(compare.href).toContain("snapshot="+row.snapshotId);
  expect(card).not.toContain("gm-community-identity");
  expect(card).not.toContain("准确中文标题");
  expect(card).not.toContain("关键差异");
  expect(card).not.toContain("有据对照 ·");
  expect(card).toContain(data.payload.mods[0].facts.problem);
 });
 it("distinguishes candidate-only and content-free cards without presenting a false compare entry",()=>{
  const data=fixture();
  data.payload.mods=[data.payload.mods[0]];
  data.payload.relations=data.payload.relations.filter(r=>r.reviewStatus==="candidate");
  let card=articles(render("/group-mods",data))[0];
  const clue=links(card).find(a=>a.text==="查看待核查线索")!;
  expect(clue.href).toContain("relation=rel-candidate");
  expect(card).not.toContain("查看社区对照");
  data.payload.relations=[];
  card=articles(render("/group-mods",data))[0];
  expect(card).toContain("社区对照待整理");
  expect(links(card)).toHaveLength(1);
  expect(links(card)[0].href).toContain("view=overview");
 });
 it("uses the curated core PR once, with PR and paper selectors in separate labelled groups",()=>{
  const data=fixture(),html=render("/group-mods/fixture?view=compare",data);
  expect(comparisonSelection(data,mainId).current?.id).toBe("rel-b");
  expect(comparisonIds(html)).toEqual(["rel-b"]);
  expect(html).toContain('aria-label="选择社区 PR"');
  expect(html).toContain('aria-label="选择论文参照"');
  const prNav=html.match(/<nav aria-label="选择社区 PR">[\s\S]*?<\/nav>/)![0];
  const paperNav=html.match(/<nav aria-label="选择论文参照">[\s\S]*?<\/nav>/)![0];
  expect(prNav).toContain("example/runtime #101");
  expect(prNav).toContain("准确中文标题 b");
  expect(prNav).toContain("关联问题 b");
  expect(prNav).not.toContain("arxiv:");
  expect(paperNav).toContain("arxiv:0000.00001");
  expect(paperNav).not.toContain("example/runtime");
  expect(html).not.toContain("按快照保留顺序");
 });
 it("restores an explicit PR or paper instead of substituting the default, including view-free relation URLs",()=>{
  const data=fixture();
  for(const id of ["rel-a","rel-b","rel-paper"]) {
   const html=render("/group-mods/fixture?relation="+id+"&stage=decode&snapshot="+row.snapshotId,data);
   expect(comparisonIds(html)).toEqual([id]);
   expect(html).toContain('aria-current="page" href="/group-mods/fixture?relation='+id+'&amp;stage=decode&amp;snapshot='+row.snapshotId+'&amp;view=compare"');
  }
  expect(comparisonIds(render("/group-mods?relation=rel-a",data))).toEqual(["rel-a"]);
  const html=render("/group-mods/fixture?view=compare&relation=rel-other",data);
  expect(html).toContain("未找到所指定");
  expect(comparisonIds(html)).toEqual([]);
  expect(render("/group-mods/not-real",data)).toContain("未找到所指定");
 });
 it("keeps old snapshots readable with an explained order fallback and an explicit paper-only state",()=>{
  const data=fixture();
  delete data.payload.coverage[0].primaryRelationId;
  expect(comparisonSelection(data,mainId).current?.id).toBe("rel-a");
  expect(render("/group-mods/fixture?view=compare",data)).toContain("按快照保留顺序");
  data.payload.coverage[0].primaryRelationId="rel-candidate";
  expect(comparisonSelection(data,mainId).current?.id).toBe("rel-a");
  data.payload.relations=data.payload.relations.filter(r=>r.id==="rel-paper");
  const html=render("/group-mods/fixture?view=compare",data);
  expect(comparisonIds(html)).toEqual(["rel-paper"]);
  expect(html).toContain("当前仅有论文参照");
  expect(html).not.toContain('aria-label="选择社区 PR"');
 });
 it("provides explicit legacy table rows without inventing a missing community result",()=>{
  const data=fixture(),relation=data.payload.relations.find(r=>r.id==="rel-a")!;
  delete relation.comparisonAxes;
  delete relation.associationReason;
  delete relation.researchSignificance;
  relation.modApproach="旧版 MOD 处理方法";
  relation.communityApproach="旧版社区处理方法";
  const html=render("/group-mods/fixture?view=compare&relation=rel-a",data);
  expect(comparisonIds(html)).toEqual(["rel-a"]);
  expect(html).toContain("旧版 MOD 处理方法");
  expect(html).toContain("旧版社区处理方法");
  expect(html).toContain("此版本未单列社区结果");
  for(const dimension of ["具体问题","处理方法","适用条件","已有结果"])expect(html).toContain('<th scope="row">'+dimension+'</th>');
 });
 it("separates internal comparison URLs from PR originals and keeps the analysis outside folded code",()=>{
  const data=fixture(),html=render("/group-mods/fixture?view=compare&relation=rel-a&snapshot="+row.snapshotId,data);
  const original=links(html).filter(a=>a.text==="PR 原文");
  expect(original.some(a=>a.href==="https://github.com/example/runtime/pull/101"&&a.attrs.includes('target="_blank"'))).toBe(true);
  const internal=links(html).filter(a=>a.text==="阅读这条具体对照");
  expect(internal.every(a=>a.href.startsWith("/group-mods/")&&a.href.includes("relation=")&&!a.attrs.includes("target="))).toBe(true);
  const beforeCode=html.split('<details class="gm-code-references">')[0];
  expect(beforeCode).toContain("MOD 方法 a");
  expect(beforeCode).toContain("社区条件 a");
  expect(beforeCode).toContain("关系结论 a");
  expect(beforeCode).not.toContain("code_excerpt_a");
  expect(html).toContain('<details class="gm-code-references"><summary>');
  expect(html).toContain("code_excerpt_a");
  expect(html).toContain('<span class="gm-cell-label">MOD · Fixture MOD</span>');
  expect(html).not.toContain("gm-next-research");
 });
});

describe("research body, review states and legacy routes",()=>{
 it("deduplicates question IDs and preserves all PR/paper sources after switching the selected comparison",()=>{
  const data=fixture();
  for(const selected of ["rel-a","rel-b","rel-paper"]) {
   const html=render("/group-mods/fixture?view=compare&relation="+selected,data);
   expect((html.match(/id="q-multi"/g)||[])).toHaveLength(1);
   expect(html).toContain('id="q-second"');
   expect(html).not.toContain('id="q-other"');
   const research=html.split('<section class="gm-mod-questions"')[1];
   expect(research).toContain("MOD 进展 q-multi");
   expect(research).toContain("社区进展 q-multi");
   expect(research).toContain("由双方差异推导 q-multi");
   expect(research).toContain("example/runtime #101");
   expect(research).toContain("example/runtime #102");
   expect(research).toContain("arxiv:0000.00001");
   expect(research).toContain("<h3>论文参照</h3>");
   expect(research).toContain('<details class="gm-experiment"><summary>');
   expect(research).toContain("附属验证待办（1）");
  }
  expect((render("/group-mods/questions",data).match(/id="q-multi"/g)||[])).toHaveLength(1);
  const focused=render("/group-mods/fixture?view=compare&question=q-multi",data);
  expect(focused).toContain('id="q-second"');
 });
 it("keeps MOD-only verification independent of a PR, including the Core task",()=>{
  const core=bundle.payload.questions.find(q=>q.id==="q-core-effective-window")!;
  expect(core.relationIds).toEqual([]);
  expect(core.purpose).toBe("verification");
  const html=renderToStaticMarkup(<MemoryRouter><QuestionCard question={core} bundle={bundle} query={new URLSearchParams()}/></MemoryRouter>);
  expect(links(html).some(a=>a.href.includes("21191"))).toBe(false);
  expect(html).not.toContain("gm-community-identity");
  const fixtureHtml=render("/group-mods/questions?question=q-verification",fixture());
  expect(fixtureHtml).toContain('<details class="gm-panel gm-secondary" open="">');
  expect(fixtureHtml).not.toContain("MOD 进展 q-verification");
 });
 it("never treats a denied or withdrawn relationship as a follow-up candidate",()=>{
  const data=fixture(),candidates=comparisonSelection(data,mainId).candidates;
  expect(candidates.map(r=>r.id)).toEqual(["rel-candidate"]);
  const candidateHtml=render("/group-mods/fixture?view=compare&relation=rel-candidate",data);
  expect(comparisonIds(candidateHtml)).toEqual(["rel-candidate"]);
  expect(candidateHtml).toContain('class="gm-panel gm-secondary gm-candidate-records" open=""');
  for(const id of ["rel-withdrawn","rel-denied"]) {
   const html=render("/group-mods/fixture?view=compare&relation="+id,data);
   expect(comparisonIds(html)).toEqual([id]);
   expect(html).toContain('class="gm-panel gm-secondary gm-rejected-records" open=""');
   expect(html).not.toContain('class="gm-panel gm-secondary gm-candidate-records" open=""');
  }
  data.payload.relations=data.payload.relations.filter(r=>r.modId===mainId&&(r.reviewStatus==="withdrawn"||r.reviewStatus==="unsupported"));
  data.payload.relations[0].reviewNeeded=true;
  expect(relationState(data,mainId)).toBe("rejected");
  expect(filterMods(data,new URLSearchParams({relationStatus:"candidate"}))).toEqual([]);
  expect(filterMods(data,new URLSearchParams({relationStatus:"rejected"})).map(m=>m.id)).toEqual([mainId]);
  expect(articles(render("/group-mods",data))[0]).toContain("社区对照待整理");
 });
 it("keeps three main links, source history, old views and question deep links usable",()=>{
  const data=fixture(),directory=render("/group-mods",data);
  const nav=directory.match(/<nav class="gm-nav"[^>]*>[\s\S]*?<\/nav>/)![0];
  expect(links(nav).map(a=>a.text)).toEqual(["MOD 与社区 PR","后续研究问题","来源与口径"]);
  expect(render("/group-mods/changes",baselineBundle)).toContain("尚无前一份可对比");
  expect(render("/group-mods/changes",data)).toContain('class="gm-panel gm-version-history" open=""');
  expect(render("/group-mods/fixture?view=history",data)).toContain("版本与判断修订记录");
  expect(render("/group-mods/fixture?view=questions&question=q-multi",data)).toContain('id="q-multi"');
  expect(render("/group-mods?question=q-multi",data)).toContain('id="q-multi"');
  expect(render("/group-mods/fixture?question=missing",data)).toContain("未找到所指定");
 });
 it("shows optional corpus and screening summaries while leaving old snapshots readable",()=>{
  const data=fixture();
  data.payload.corpusSummary={corpusId:"corpus-test",generatedAt:"2026-11-26T00:00:00Z",periodStart:"2026-10-22",periodEnd:"2026-11-24",inputCount:12,counts:{works:900,repositories:{"example/runtime":900}},note:"日报正文引用与专题补充均保留独立出处。"};
  data.payload.coverage[0].screening={corpusId:"corpus-test",status:"screened",candidateCount:4,reviewedCount:1,pendingCount:3,note:"初筛线索仍需回到原文核查。"};
  const sources=render("/group-mods/sources",data);
  expect(sources).toContain("2026-10-22 至 2026-11-24");
  expect(sources).toContain("12 份版本锁定的输入文件");
  expect(sources).toContain(data.payload.corpusSummary.note);
  const overview=render("/group-mods/fixture?view=overview",data);
  expect(overview).toContain("已核查 1 条，待核查 3 条");
  expect(overview).toContain(data.payload.coverage[0].screening.note);
  delete data.payload.corpusSummary;
  delete data.payload.coverage[0].screening;
  expect(render("/group-mods/sources",data)).toContain("此快照尚未附完整社区 PR 材料范围摘要");
  expect(render("/group-mods/fixture?view=overview",data)).toContain(data.payload.coverage[0].missingEvidenceMessage);
 });
 it("does not require the daily catalog to open the MOD route",()=>{
  const html=renderToStaticMarkup(<MemoryRouter initialEntries={["/group-mods"]}><DocxPreview/></MemoryRouter>);
  expect(html).toContain("正在打开组内 MOD");
  expect(html).not.toContain("正在加载日报索引");
 });
 it("validates frozen bundle hashes and rejects traversal, nonexistent snapshots and tampering",async()=>{
  expect(await decodeBundle(text,index,row.snapshotId)).toEqual(bundle);
  expect(()=>validateIndex({...index,snapshots:[{...row,bundlePath:"../escape.json"}]})).toThrow();
  await expect(decodeBundle(text,index,"f".repeat(64))).rejects.toThrow("不存在");
  await expect(decodeBundle(text+" ",index,row.snapshotId)).rejects.toThrow("文件校验");
  const altered=structuredClone(bundle);altered.payload.mods[0].displayName="tampered";
  const alteredText=JSON.stringify(altered),forgedIndex=structuredClone(index);
  forgedIndex.snapshots.find(s=>s.snapshotId===row.snapshotId)!.bundleSha256=await digest(alteredText);
  await expect(decodeBundle(alteredText,forgedIndex,row.snapshotId)).rejects.toThrow("内容校验");
 });
});


describe("eight-stage scope and immutable legacy compatibility",()=>{
 const ids=["startup","scheduling","prefill","pd_transfer","decode","speculative","output_return","resource_reclaim"];
 it("uses exactly the homepage's eight IDs and order for dropdown, ring and cards",()=>{
  const data=fixture(),html=render("/group-mods",data);
  expect(Object.keys(inferenceStageNames)).toEqual(ids);
  const dropdown=html.match(/<label>推理环节<select[^>]*>([\s\S]*?)<\/select>/)![1];
  const options=[...dropdown.matchAll(/<option value="([^"]*)"/g)].map(m=>m[1]);
  expect(options).toEqual(["",...ids]);
  expect(stageDistribution(data).stages.map(s=>s.id)).toEqual(ids);
  expect((html.match(/class="gm-stage-swatch"/g)||[])).toHaveLength(ids.length);
  data.payload.mods[0].stages=[];
  data.payload.mods[0].stageMapping={...data.payload.mods[0].stageMapping!,status:"unmapped",unmappedReason:"夹具仅披露状态生命周期",sourcePhases:["state_lifecycle"]};
  const card=articles(render("/group-mods",data))[0];
  expect(card).toContain("八环节位置尚未明确");
  expect(card).not.toContain("KV / 状态管理");
  expect(stageDistribution(data).mappedCount).toBe(1);
  expect(stageDistribution(data).unmappedCount).toBe(1);
  expect(filterMods(data,new URLSearchParams())).toHaveLength(2);
 });
 it("preserves auxiliary URL meanings without creating an extra stage or selecting a replacement",()=>{
  const data=fixture();
  data.payload.mods[0].stageMapping!.sourcePhases=["prefill","decode","state_lifecycle","observability"];
  for(const stage of ["state_management","observability"]) {
   const html=render("/group-mods?stage="+stage+"&snapshot="+row.snapshotId,data);
   expect(filterMods(data,new URLSearchParams({stage})).map(m=>m.id)).toEqual([mainId]);
   expect(html).toContain("此链接保留旧辅助分类");
   expect(html).not.toContain('aria-pressed="true"');
   expect(html).not.toContain('<option value="'+stage+'"');
   expect(html).not.toContain("已忽略无效筛选");
   expect(stageDistribution(data).total).toBe(3);
   const href=groupHref("fixture",new URLSearchParams({stage,snapshot:row.snapshotId}),{view:"overview"});
   expect(links(render(href,data)).find(a=>a.text==="返回 MOD 目录与筛选")!.href).toContain("stage="+stage);
  }
  expect(filterMods(data,new URLSearchParams({stage:"resource_reclaim"}))).toEqual([]);
 });
 it("projects all frozen legacy bundles only when official summary and taxonomy versions match",()=>{
  for(const raw of Object.values(frozen)) {
   const older=JSON.parse(raw) as Bundle;
   if(older.payload.stageMappingVersion)continue;
   const view=stageDistribution(older);
   expect(view.stages.map(s=>s.id)).toEqual(ids);
   expect(view.legacyProjectionCount).toBe(older.payload.mods.length);
   expect(view.total).toBe(Object.values(mappingDocument.mods).reduce((n,m)=>n+m.stages.length,0));
   expect(render("/group-mods/sources",older)).toContain("历史快照的原始分类和下载文件保持不变");
   const pricing=older.payload.mods.find(m=>m.componentId==="llm-serving-cost-pricing-model")!;
   expect(pricing.stages).toContain("startup");
   expect(modStageView(older,pricing).stages).toEqual([]);
  }
  const changed=structuredClone(baselineBundle),mod=changed.payload.mods[0];
  mod.fieldHashes.summary_zh="0".repeat(64);
  expect(modStageView(changed,mod).stages).toEqual([]);
  expect(modStageView(changed,mod).unmappedReason).toContain("未覆盖此版本");
  expect(changed.payload.mods[0].stages).toEqual(baselineBundle.payload.mods[0].stages);
 });
 it("retains raw auxiliary categories and reviewable per-MOD mapping sources in the profile",()=>{
  const old=baselineBundle.payload.mods.find(m=>m.componentId==="hust-joint-packed")!;
  const html=render("/group-mods/"+old.componentId+"?view=overview",baselineBundle);
  expect(html).toContain("state_lifecycle");
  expect(html).toContain("原始快照分类：KV / 状态管理");
  expect(html).toContain("/phases");
  expect(html).toContain("八环节位置尚未明确");
  expect(html).toContain("映射版本与来源定位");
 });
});
