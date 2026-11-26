import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, mkdir, writeFile, access } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { eligibility, fieldHash, buildBundle, validateBundle, publishLocal, verifyPublic, loadInputs, sha } from "../lib/group-research.mjs";
const root=process.cwd();
const qualification=JSON.parse(await readFile(path.join(root,"data/group-research/qualification-fixture.json"),"utf8"));
const registry=JSON.parse(await readFile(path.join(root,"public/group-research/index.json"),"utf8"));
const real=JSON.parse(await readFile(path.join(root,"public/group-research",registry.snapshots.at(-1).bundlePath),"utf8"));
function fixture(){
 const eco={components:[
 {id:"one",name:"夹具 MOD",summary_zh:"同一问题的机制说明",public_effect_zh:"仅功能检查，收益未验证",compatibility:{host:"测试宿主"},ownership:"hust_owned_subsystem",repository_relationship:"organization_native",maintainers:[]},
 {id:"two",name:"另一夹具 MOD",summary_zh:"不相关的方法",compatibility:{},ownership:"hust_owned_subsystem",repository_relationship:"organization_native",maintainers:[]}
 ]};
 const taxonomy={components:Object.fromEntries(eco.components.map(c=>[c.id,{kind:"runtime_mod",lifecycle:"implemented",phases:["decode"]}]))};
 const source={id:"github:example/test#1",kind:"pr",title:"隔离测试 PR",url:"https://github.com/example/test/pull/1",sourceVersion:{headSha:"a".repeat(40),bodySha256:"b".repeat(64),state:"open",merged:false,draft:false}};
 const relation={id:"relation-one",modId:"mod:vllm-hust:one",communityWorkId:source.id,relationType:"same_problem_different_layer",reviewStatus:"supported",assessedOn:"2026-11-26",assessedBy:"隔离测试夹具",commonProblem:"对照机制",modApproach:"夹具机制",communityApproach:"参考机制",differences:["层次不同"],applicability:{state:"partially_comparable",checks:[{dimension:"路径",mod:"A",community:"B",result:"different"}]},reusableCapability:"仅方法参照",forbiddenInference:"不推断收益",modEvidence:[{sourceId:"public:data__ecosystem.json",jsonPointer:"/components/0/summary_zh",identityValue:"one",valueSha256:fieldHash(eco.components[0].summary_zh)}],communityEvidence:[{sourceId:source.id,locator:{jsonPointer:"/body"},sourceVersion:structuredClone(source.sourceVersion)}],conclusionScope:"方法参照",performanceTransfer:"not_established",dependencies:[{kind:"mod_fields",componentId:"one",fields:["summary_zh","compatibility"]},{kind:"community_source",sourceId:source.id,fields:["headSha","bodySha256","state"]}]};
 const curation={asOf:"2026-11-26",sources:[source],relations:[relation],questions:[{id:"question-one",mods:[relation.modId],relations:[relation.id],title:"夹具问题",kind:"research_candidate",basis:"夹具依据",hypothesis:"待验证",baseline:["基线"],controls:["固定变量"],metrics:["指标"],failure:"否证条件",prerequisite:"先核查",status:"proposed",experimentStatus:"not_run",resolution:null}],projectCoverage:[],scopeNotice:"仅隔离测试，不发布"};
 const lock={sourceChain:{servedProjectionHashes:{"data/ecosystem.json":"c".repeat(64)}},evidenceFiles:{[source.id]:{sha256:"d".repeat(64)}}};
 return {ecosystem:eco,taxonomy,lock,curation};
}
test("frozen official qualification yields 38 group MODs; adjacent objects and external references remain separate",()=>{
 const counts={};for(const r of qualification.records){const d=eligibility(r.component,r.taxonomy).decision;counts[d]=(counts[d]||0)+1;}
 assert.deepEqual(counts,{excluded:29,included:38,reference_only:4,pending:11});
 const retired=eligibility({id:"state-scheduler",artifact_type:"retired"},{kind:"runtime_mod",lifecycle:"retired"});
 assert.equal(retired.decision,"excluded");assert.equal(counts.excluded+1,30);
 for(const id of ["vllm-hust-runtime","vllm-hust-website"])assert.notEqual(eligibility(qualification.records.find(r=>r.component.id===id)?.component||{id,artifact_type:"website"},undefined).decision,"included");
});
test("lifecycle outranks a performance label; tool implementation does not require a speedup",()=>{
 const c={ownership:"hust_owned_subsystem",repository_relationship:"organization_native",evidence_level:"hardware_verified"};
 assert.equal(eligibility(c,{kind:"runtime_mod",lifecycle:"qualification_pending"}).decision,"pending");
 assert.equal(eligibility(c,{kind:"tool_mod",lifecycle:"implemented"}).decision,"included");
 assert.equal(eligibility({...c,public_surface:false},{kind:"runtime_mod",lifecycle:"implemented"}).decision,"excluded");
 assert.equal(eligibility(c,{kind:"runtime_mod",lifecycle:"new_unknown_state"}).decision,"pending");
});
test("real public bundle preserves reviewed comparisons, candidate/rejected decisions and unrun research",()=>{
 validateBundle(real);
 assert.equal(real.payload.mods.length,38);assert.equal(real.payload.relations.filter(r=>r.reviewStatus==="supported").length,11);
 assert.equal(real.payload.relations.filter(r=>r.reviewStatus==="candidate").length,2);
 assert.equal(real.payload.questions.length,9);assert.ok(real.payload.questions.every(q=>q.experimentStatus==="not_run"));
 assert.ok(real.payload.relations.every(r=>r.performanceTransfer==="not_established"));
 assert.ok(real.payload.mods.some(m=>m.kind==="tool_mod"));
});
test("initial import is an honest baseline; repeating with or without previous does not create an empty version",()=>{
 const input=fixture(),first=buildBundle(input);
 assert.equal(first.payload.previousSnapshotId,null);assert.deepEqual(first.payload.changes.map(x=>x.kind),["baseline_created"]);
 assert.equal(first.payload.changes[0].toSnapshotRef,"self");
 assert.equal(buildBundle(input).payloadSha256,first.payloadSha256);
 assert.equal(buildBundle({...input,previous:first}).payloadSha256,first.payloadSha256);
});
test("one source head/body change invalidates only dependent relations and questions; old judgment remains available",()=>{
 const input=fixture(),first=buildBundle(input),next=structuredClone(input);
 next.curation.sources[0].sourceVersion.headSha="e".repeat(40);
 const second=buildBundle({...next,previous:first});
 assert.equal(second.payload.relations[0].reviewNeeded,true);assert.equal(second.payload.questions[0].reviewNeeded,true);
 assert.equal(second.payload.mods.find(m=>m.componentId==="two").facts.summary,first.payload.mods.find(m=>m.componentId==="two").facts.summary);
 assert.equal(second.payload.relations[0].sourceSnapshotId,first.payload.relations[0].sourceSnapshotId);
 assert.ok(second.payload.changes.some(c=>c.kind==="source_version_changed"));
 assert.equal(buildBundle({...next,previous:second}).payloadSha256,second.payloadSha256);
});
test("observation clocks, stars, unrelated fields and source ordering do not create false technical progress",()=>{
 const input=fixture(),first=buildBundle(input),next=structuredClone(input);
 next.ecosystem.components[0].stars=999;next.ecosystem.components.reverse();
 next.curation.asOf="2026-11-27";next.curation.sources[0].sourceVersion.updatedAt="2026-11-27T00:00:00Z";
 assert.equal(buildBundle({...next,previous:first}).payloadSha256,first.payloadSha256);
});
test("state-only changes do not resolve a question or prove performance",()=>{
 const input=fixture(),first=buildBundle(input),next=structuredClone(input);
 Object.assign(next.curation.sources[0].sourceVersion,{state:"closed",merged:true});
 const second=buildBundle({...next,previous:first});
 assert.ok(second.payload.changes.some(c=>c.kind==="source_state_changed"));
 assert.equal(second.payload.questions[0].status,"proposed");assert.equal(second.payload.questions[0].experimentStatus,"not_run");
});
test("unsupported benefits, missing bilateral evidence, resolved-without-evidence, unsafe URLs and corrupt hashes are rejected",()=>{
 for(const mutate of [
  b=>{b.payload.relations[0].modEvidence=[];},
  b=>{b.payload.relations[0].performanceTransfer="measured_under_conditions";},
  b=>{b.payload.questions[0].status="resolved";},
  b=>{b.payload.sourceSnapshots[0].url="javascript:alert(1)";},
  b=>{b.payload.sourceSnapshots[0].url="https://user:secret@example.com";},
 ]){const b=buildBundle(fixture());mutate(b);b.payloadSha256=fieldHash(b.payload);assert.throws(()=>validateBundle(b));}
 const corrupt=buildBundle(fixture());corrupt.payload.mods[0].displayName="changed";assert.throws(()=>validateBundle(corrupt),/hash/i);
});
test("duplicate registry IDs and first-import citation mismatch fail",()=>{
 const input=fixture();input.ecosystem.components.push(input.ecosystem.components[0]);assert.throws(()=>buildBundle(input),/Duplicate/);
 const bad=fixture();bad.curation.relations[0].modEvidence[0].valueSha256="0".repeat(64);assert.throws(()=>buildBundle(bad),/field hash/);
});
test("local publication is content-addressed; changed batches require previous and failed validation preserves current",async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),"group-mods-import-"));
 const first=buildBundle(fixture());await publishLocal(first,directory,null);
 const before=await readFile(path.join(directory,"index.json"),"utf8");
 await publishLocal(first,directory,null);assert.equal(await readFile(path.join(directory,"index.json"),"utf8"),before);
 const next=fixture();next.curation.sources[0].sourceVersion.headSha="f".repeat(40);
 const second=buildBundle({...next,previous:first});
 await assert.rejects(()=>publishLocal(second,directory,null),/previous/);
 assert.equal(await readFile(path.join(directory,"index.json"),"utf8"),before);
 await publishLocal(second,directory,first);
 assert.equal((await verifyPublic(directory)).snapshots.length,2);
});
test("explicit public withdrawal removes protected history bytes, retaining local audit and a tombstone index",async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),"group-mods-withdraw-")),audit=await mkdtemp(path.join(os.tmpdir(),"group-mods-audit-"));
 const input=fixture();input.ecosystem.components[0].name="受限唯一名称";const first=buildBundle(input);await publishLocal(first,directory,null);
 input.ecosystem.components[0].public_surface=false;
 const second=buildBundle({...input,previous:first});
 const index=await publishLocal(second,directory,first,audit);
 assert.equal(index.snapshots[0].withdrawn,true);assert.equal(index.snapshots[0].bundlePath,null);
 await assert.rejects(()=>access(path.join(directory,"versions",first.payloadSha256,"bundle.json")));
 assert.ok((await readFile(path.join(audit,first.payloadSha256+".json"),"utf8")).includes("受限唯一名称"));
 assert.ok(!JSON.stringify(second.payload.mods).includes("受限唯一名称"));
});
test("incomplete source batches and source hash tampering cannot be imported",async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),"group-mods-sources-"));
 await assert.rejects(()=>loadInputs(directory,directory,fixture().lock,fixture().curation));
 const input=fixture();
 assert.equal(sha("same"),sha("same"));
 await writeFile(path.join(directory,"deployment-provenance.json"),JSON.stringify({presentation:{revision:"one"}}));
 await writeFile(path.join(directory,"deployment-provenance-after.json"),JSON.stringify({presentation:{revision:"two"}}));
 await assert.rejects(()=>loadInputs(directory,directory,input.lock,input.curation),/changed during/);
});

