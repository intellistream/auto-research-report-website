import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { eligibility, stagesFor, stageMappingFor, stageNames, buildBundle, validateBundle, validateSchema, fieldHash } from "../lib/group-research.mjs";

const read=async file=>JSON.parse(await readFile(file,"utf8"));
const definitions=await read("src/inference-stages.json");
const mapping=await read("data/group-research/inference-stage-mapping.v1.json");
const qualification=await read("data/group-research/qualification-fixture.json");
const index=await read("public/group-research/index.json");
const ids=["startup","scheduling","prefill","pd_transfer","decode","speculative","output_return","resource_reclaim"];
const latest=await read("public/group-research/"+index.snapshots.find(s=>s.snapshotId===index.currentSnapshotId).bundlePath);
const included=qualification.records.filter(r=>eligibility(r.component,r.taxonomy).decision==="included");

test("homepage and importer share exactly the eight process stages in their existing order",async()=>{
 assert.deepEqual(Object.keys(definitions),ids);
 assert.deepEqual(stageNames,definitions);
 for(const file of ["src/pages/InferenceMap.tsx","src/views/OverviewPage.tsx"])
  assert.match(await readFile(file,"utf8"),/inference-stages\.json/);
 assert.deepEqual(Object.values(definitions),["模型准备","请求调度","输入处理","P/D 缓存交接","循环生成","推测解码","输出返回","资源回收与缓存保留"]);
});
test("every included MOD has an evidence-backed decision; no auxiliary category is an inference stage",()=>{
 assert.deepEqual(Object.keys(mapping.mods).sort(),included.map(r=>r.component.id).sort());
 assert.equal(mapping.taxonomySha256,latest.payload.sourceChain.servedProjectionHashes["data/mod-taxonomy.json"]);
 for(const mod of latest.payload.mods) {
  const expected=mapping.mods[mod.componentId];
  const component={id:mod.componentId,summary_zh:mod.facts.summary},taxonomy={phases:expected.sourcePhases};
  const actual=stageMappingFor(component,taxonomy);
  assert.deepEqual(actual.stages,expected.stages,component.id);
  assert.ok(actual.basis&&actual.sourceRefs.length>=2);
  assert.equal(actual.sourceRefs[0].valueSha256,mod.fieldHashes.summary_zh);
  assert.equal(actual.sourceRefs[0].valueSha256,fieldHash(component.summary_zh));
  assert.equal(actual.sourceRefs[1].valueSha256,fieldHash(taxonomy.phases));
  assert.deepEqual(actual.sourcePhases,taxonomy.phases);
  assert.ok(actual.stages.every(id=>ids.includes(id)));
  assert.equal(actual.status,actual.stages.length?"mapped":"unmapped");
  if(!actual.stages.length)assert.ok(actual.unmappedReason);
 }
});
test("state lifecycle, KV transfer and observation labels cannot imply reclaim or P/D handoff",()=>{
 for(const id of ["guarded-progress-async","hust-joint-packed","hust-m01-correction","state-page-copy","pegaflow-vllm-connectors","kv-transfer-observability-migration","request-lifecycle-profiler","memory-tracker","traceloom","llm-serving-cost-pricing-model"])
  assert.deepEqual(mapping.mods[id].stages,[],id);
 assert.deepEqual(mapping.mods["bidkv"].stages,["scheduling"]);
 assert.deepEqual(mapping.mods["kv-materialization-arrival-control"].stages,["scheduling"]);
 assert.deepEqual(mapping.mods["muxpd"].stages,["prefill","decode"]);
 assert.deepEqual(mapping.mods["diffspec"].stages,["decode","speculative"]);
});
test("unknown MODs or changed evidence remain unmapped instead of inheriting a broad phase guess",()=>{
 assert.deepEqual(stagesFor({id:"new-state-worker",summary_zh:"KV state copying"},{phases:["state_lifecycle"]}),[]);
 const row=included.find(r=>r.component.id==="bidkv");
 const changed=stageMappingFor({...row.component,summary_zh:"New implementation with an unknown execution location"},row.taxonomy);
 assert.deepEqual(changed.stages,[]);
 assert.equal(changed.status,"unmapped");
 assert.match(changed.unmappedReason,/未覆盖此来源版本/);
 assert.deepEqual(stagesFor(row.component,{...row.taxonomy,phases:["service_lifecycle"]}),[]);
});
test("all immutable snapshots continue to validate and new stage contracts reject extra categories",async()=>{
 for(const row of index.snapshots.filter(s=>!s.withdrawn)){
  const bundle=await read("public/group-research/"+row.bundlePath);
  validateBundle(bundle);
  await validateSchema(bundle,process.cwd());
 }
 const latest=await read("public/group-research/"+index.snapshots.find(s=>s.snapshotId===index.currentSnapshotId).bundlePath);
 if(latest.payload.stageMappingVersion){
  const changed=structuredClone(latest);
  changed.payload.mods[0].stages.push("state_management");
  changed.payloadSha256=fieldHash(changed.payload);
  assert.throws(()=>validateBundle(changed),/Invalid inference stage/);
  await assert.rejects(()=>validateSchema(changed,process.cwd()),/Schema/);
  const missing=structuredClone(latest),mod=missing.payload.mods.find(m=>!m.stages.length);
  mod.stageMapping.unmappedReason=null;missing.payloadSha256=fieldHash(missing.payload);
  assert.throws(()=>validateBundle(missing),/explanation/);
 }
});


test("a stage correction records display mapping changes rather than a new official MOD implementation",()=>{
 const id="llm-serving-cost-pricing-model";
 const component={id,summary_zh:latest.payload.mods.find(m=>m.componentId===id).facts.summary,name:"成本估算",ownership:"hust_owned_subsystem",repository_relationship:"organization_native"};
 const input={ecosystem:{components:[component]},taxonomy:{components:{[id]:{kind:"tool_mod",lifecycle:"implemented",phases:mapping.mods[id].sourcePhases}}},lock:{sourceChain:{servedProjectionHashes:{"data/ecosystem.json":"c".repeat(64)}},evidenceFiles:{}},curation:{asOf:"2026-11-26",sources:[],relations:[],questions:[],reviews:[],projectCoverage:[],scopeNotice:"isolated stage fixture"}};
 const legacy=buildBundle(input);
 delete legacy.payload.stageMappingVersion;delete legacy.payload.mods[0].stageMapping;
 legacy.payload.mods[0].stages=["startup","observability"];
 legacy.payloadSha256=fieldHash(legacy.payload);
 const corrected=buildBundle({...input,previous:legacy});
 assert.deepEqual(corrected.payload.mods[0].stages,[]);
 assert.deepEqual(corrected.payload.changes.map(c=>c.kind),["stage_mapping_revised"]);
 assert.equal(buildBundle({...input,previous:corrected}).payloadSha256,corrected.payloadSha256);
});
