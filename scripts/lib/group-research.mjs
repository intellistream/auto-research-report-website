import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, rename, access } from "node:fs/promises";
import path from "node:path";
import Ajv from "ajv";
import inferenceStages from "../../src/inference-stages.json" with { type:"json" };
import stageMappingDocument from "../../data/group-research/inference-stage-mapping.v1.json" with { type:"json" };

export const canonical = (v) => JSON.stringify(sortValue(v));
function sortValue(v) {
  if (Array.isArray(v)) return v.map(sortValue);
  if (v && typeof v === "object") return Object.fromEntries(Object.keys(v).sort().map(k => [k, sortValue(v[k])]));
  if (typeof v === "number" && !Number.isFinite(v)) throw new Error("Invalid finite number");
  return v;
}
export const sha = (v) => createHash("sha256").update(typeof v === "string" || Buffer.isBuffer(v) ? v : canonical(v)).digest("hex");
export const fieldHash = (v) => sha(canonical(v));
export function safeUrl(v) {
  try { const u = new URL(v); return ["http:", "https:"].includes(u.protocol) && !u.username && !u.password ? u.href : null; } catch { return null; }
}
const check = (condition, message) => { if (!condition) throw new Error(message); };
const unique = (rows, key = "id") => check(new Set(rows.map(r => r[key])).size === rows.length, "Duplicate " + key);
export function pointer(data, location) {
  check(typeof location === "string" && location.startsWith("/"), "Invalid JSON pointer");
  return location.split("/").slice(1).reduce((v, k) => {
    k = k.replace(/~1/g, "/").replace(/~0/g, "~");
    check(v != null && Object.hasOwn(v, k), "Missing source locator " + location);
    return v[k];
  }, data);
}
const nativeOwners = new Set(["hust_owned_subsystem", "organization_maintained", "original_contributor_maintained", "core_owned", "hust_maintained_external_integration"]);
export function eligibility(component, taxonomy) {
  if (component.public_surface === false) return { decision: "excluded", reason: "来源未允许公开" };
  if (!taxonomy) return { decision: component.artifact_type === "runtime_component" ? "pending" : "excluded", reason: "未取得正式 MOD 分类" };
  if (!["runtime_mod", "connector_mod", "tool_mod"].includes(taxonomy.kind)) return { decision: "excluded", reason: "官方分类不是运行时、连接器或工具 MOD" };
  if (!["implemented", "implemented_restricted"].includes(taxonomy.lifecycle)) return {
    decision: ["pending","research","external","retired"].includes(taxonomy.lifecycle) ? "excluded" : "pending",
    reason: "官方生命周期：" + (taxonomy.lifecycle || "未明确")
  };
  const relationship = component.repository_relationship;
  if (["upstream_owned_component", "external_reference"].includes(relationship)) return { decision: "reference_only", reason: "上游自有组件或外部参照，不计组内成果" };
  if (["organization_native", "organization_native_component"].includes(relationship) && nativeOwners.has(component.ownership))
    return { decision: "included", reason: "正式登记且已实现的组内关联 MOD" };
  if (relationship === "upstream_adaptation" && component.ownership === "hust_maintained_external_integration")
    return { decision: "included", reason: "HUST 适配；不主张上游原创" };
  if (relationship === "external_subsystem" && component.ownership === "external_contributor_maintained" && (component.advisors || []).some(a => a.relationship === "internal"))
    return { decision: "included", reason: "官方登记并具有组内导师依据的外部子系统" };
  return { decision: "pending", reason: "组内归属尚需核查" };
}
export const stageNames = inferenceStages;
export const stageMappingVersion = stageMappingDocument.version;
export function stageMappingFor(c,t,index=0) {
  const entry=stageMappingDocument.mods[c.id];
  const phases=t.phases||[];
  const summaryRef=entry?.sourceRefs.find(r=>r.sourceId==="public:data__ecosystem.json");
  const matches=summaryRef?.valueSha256===fieldHash(c.summary_zh??null)&&canonical(entry.sourcePhases)===canonical(phases);
  if(matches) return {
    ...structuredClone(entry), version:stageMappingVersion,
    sourceRefs:entry.sourceRefs.map(r=>({...r,jsonPointer:r.sourceId==="public:data__ecosystem.json"?"/components/"+index+"/summary_zh":r.jsonPointer}))
  };
  const reason="当前八环节映射未覆盖此来源版本；保留原始分类，等待核对具体执行位置。";
  return {version:stageMappingVersion,stages:[],status:"unmapped",basis:reason,unmappedReason:reason,sourcePhases:phases,sourceRefs:[
    {sourceId:"public:data__ecosystem.json",jsonPointer:"/components/"+index+"/summary_zh",identityValue:c.id,valueSha256:fieldHash(c.summary_zh??null)},
    {sourceId:"public:data__mod-taxonomy.json",jsonPointer:"/components/"+c.id+"/phases",identityValue:c.id,valueSha256:fieldHash(phases)}
  ]};
}
export function stagesFor(c,t) { return stageMappingFor(c,t).stages; }
export function technicalVersion(source) {
  const v = source.version || source.sourceVersion || {};
  return Object.fromEntries(["headSha", "baseSha", "bodySha256", "edition", "artifactSha256", "state", "merged", "draft", "mergeCommitSha"].filter(k => v[k] !== undefined).map(k => [k, v[k]]));
}
function projection(component, taxonomy, index, sourceId, curation) {
  const choice = eligibility(component, taxonomy);
  const fieldHashes = Object.fromEntries(["summary_zh", "summary_en", "public_effect_zh", "compatibility"].map(k => [k, fieldHash(component[k] ?? null)]));
  const names = component.name_zh || component.name || component.id;
  const privateCode = component.repository_visibility === "private";
  const repo = privateCode ? null : safeUrl(component.canonical_repository);
  const maintainers = (component.maintainers || []).map(m => {
    const profile = (component.maintainer_profiles || []).find(p => p.login === (typeof m === "string" ? m : m.login));
    return typeof m === "string" ? { login: m, name: profile?.name_zh || profile?.name || m } : { login: m.login || "", name: m.name_zh || m.name || m.login || "未登记" };
  });
  const {stages,...stageMapping}=stageMappingFor(component,taxonomy,index);
  return {
    id: "mod:vllm-hust:" + component.id, componentId: component.id, displayName: names,
    sourceName: component.name || component.id, aliases: [...new Set([component.name_en, component.name].filter(Boolean))],
    eligibility: choice, kind: taxonomy.kind, lifecycle: taxonomy.lifecycle,
    originalStatus: { evidence: taxonomy.evidence || null, maturity: component.maturity || null, compatibility: component.compatibility?.status || null, evidenceLevel: component.evidence_level || null, effectStatus: component.public_effect_status || null },
    facts: {
      problem: curation.problemSummaries?.[component.id] || null,
      problemBasis: curation.problemSummaries?.[component.id] ? (curation.problemSummaryBasis?.[component.id] || "editorial_summary") : "source_statement",
      summary: component.summary_zh || component.summary_en || "",
      effect: component.public_effect_zh || component.public_effect_en || null,
      compatibility: Object.fromEntries(["status", "host", "versions", "platforms", "models", "python", "requirements_zh", "requirements_en"].filter(k => component.compatibility?.[k] !== undefined).map(k => [k, component.compatibility[k]]))
    },
    maintainers, projectLead: null, repository: repo, codeVisibility: privateCode ? "private" : "public_or_unspecified",
    attribution: choice.reason, stages, stageMapping,
    canonicalPage: "https://vllm-hust.sage.org.ai/plugins.html#" + component.id,
    fieldHashes,
    sourceRefs: [{ sourceSnapshotId: sourceId, locator: "/components/" + index, identityValue: component.id, valueSha256: fieldHash(component) }],
    unknownFields: ["独立项目负责人", "本站复现实验与研究完成状态"],
    reviewScope: "公开登记资料核查；未安装、运行或复现实验"
  };
}
const canonicalWork = id => id.startsWith("paper:arxiv:") ? id.replace(/v[0-9]+$/, "") : id;
export function normalizeSources(curation, lock) {
  return curation.sources.map(source => {
    const artifact = lock.evidenceFiles[source.id];
    if(source.reportReferences) check(source.reportReferences.every(r=>/^\/(reports|topics)\//.test(r.href)&&r.title&&["daily_main","daily_reference","topic"].includes(r.role)), "Invalid local report reference");
    if(source.kind === "pr") {
      const u = new URL(source.url), match = u.pathname.match(/^\/([^/]+)\/([^/]+)\/pull\/([1-9][0-9]*)$/);
      check(u.hostname === "github.com" && match && source.id === "github:" + match[1].toLowerCase() + "/" + match[2].toLowerCase() + "#" + match[3], "PR identity/URL mismatch");
    } else if(source.kind === "paper") {
      check(/^paper:arxiv:[0-9]{4}\.[0-9]+v[0-9]+$/.test(source.id) && source.sourceVersion.edition === "arXiv:" + source.id.replace("paper:arxiv:",""), "Paper identity/version mismatch");
    }
    check(artifact && safeUrl(source.url), "Missing or unsafe community source " + source.id);
    const version = { ...source.sourceVersion, ...(source.kind === "paper" ? { artifactSha256: artifact.sha256 } : {}) };
    const hash = fieldHash(technicalVersion({ version }));
    return {
      id: source.id + "@" + hash, canonicalWorkId: canonicalWork(source.id), kind: source.kind, title: source.title, ...(source.titleZh ? {titleZh:source.titleZh} : {}), url: source.url,
      observedOn: source.sourceVersion.observedOn || curation.asOf, version, contentSha256: artifact.sha256,
      locator: source.locator, reviewScope: source.reviewScope,
      ...(source.reportReferences ? {reportReferences:source.reportReferences} : {}),
      publicExcerpt: [...new Set(curation.relations.filter(r => r.communityWorkId === canonicalWork(source.id)).map(r => r.communityApproach))].join(" "),
    };
  });
}
function dependencySignature(relation, mods, sources) {
  return Object.fromEntries((relation.dependencies || []).map(d => {
    if (d.kind === "mod_fields") {
      const mod = mods.find(m => m.componentId === d.componentId);
      return ["mod:" + d.componentId, Object.fromEntries(d.fields.map(f => [f, mod?.fieldHashes[f] || fieldHash(null)]))];
    }
    return ["source:" + d.sourceId, technicalVersion(sources.find(s => s.canonicalWorkId === canonicalWork(d.sourceId)) || {})];
  }));
}
function stageMappingIdentity(mapping) {
  if(!mapping)return null;
  return {...mapping,sourceRefs:mapping.sourceRefs.map(r=>({...r,jsonPointer:r.jsonPointer.replace(/[/]components[/][0-9]+[/]/,"/components/@"+r.identityValue+"/")}))};
}
function makeChanges(previous, mods, sources, relations, questions, asOf) {
  if (!previous) return [{ id: "baseline-created", kind: "baseline_created", toSnapshotRef:"self", recordedOn: asOf, title: "建立首份组内 MOD 对照快照", modIds: [], detail: "尚无前一份可对比；不把首次收录计为新增研究进展。" }];
  const result = [];
  const add = event => result.push({ ...event, toSnapshotRef:"self", id: "change-" + fieldHash(event).slice(0, 20), recordedOn: asOf, previousSnapshotId: previous.payloadSha256 });
  const old = previous.payload;
  for (const mod of mods) {
    const prior = old.mods.find(m => m.id === mod.id);
    if (!prior) add({ kind: "mod_added", title: "新增符合纳入条件的 MOD", modIds: [mod.id], detail: mod.displayName });
    else {
      const fields = ["displayName", "maintainers", "lifecycle"].filter(k => canonical(mod[k]) !== canonical(prior[k]));
      const sourceFacts = ({problem, problemBasis, ...facts}) => facts;
      if (canonical(sourceFacts(mod.facts)) !== canonical(sourceFacts(prior.facts))) fields.push("facts");
      if (fields.length) add({ kind: "mod_fields_changed", title: "MOD 登记事实变化", modIds: [mod.id], detail: mod.displayName + "：" + fields.join("、") });
      if (canonical(mod.stages)!==canonical(prior.stages)||canonical(stageMappingIdentity(mod.stageMapping))!==canonical(stageMappingIdentity(prior.stageMapping)))
        add({kind:"stage_mapping_revised",title:"推理环节展示口径修正",modIds:[mod.id],detail:mod.displayName+"：按首页八环节核对作用位置，辅助分类另存；这是展示映射修订，不代表 MOD 实现、实验或性能发生变化。",before:{stages:prior.stages},after:{stages:mod.stages,basis:mod.stageMapping.basis}});
      if (mod.facts.problem !== prior.facts.problem || mod.facts.problemBasis !== prior.facts.problemBasis)
        add({ kind: "problem_statement_revised", title: "问题表述修订", modIds: [mod.id], detail: mod.displayName + "：本站问题表述已修订；该记录只说明文字调整，不作为技术进展。", before: {problem: prior.facts.problem, problemBasis: prior.facts.problemBasis}, after: {problem: mod.facts.problem, problemBasis: mod.facts.problemBasis} });
    }
  }
  for (const prior of old.mods) if (!mods.some(m => m.id === prior.id)) add({ kind: "mod_no_longer_included", title: "MOD 退出当前纳入范围", modIds: [prior.id], detail: "完整官方投影中的资格或公开范围变化；不代表研究失败。" });
  for (const source of sources.filter(s => s.kind !== "official_registry")) {
    const prior = old.sourceSnapshots.find(s => s.canonicalWorkId === source.canonicalWorkId && (!old.activeSourceIds || old.activeSourceIds.includes(s.id)));
    if (prior && canonical(technicalVersion(source)) !== canonical(technicalVersion(prior))) {
      const oldV = technicalVersion(prior), newV = technicalVersion(source);
      const changed = [...new Set([...Object.keys(oldV), ...Object.keys(newV)])].filter(k => canonical(oldV[k] ?? null) !== canonical(newV[k] ?? null));
      const onlyState = changed.every(k => ["state", "merged", "draft", "mergeCommitSha"].includes(k));
      add({ kind: onlyState ? "source_state_changed" : "source_version_changed", title: onlyState ? "社区来源状态变化" : "社区来源版本变化", modIds: relations.filter(r => r.communityWorkId === source.canonicalWorkId).map(r => r.modId), sourceId: source.canonicalWorkId, detail: source.title + "：" + changed.join("、") + "。尚未判断技术影响。" });
    }
  }
  for (const r of relations) {
    const prior=old.relations.find(v=>v.id===r.id);
    if(!prior) add({kind:"relation_recorded",title:"新增本站对照核查记录",modIds:[r.modId],sourceId:r.communityWorkId,detail:r.communityWorkId+"："+({supported:"有依据对照",candidate:"候选待核查",unsupported:"不构成所述关联",withdrawn:"已撤回"}[r.reviewStatus])+"。"+(r.researchSignificance||r.reusableCapability)+" 该记录表示本站核查内容，不代表社区技术在本日发生变化。"});
    if(prior && (prior.reviewNeeded!==r.reviewNeeded || prior.reviewStatus!==r.reviewStatus || prior.curationHash!==r.curationHash))
      add({kind:r.reviewNeeded?"relation_review_needed":"relation_reviewed",title:r.reviewNeeded?"对照判断需要复核":"对照判断已记录复核",modIds:[r.modId],detail:r.commonProblem,before:{reviewStatus:prior.reviewStatus,reviewNeeded:prior.reviewNeeded},after:{reviewStatus:r.reviewStatus,reviewNeeded:r.reviewNeeded}});
  }
  for (const q of questions) {
    const prior=old.questions.find(v=>v.id===q.id);
    if(!prior) add({kind:"question_recorded",title:q.purpose==="verification"?"记录附属验证待办":"记录后续研究假设",modIds:q.modIds,detail:q.title+" 实验尚未运行；不作为已完成的研究结果。"});
    if(prior && ["title","purpose","kind","basis","hypothesis","researchContext","verificationTasks","minimumValidation","relationIds","status","reviewNeeded","resolution"].some(k=>canonical(prior[k]??null)!==canonical(q[k]??null)))
      add({kind:"question_changed",title:q.purpose==="verification"?"附属验证待办修订":"后续研究问题修订",modIds:q.modIds,detail:q.title,before:{title:prior.title,status:prior.status,hypothesis:prior.hypothesis,reviewNeeded:prior.reviewNeeded},after:{title:q.title,status:q.status,hypothesis:q.hypothesis,reviewNeeded:q.reviewNeeded}});
  }
  return result;
}
function effectiveState(p) {
 const clean = value => {
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([k])=>!["observedOn","updatedAt","assessedOn","lastReviewedOn","firstRecordedOn","sourceSnapshotId","generatedAt"].includes(k)).map(([k,v])=>[k,clean(v)]));
  return value;
 };
 return fieldHash({
  mods:p.mods.map(({sourceRefs,stageMapping,...m})=>({...m,...(stageMapping?{stageMapping:stageMappingIdentity(stageMapping)}:{})})),
  relations:clean(p.relations),questions:clean(p.questions),coverage:clean(p.coverage),reviews:clean(p.reviews),
  audit:p.audit,
  sources:p.sourceSnapshots.filter(s=>s.kind!=="official_registry" && (!p.activeSourceIds || p.activeSourceIds.includes(s.id))).map(s=>({id:s.id,version:technicalVersion(s),publicExcerpt:s.publicExcerpt,title:s.title,titleZh:s.titleZh||null,url:s.url,...(s.reportReferences ? {reportReferences:s.reportReferences} : {})})),
  scopeNotice:p.scopeNotice,stages:p.stages,stageMappingVersion:p.stageMappingVersion||null,...(p.corpusSummary ? {corpusSummary:clean(p.corpusSummary)} : {})
 });
}
export function buildBundle({ ecosystem, taxonomy, lock, curation, previous = null }) {
  if (previous) validateBundle(previous);
  unique(ecosystem.components);
  const byId = taxonomy.components;
  check(byId && typeof byId === "object" && !Array.isArray(byId), "Invalid taxonomy");
  const ecoHash = lock.sourceChain.servedProjectionHashes["data/ecosystem.json"];
  const registryId = "public:data__ecosystem.json@" + ecoHash;
  const registrySource = {
    id: registryId, canonicalWorkId: "public:data__ecosystem.json", kind: "official_registry",
    title: "官网公开 MOD 登记", url: "https://vllm-hust.sage.org.ai/data/ecosystem.json",
    observedOn: curation.asOf, version: lock.sourceChain, contentSha256: ecoHash,
    reviewScope: "完整公开登记及正式 taxonomy 核查；不代表实验复现",
    publicExcerpt: "按正式 MOD 分类、实现生命周期、组内归属与公开范围判定。"
  };
  const audit = ecosystem.components.map(c => ({ id: c.id, name: c.public_surface === false ? "公开范围已撤回" : c.name_zh || c.name || c.id, publicAllowed:c.public_surface!==false, kind: byId[c.id]?.kind || null, lifecycle: byId[c.id]?.lifecycle || null, ...eligibility(c, byId[c.id]) }));
  const mods = ecosystem.components.map((c, i) => byId[c.id] && projection(c, byId[c.id], i, registryId, curation)).filter(m => m && m.eligibility.decision === "included").sort((a,b) => a.id.localeCompare(b.id, "en"));
  const currentSources = [registrySource, ...normalizeSources(curation, lock)];
  const prior = previous?.payload;
  const relations = curation.relations.filter(r => mods.some(m => m.id === r.modId)).map(raw => {
    const r = structuredClone(raw), old = prior?.relations.find(x => x.id === r.id);
    const curationHash=fieldHash(raw);
    check((r.dependencies || []).some(d=>d.kind==="mod_fields" && "mod:vllm-hust:"+d.componentId===r.modId) && (r.dependencies || []).some(d=>d.kind==="community_source" && canonicalWork(d.sourceId)===r.communityWorkId), "Missing bilateral update dependencies");
    const current = dependencySignature(r, mods, currentSources);
    let reviewedAgainst = old?.reviewedAgainst || current;
    const acceptedReview = (curation.reviews || []).find(v => v.entityId === r.id && ["retain", "revise", "withdraw"].includes(v.action) && v.fingerprint === fieldHash(current));
    if (acceptedReview) { reviewedAgainst = current; if(acceptedReview.action==="withdraw") r.reviewStatus="withdrawn"; }
    if(old?.curationHash && old.curationHash!==curationHash) check(acceptedReview, "Judgment edits require an explicit matching review");
    const currentCommunity = currentSources.find(s=>s.canonicalWorkId===r.communityWorkId);
    if(!old || acceptedReview) {
      check(r.communityEvidence.every(e=>canonicalWork(e.sourceId)===r.communityWorkId && Object.entries(technicalVersion({sourceVersion:e.sourceVersion})).every(([k,v])=>canonical(currentCommunity?.version[k])===canonical(v))), "Community citation/version mismatch");
    }
    const reviewNeeded = canonical(reviewedAgainst) !== canonical(current);
    for (const ref of r.modEvidence) {
      const component = ecosystem.components.find(c => c.id === ref.identityValue);
      check(component && "mod:vllm-hust:"+component.id===r.modId, "Missing or mismatched cited MOD");
      const sourceRow = pointer(ecosystem, ref.jsonPointer.replace(/\/components\/[0-9]+/, "/components/" + ecosystem.components.indexOf(component)));
      if (!previous || acceptedReview) check(fieldHash(sourceRow) === ref.valueSha256, "Curation field hash mismatch: " + r.id);
    }
    const community = currentSources.find(s => s.canonicalWorkId === r.communityWorkId);
    check(community, "Missing relation source");
    return {
      ...r, curationHash, reviewedAgainst, currentAgainst: current, reviewNeeded,
      reviewNeededReasons: reviewNeeded ? ["所依赖的 MOD 字段或社区版本已改变；以下为上次确认判断。"] : [],
      sourceSnapshotId: reviewNeeded && old ? old.sourceSnapshotId : community.id,
      modEvidence: reviewNeeded && old ? old.modEvidence : r.modEvidence.map(ref => ({ ...ref, sourceSnapshotId: registryId })),
      applicability: { ...r.applicability, checks: r.applicability.checks.map(c => ({ ...c, result: c.result.startsWith("incompatible") ? "incompatible" : c.result === "not_same_protocol" ? "different" : ["matched","different","unknown","not_applicable"].includes(c.result) ? c.result : "unknown" })) }
    };
  }).sort((a,b) => a.id.localeCompare(b.id, "en"));
  const questions = curation.questions.filter(q => q.mods.every(id => mods.some(m => m.id === id))).map(q => ({
    ...q, modIds: q.mods, relationIds: q.relations,
    reviewNeeded: q.relations.some(id => (relations.find(r => r.id === id)?.reviewNeeded || relations.find(r => r.id === id)?.reviewStatus==="withdrawn")),
    minimumValidation: { prerequisites: q.prerequisite, baselines: q.baseline, controls: q.controls, metrics: q.metrics, failureCriterion: q.failure },
    sourceRefs: [...(q.sourceRefs || []).filter(e => e.sourceId === "public:data__ecosystem.json"), ...q.relations.flatMap(id => relations.find(r => r.id === id)?.communityEvidence || [])]
  })).sort((a,b) => a.id.localeCompare(b.id, "en"));
  const coverage = mods.map(m => {
    const rows = relations.filter(r => r.modId === m.id);
    const seed = curation.projectCoverage.find(c => c.modId === m.id);
    return { modId: m.id, topicContexts: seed?.topicContexts || [], officialProfile: "source_ready",
      comparisonStatus: rows.some(r => r.reviewNeeded) ? "review_needed" : rows.some(r => r.reviewStatus === "supported") ? "has_supported_comparison" : rows.some(r => r.reviewStatus === "candidate") ? "candidate_only" : rows.length ? "assessed_without_supported_comparison" : "not_yet_assessed",
      missingEvidenceMessage: seed?.screening ? seed.screening.note : rows.length && rows.every(r=>["unsupported","withdrawn"].includes(r.reviewStatus)) ? "本轮已核查的线索未构成方法对照；其判断记录另列，不作为待跟进候选。" : "本轮尚未完成该 MOD 的社区方法对照；不表示社区没有相关工作。",
      searchScope: curation.scopeNotice, assessedOn: curation.asOf,
      ...(seed?.primaryRelationId ? {primaryRelationId:seed.primaryRelationId} : {}),
      ...(seed?.screening ? {screening:seed.screening} : {}) };
  });
  const sources = new Map((prior?.sourceSnapshots || []).map(s => [s.id,s]));
  currentSources.forEach(s => sources.set(s.id,s));
  const reviews = new Map((prior?.reviews || []).map(r => [r.id,r]));
  for (const r of relations) if (!prior?.relations.some(x => x.id === r.id)) reviews.set("initial:" + r.id, { id: "initial:" + r.id, entityId: r.id, recordedAt: r.assessedOn, actor: r.assessedBy, action: "initial", previousReviewId: null, reviewedAgainst: r.reviewedAgainst, rationale: r.conclusionScope });
  for (const r of curation.reviews || []) {
    check(r.id && r.actor && r.rationale && r.recordedAt, "Incomplete review");
    check(!reviews.has(r.id) || canonical(reviews.get(r.id)) === canonical(r), "Review history is append-only");
    reviews.set(r.id,r);
  }
  const payload = {
    asOf: curation.asOf, sourceChain: lock.sourceChain, previousSnapshotId: previous?.payloadSha256 || null,
    activeSourceIds: currentSources.map(s=>s.id).sort(),
    sourceSnapshots: [...sources.values()].sort((a,b) => a.id.localeCompare(b.id, "en")),
    mods, audit: audit.sort((a,b) => a.id.localeCompare(b.id, "en")), relations, questions,
    coverage, reviews: [...reviews.values()].sort((a,b) => a.id.localeCompare(b.id, "en")),
    changes: makeChanges(previous, mods, currentSources, relations, questions, curation.asOf),
    scopeNotice: curation.scopeNotice, stages: stageNames, stageMappingVersion,
    ...(curation.corpusSummary ? {corpusSummary:curation.corpusSummary} : {})
  };
  // Observation clocks are receipts, not content identity or technical changes.
  for (const s of payload.sourceSnapshots) {
    if (s.version && s.kind !== "official_registry") {
      delete s.version.observedOn; delete s.version.updatedAt;
    }
  }
  if (previous && effectiveState(previous.payload) === effectiveState(payload)) return previous;
  const bundle = { schemaVersion: 1, ruleVersion: "group-mod-eligibility/1", payload, payloadSha256: fieldHash(payload) };
  validateBundle(bundle);
  return bundle;
}
export function validateBundle(bundle) {
  check(bundle?.schemaVersion === 1 && bundle.payload && /^[a-f0-9]{64}$/.test(bundle.payloadSha256 || ""), "Unsupported group research bundle");
  check(fieldHash(bundle.payload) === bundle.payloadSha256, "Payload hash mismatch");
  const p = bundle.payload;
  for (const key of ["mods","relations","questions","sourceSnapshots","coverage","reviews","changes"]) check(Array.isArray(p[key]), "Missing collection " + key);
  for (const key of ["mods","relations","questions","sourceSnapshots","reviews","changes"]) unique(p[key]);
  const modIds = new Set(p.mods.map(m => m.id)), sourceIds = new Set(p.sourceSnapshots.map(s => s.id)), relationIds = new Set(p.relations.map(r => r.id));
  for (const s of p.sourceSnapshots) check(safeUrl(s.url), "Unsafe source URL");
  for (const m of p.mods) {
    check(m.id === "mod:vllm-hust:" + m.componentId && m.eligibility.decision === "included", "Invalid MOD identity");
    check(["runtime_mod","connector_mod","tool_mod"].includes(m.kind) && ["implemented","implemented_restricted"].includes(m.lifecycle), "Ineligible MOD in public list");
    check(!m.repository || safeUrl(m.repository), "Unsafe repository");
    check(m.sourceRefs.every(r => sourceIds.has(r.sourceSnapshotId)), "Missing MOD source");
  }
  if(p.stageMappingVersion) {
    check(p.stageMappingVersion===stageMappingVersion&&canonical(p.stages)===canonical(stageNames),"Invalid eight-stage definition");
    for(const m of p.mods) {
      const mapping=m.stageMapping;
      check(Array.isArray(m.stages)&&new Set(m.stages).size===m.stages.length&&m.stages.every(id=>Object.hasOwn(stageNames,id)),"Invalid inference stage");
      check(mapping?.version===p.stageMappingVersion&&mapping.status===(m.stages.length?"mapped":"unmapped")&&mapping.basis&&Array.isArray(mapping.sourcePhases),"Missing stage mapping basis");
      check(m.stages.length||mapping.unmappedReason,"Unmapped MOD needs an explanation");
      check(mapping.sourceRefs?.length>=2&&mapping.sourceRefs.every(r=>r.identityValue===m.componentId&&/^[a-f0-9]{64}$/.test(r.valueSha256)&&r.jsonPointer.startsWith("/components/")),"Missing stage source locators");
    }
  }
  for (const r of p.relations) {
    check(modIds.has(r.modId) && sourceIds.has(r.sourceSnapshotId), "Dangling relation");
    check(["supported","candidate","unsupported","withdrawn"].includes(r.reviewStatus), "Unknown relation state");
    check(Array.isArray(r.differences) && r.differences.length && typeof r.commonProblem==="string" && typeof r.modApproach==="string" && typeof r.communityApproach==="string" && Array.isArray(r.applicability?.checks) && r.applicability.checks.length, "Incomplete comparison content");
    check(r.modEvidence.length && r.communityEvidence.length && r.modEvidence.every(v => sourceIds.has(v.sourceSnapshotId) && /^[a-f0-9]{64}$/.test(v.valueSha256)), "Missing bilateral evidence");
    check(r.performanceTransfer === "not_established" || r.performanceEvidence?.length, "Unsupported benefit transfer");
    if (r.comparisonAxes) check(r.comparisonAxes.length>=2 && r.comparisonAxes.every(a=>a.dimension&&a.mod&&a.community) && r.associationReason && r.researchSignificance, "Incomplete comparison reasoning");
    if (r.codeReferences) check(r.codeReferences.every(e=>safeUrl(e.url)&&e.label&&e.excerpt&&/^[a-f0-9]{40}$/.test(e.revision)), "Invalid pinned code citation");
  }
  for (const q of p.questions) {
    check(q.minimumValidation && ["baselines","controls","metrics"].every(k=>Array.isArray(q.minimumValidation[k])), "Incomplete validation protocol");
    check(q.modIds.every(id => modIds.has(id)) && q.relationIds.every(id => relationIds.has(id)), "Dangling question");
    if(q.purpose==="research") check(q.relationIds.some(id=>p.relations.some(r=>r.id===id&&r.reviewStatus==="supported"&&p.sourceSnapshots.some(s=>s.id===r.sourceSnapshotId&&s.kind==="pr"))) && q.hypothesis && ["modProgress","communityProgress","difference","significance"].every(k=>q.researchContext?.[k]), "Research question lacks supported PR comparison or reasoning");
    check(!["resolved","contradicted"].includes(q.status) || (q.resolution?.conclusion && q.resolution?.sourceRefs?.length && q.resolution?.recordedBy && q.resolution?.recordedOn), "Resolved question lacks evidence");
  }
  check(new Set(p.coverage.map(c => c.modId)).size === p.mods.length && p.coverage.every(c => modIds.has(c.modId)), "Incomplete coverage");
  for (const c of p.coverage) {
    if(c.primaryRelationId) check(p.relations.some(r=>r.id===c.primaryRelationId && r.modId===c.modId && r.reviewStatus==="supported" && p.sourceSnapshots.some(s=>s.id===r.sourceSnapshotId && s.kind==="pr")), "Invalid editorial primary PR");
    if(c.screening) {
      const s=c.screening;
      check(s.status==="screened" && p.corpusSummary?.corpusId===s.corpusId, "Screening/corpus version mismatch");
      check([s.candidateCount,s.reviewedCount,s.pendingCount].every(n=>Number.isInteger(n)&&n>=0) && s.reviewedCount+s.pendingCount===s.candidateCount, "Invalid screening progress counts");
      check(typeof s.note==="string" && s.note.length>0, "Missing screening scope note");
    }
  }
  if(p.corpusSummary) check(p.corpusSummary.corpusId && p.corpusSummary.inputCount>0 && p.corpusSummary.periodStart && p.corpusSummary.periodEnd && p.corpusSummary.note, "Incomplete corpus scope");
  const text = JSON.stringify(p);
  check(!/(?:file:\/\/|[A-Z]:\\\\|\/home\/|\/root\/|<script\b)/i.test(text), "Non-public filesystem or executable HTML in public data");
  return true;
}
export async function validateSchema(bundle, root) {
  const schema = JSON.parse(await readFile(path.join(root, "schemas/GroupResearch.schema.json"), "utf8"));
  const validate = new Ajv({ allErrors: true, strict: false }).compile(schema);
  check(validate(bundle), "Schema: " + JSON.stringify(validate.errors));
}
export async function loadInputs(sourceDir, evidenceDir, lock, curation) {
  const read = async name => { const bytes = await readFile(path.join(sourceDir,name)); return { bytes, json: JSON.parse(bytes.toString("utf8")) }; };
  const before = await read("deployment-provenance.json"), after = await read("deployment-provenance-after.json");
  check(canonical(before.json) === canonical(after.json), "Publication changed during collection");
  const provenance = before.json;
  check(provenance.presentation.revision === lock.sourceChain.presentationCommit, "Presentation lock mismatch");
  check(provenance.sources.publication_revision.revision === lock.sourceChain.publicationCommit, "Publication lock mismatch");
  check(provenance.sources.visibility_policy_revision.revision === lock.sourceChain.visibilityPolicyCommit, "Visibility lock mismatch");
  const manifest = (await read("data__benchmark-source-manifest.json")).json;
  check(manifest.commit === lock.sourceChain.publicationCommit, "Manifest revision mismatch");
  const data = {};
  check(canonical(Object.keys(lock.sourceChain.servedProjectionHashes).sort()) === canonical(["data/ecosystem.json","data/mod-taxonomy.json","data/plugin-workshop-metadata.json"].sort()), "Public source paths must use the exact whitelist");
  for (const [webPath, expected] of Object.entries(lock.sourceChain.servedProjectionHashes)) {
    const name = webPath.replaceAll("/", "__"), value = await read(name);
    const entry = manifest.files.find(f => f.website_path === webPath);
    check(entry?.sha256 === expected && sha(value.bytes) === expected, "Public source SHA mismatch: " + webPath);
    data[webPath] = value.json;
  }
  for (const source of curation.sources) {
    const file = lock.evidenceFiles[source.id];
    check(file && !path.isAbsolute(file.localPath) && !file.localPath.split(/[\\/]/).includes(".."), "Unsafe evidence path");
    const bytes = await readFile(path.join(evidenceDir,file.localPath));
    check(sha(bytes) === file.sha256, "Community artifact SHA mismatch: " + source.id);
    if (source.kind === "pr") {
      const raw = JSON.parse(bytes.toString("utf8")), v = source.sourceVersion;
      check(raw.html_url === source.url && raw.head.sha === v.headSha && raw.base.sha === v.baseSha && sha(raw.body || "") === v.bodySha256, "PR version mismatch: " + source.id);
      check(raw.state === v.state && raw.merged === v.merged && raw.draft === v.draft, "PR state mismatch");
    }
  }
  return { ecosystem: data["data/ecosystem.json"], taxonomy: data["data/mod-taxonomy.json"], lock, curation };
}
export async function verifyPublic(rootDir) {
  const index = JSON.parse(await readFile(path.join(rootDir,"index.json"),"utf8"));
  check(index.schemaVersion === 1 && Array.isArray(index.snapshots), "Invalid index");
  check(index.snapshots.some(s => s.snapshotId === index.currentSnapshotId && !s.withdrawn), "Invalid current snapshot");
  for (const s of index.snapshots) {
    check(/^[a-f0-9]{64}$/.test(s.snapshotId), "Unsafe snapshot identity");
    if (s.withdrawn) { check(s.bundlePath == null, "Withdrawn history must not link original"); continue; }
    check(s.bundlePath === "versions/" + s.snapshotId + "/bundle.json", "Unsafe bundle path");
    const bytes = await readFile(path.join(rootDir,s.bundlePath));
    check(sha(bytes) === s.bundleSha256, "Bundle file hash mismatch");
    const bundle = JSON.parse(bytes.toString("utf8"));
    validateBundle(bundle);
    check(bundle.payloadSha256 === s.snapshotId, "Index/bundle identity mismatch");
  }
  return index;
}
export async function publishLocal(bundle, rootDir, previous, auditDir) {
  validateBundle(bundle);
  let index;
  try { index = await verifyPublic(rootDir); } catch (error) {
    try { await access(path.join(rootDir,"index.json")); throw error; } catch (e) { if (e.code !== "ENOENT") throw e; }
  }
  if (index?.currentSnapshotId === bundle.payloadSha256) return index;
  if (index) check(previous?.payloadSha256 === index.currentSnapshotId, "A changed import must explicitly name the current --previous snapshot");
  const oldVisible = new Set(previous?.payload.mods.map(m => m.id) || []);
  const nowVisible = new Set(bundle.payload.mods.map(m => m.id));
  const revoked = [...oldVisible].filter(id => !nowVisible.has(id) && bundle.payload.audit.some(a => "mod:vllm-hust:" + a.id === id && a.publicAllowed === false));
  const snapshots = index?.snapshots || [];
  // Retracted public scope overrides archival display; preserve full audit outside public.
  if (revoked.length) {
    check(auditDir && !path.resolve(auditDir).startsWith(path.resolve(rootDir) + path.sep), "Withdrawal needs a non-public audit directory");
    for (const s of snapshots.filter(s => !s.withdrawn)) {
      const original = path.join(rootDir,s.bundlePath);
      const bytes = await readFile(original), old = JSON.parse(bytes.toString("utf8"));
      if (old.payload.mods.some(m => revoked.includes(m.id))) {
        await mkdir(auditDir,{recursive:true});
        await writeFile(path.join(auditDir,s.snapshotId + ".json"),bytes,{flag:"wx"}).catch(e => { if(e.code !== "EEXIST") throw e; });
        await rename(original, path.join(auditDir,s.snapshotId + "-removed-from-public.json"));
        s.withdrawn = true; s.bundlePath = null; s.bundleSha256 = null;
      }
    }
  }
  const dir = path.join(rootDir,"versions",bundle.payloadSha256);
  await mkdir(dir,{recursive:true});
  const text = JSON.stringify(bundle,null,2) + "\n", bytes = Buffer.from(text);
  const file = path.join(dir,"bundle.json");
  try { const existing = await readFile(file); check(existing.equals(bytes),"Immutable snapshot collision"); }
  catch (e) { if (e.code !== "ENOENT") throw e; await writeFile(file,bytes,{flag:"wx"}); }
  const p = bundle.payload, supported = new Set(p.relations.filter(r => r.reviewStatus === "supported").map(r => r.modId));
  const row = { snapshotId: bundle.payloadSha256, previousSnapshotId: p.previousSnapshotId, bundlePath: "versions/" + bundle.payloadSha256 + "/bundle.json", bundleSha256: sha(bytes), asOf: p.asOf, isBaseline: !previous, counts: { mods:p.mods.length, supportedMods:supported.size, relations:p.relations.length, questions:p.questions.length, reviewNeeded:p.relations.filter(r=>r.reviewNeeded).length } };
  const result = {
    schemaVersion:1, currentSnapshotId:bundle.payloadSha256, snapshots:[...snapshots,row],
    modSearchIndex:p.mods.map(m=>({componentId:m.componentId,displayName:m.displayName,aliases:m.aliases,problemSummary:m.facts.problem || m.facts.summary,relatedWorks:p.relations.filter(r=>r.modId===m.id).flatMap(r=>{const s=p.sourceSnapshots.find(s=>s.id===r.sourceSnapshotId);return [r.communityWorkId,s?.title,s?.titleZh].filter(Boolean);}),maintainerNames:m.maintainers.map(v=>v.name),stageIds:m.stages,topicIds:p.coverage.find(c=>c.modId===m.id)?.topicContexts.map(t=>t.topicId)||[],eligibilityLabel:m.lifecycle==="implemented_restricted"?"已实现，条件受限":"已实现并登记"}))
  };
  await writeFile(path.join(rootDir,"index.json.tmp"),JSON.stringify(result,null,2)+"\n");
  await rename(path.join(rootDir,"index.json.tmp"),path.join(rootDir,"index.json"));
  return result;
}