test("a source identity or evidence version mismatch cannot masquerade as a supported comparison",()=>{
 const input=fixture();input.curation.sources[0].url="https://github.com/example/other/pull/1";
 assert.throws(()=>buildBundle(input),/identity/);
 const bad=fixture();bad.curation.relations[0].communityEvidence[0].sourceVersion.headSha="e".repeat(40);
 assert.throws(()=>buildBundle(bad),/citation\/version/);
 const missing=fixture();missing.curation.relations[0].dependencies=[];
 assert.throws(()=>buildBundle(missing),/dependencies/);
});
test("judgment edits require a matching explicit review and produce an append-only history record",()=>{
 const input=fixture(),first=buildBundle(input),next=structuredClone(input);
 next.curation.relations[0].commonProblem="经重新核查的问题表述";
 assert.throws(()=>buildBundle({...next,previous:first}),/explicit matching review/);
 next.curation.reviews=[{id:"review-revision",entityId:"relation-one",recordedAt:"2026-11-27",actor:"测试审阅记录",action:"revise",previousReviewId:"initial:relation-one",fingerprint:fieldHash(first.payload.relations[0].currentAgainst),rationale:"隔离夹具修订"}];
 const second=buildBundle({...next,previous:first});
 assert.equal(second.payload.relations[0].commonProblem,"经重新核查的问题表述");
 assert.ok(second.payload.changes.some(c=>c.kind==="relation_reviewed"));
 assert.ok(second.payload.reviews.some(r=>r.id==="initial:relation-one"));
 assert.ok(second.payload.reviews.some(r=>r.id==="review-revision"));
});
test("withdrawn judgments no longer count as supported and dependent questions require reassessment",()=>{
 const input=fixture(),first=buildBundle(input);
 input.curation.reviews=[{id:"review-withdraw",entityId:"relation-one",recordedAt:"2026-11-27",actor:"测试审阅记录",action:"withdraw",previousReviewId:"initial:relation-one",fingerprint:fieldHash(first.payload.relations[0].currentAgainst),rationale:"隔离夹具撤销"}];
 const second=buildBundle({...input,previous:first});
 assert.equal(second.payload.relations[0].reviewStatus,"withdrawn");
 assert.equal(second.payload.questions[0].reviewNeeded,true);
 assert.ok(second.payload.changes.some(c=>c.kind==="question_changed"));
});

