import inferenceStageNames from "../../inference-stages.json";
import mappingDocument from "../../../data/group-research/inference-stage-mapping.v1.json";
import type { Bundle, Mod, StageMapping } from "./types";

export { inferenceStageNames };
export const stageMappingVersion=mappingDocument.version;
export const isInferenceStage=(id:string)=>Object.hasOwn(inferenceStageNames,id);
export const sourcePhaseLabels:Record<string,string>={
 offline_preparation:"离线准备",service_startup:"服务启动",request_admission:"请求准入",prefill:"Prefill",decode:"Decode",
 state_lifecycle:"状态生命周期",service_lifecycle:"服务生命周期",observability:"可观测与评测",
};
export const legacyStageLabels:Record<string,string>={state_management:"KV / 状态管理",observability:"可观测与评测",service_support:"服务支撑",unclassified:"待明确环节"};
const legacyPhases:Record<string,string>={state_lifecycle:"state_management",observability:"observability",service_lifecycle:"service_support"};
const ordered=(ids:string[])=>Object.keys(inferenceStageNames).filter(id=>ids.includes(id));

/** Legacy bundles remain byte-for-byte intact. Projection requires matching source evidence. */
export function modStageView(bundle:Bundle,mod:Mod) {
 if(mod.stageMapping)return {...mod.stageMapping,stages:ordered(mod.stages),compatibilityProjection:false};
 const entry=(mappingDocument.mods as Record<string,Omit<StageMapping,"version">&{stages:string[]}>)[mod.componentId];
 const projections=bundle.payload.sourceChain.servedProjectionHashes as Record<string,string>|undefined;
 const summaryRef=entry?.sourceRefs.find(r=>r.sourceId==="public:data__ecosystem.json");
 if(entry&&summaryRef?.valueSha256===mod.fieldHashes.summary_zh&&projections?.["data/mod-taxonomy.json"]===mappingDocument.taxonomySha256) {
  return {...entry,version:mappingDocument.version,stages:ordered(entry.stages),compatibilityProjection:true};
 }
 const reason="当前八环节映射未覆盖此版本的来源；不将原始分类直接计为流程归属，原始分类仍保留在来源中。";
 return {version:mappingDocument.version,status:"unmapped" as const,basis:reason,unmappedReason:reason,sourcePhases:[],sourceRefs:[],stages:[],compatibilityProjection:true};
}
/** Old auxiliary URLs keep their historical meaning; they never map to an inference stage. */
export function hasLegacyStage(mod:Mod,id:string) {
 if(!mod.stageMapping)return mod.stages.includes(id);
 return mod.stageMapping.sourcePhases.some(phase=>legacyPhases[phase]===id)||
  (id==="unclassified"&&mod.stageMapping.sourcePhases.length===0);
}