test("incomplete comparison text or validation protocols fail before reaching a reader",()=>{
 for(const mutate of [b=>{delete b.payload.relations[0].differences;},b=>{delete b.payload.questions[0].minimumValidation.metrics;}]){
  const b=buildBundle(fixture());mutate(b);b.payloadSha256=fieldHash(b.payload);assert.throws(()=>validateBundle(b));
 }
});

test("problem copy revisions preserve source facts and comparison judgments without claiming technical progress",()=>{
 const input=fixture();input.curation.problemSummaries={one:"怎样处理这个问题？"};
 const first=buildBundle(input),next=structuredClone(input);
 next.curation.problemSummaries.one="公开来源支持的具体问题与条件。";
 const second=buildBundle({...next,previous:first});
 assert.equal(second.payload.changes.length,1);
 assert.equal(second.payload.changes[0].kind,"problem_statement_revised");
 assert.equal(second.payload.changes[0].before.problem,"怎样处理这个问题？");
 assert.equal(second.payload.changes[0].after.problem,next.curation.problemSummaries.one);
 assert.deepEqual(second.payload.mods[0].fieldHashes,first.payload.mods[0].fieldHashes);
 assert.deepEqual(second.payload.relations,first.payload.relations);
 assert.deepEqual(second.payload.questions,first.payload.questions);
});

test("research hypotheses require a supported concrete PR; verification tasks may be independent",()=>{
 const input=fixture(),q=input.curation.questions[0];
 q.purpose="research";q.researchContext={modProgress:"公开MOD进展",communityProgress:"固定PR进展",difference:"机制差异",significance:"待研究取舍"};
 assert.equal(buildBundle(input).payload.questions[0].purpose,"research");
 input.curation.relations[0].reviewStatus="candidate";
 assert.throws(()=>buildBundle(input),/supported PR comparison/);
 q.purpose="verification";q.relations=[];
 assert.deepEqual(buildBundle(input).payload.questions[0].relationIds,[]);
});
test("current content separates eight concrete research proposals from the unrelated Core verification task",()=>{
 const p=real.payload, research=p.questions.filter(q=>q.purpose==="research");
 assert.equal(research.length,8);
 assert.ok(research.every(q=>q.experimentStatus==="not_run"&&q.hypothesis));
 const core=p.questions.find(q=>q.id==="q-core-effective-window");
 assert.equal(core.purpose,"verification");assert.deepEqual(core.relationIds,[]);
 assert.ok(!core.sourceRefs.some(e=>e.sourceId?.includes("21191")));
 assert.equal(new Set(p.relations.filter(r=>r.reviewStatus==="supported").map(r=>r.modId)).size,8);
 assert.equal(p.relations.filter(r=>r.reviewStatus==="candidate").length,2);
});


test("editorial default selection must identify this MOD's supported PR, never a paper or candidate",()=>{
 const input=fixture();input.curation.projectCoverage=[{modId:input.curation.relations[0].modId,primaryRelationId:"relation-one"}];
 assert.equal(buildBundle(input).payload.coverage.find(c=>c.modId===input.curation.relations[0].modId).primaryRelationId,"relation-one");
 input.curation.projectCoverage[0].primaryRelationId="missing";
 assert.throws(()=>buildBundle(input),/primary PR/);
 input.curation.projectCoverage[0].primaryRelationId="relation-one";input.curation.relations[0].reviewStatus="candidate";
 assert.throws(()=>buildBundle(input),/primary PR/);
});
test("screening progress is tied to its corpus version and cannot overclaim reviewed candidates",()=>{
 const input=fixture(),modId=input.curation.relations[0].modId;
 input.curation.corpusSummary={corpusId:"test-corpus",generatedAt:"2026-11-26",periodStart:"2026-10-22",periodEnd:"2026-11-24",counts:{uniquePrs:10},inputCount:2,note:"isolated fixture; screening is not source review"};
 input.curation.projectCoverage=[{modId,screening:{corpusId:"test-corpus",status:"screened",candidateCount:3,reviewedCount:1,pendingCount:2,note:"one source reviewed; two pending"}}];
 const first=buildBundle(input);assert.equal(first.payload.coverage.find(c=>c.modId===modId).screening.pendingCount,2);
 const receiptOnly=structuredClone(input);receiptOnly.curation.corpusSummary.generatedAt="2026-11-27";assert.equal(buildBundle({...receiptOnly,previous:first}).payloadSha256,first.payloadSha256);
 const mismatch=structuredClone(input);mismatch.curation.projectCoverage[0].screening.corpusId="another";
 assert.throws(()=>buildBundle(mismatch),/version mismatch/);
 const inconsistent=structuredClone(input);inconsistent.curation.projectCoverage[0].screening.reviewedCount=3;
 assert.throws(()=>buildBundle(inconsistent),/progress counts/);
 const changed=structuredClone(input);changed.curation.corpusSummary.corpusId="new-corpus";changed.curation.projectCoverage[0].screening.corpusId="new-corpus";
 assert.notEqual(buildBundle({...changed,previous:first}).payloadSha256,first.payloadSha256);
});

test("rejected or withdrawn source findings remain separate from candidate coverage",()=>{
 for(const reviewStatus of ["unsupported","withdrawn"]){
  const input=fixture();input.curation.relations[0].reviewStatus=reviewStatus;
  const b=buildBundle(input),coverage=b.payload.coverage.find(c=>c.modId===input.curation.relations[0].modId);
  assert.equal(coverage.comparisonStatus,"assessed_without_supported_comparison");
  assert.match(coverage.missingEvidenceMessage,/不作为待跟进候选/);
 }
});
