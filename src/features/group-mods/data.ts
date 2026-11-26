import { useEffect, useState } from "react";
import Ajv from "ajv";
import schema from "../../../schemas/GroupResearch.schema.json";
import type { Bundle, GroupIndex } from "./types";

export const groupAsset=(file:string)=>import.meta.env.BASE_URL+"group-research/"+file;
export const canonical=(v:unknown):string=>JSON.stringify(sort(v));
function sort(v:unknown):unknown {
 if(Array.isArray(v)) return v.map(sort);
 if(v&&typeof v==="object") return Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort((v as Record<string,unknown>)[k])]));
 return v;
}
export async function digest(text:string) {
 const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text));
 return Array.from(new Uint8Array(bytes),v=>v.toString(16).padStart(2,"0")).join("");
}
export function publicUrl(value:string) {
 try { const u=new URL(value); return ["https:","http:"].includes(u.protocol)&&!u.username&&!u.password?u.href:undefined; } catch{return undefined;}
}
const validate=new Ajv({strict:false,allErrors:true}).compile(schema);
const hash=/^[a-f0-9]{64}$/;
export function validateIndex(data:unknown):asserts data is GroupIndex {
 const index=data as GroupIndex;
 if(index?.schemaVersion!==1||!Array.isArray(index.snapshots)||!Array.isArray(index.modSearchIndex)||!hash.test(index.currentSnapshotId)) throw new Error("组内 MOD 索引格式不受支持。");
 if(!index.snapshots.some(s=>s.snapshotId===index.currentSnapshotId&&!s.withdrawn)) throw new Error("当前快照未列入有效索引。");
 if(new Set(index.snapshots.map(s=>s.snapshotId)).size!==index.snapshots.length) throw new Error("快照索引含重复身份。");
 for(const s of index.snapshots) {
  if(!hash.test(s.snapshotId)||(!s.withdrawn&&(s.bundlePath!=="versions/"+s.snapshotId+"/bundle.json"||!hash.test(s.bundleSha256||"")))) throw new Error("快照路径或版本不合法。");
 }
}
export async function decodeBundle(text:string,index:GroupIndex,snapshotId:string):Promise<Bundle> {
 const row=index.snapshots.find(s=>s.snapshotId===snapshotId);
 if(!row||row.withdrawn) throw new Error(row?.withdrawn?"该历史快照因公开范围调整，已撤回正文。":"该快照不存在，请选择索引中列出的版本。");
 if(await digest(text)!==row.bundleSha256) throw new Error("快照文件校验不一致，已停止显示。");
 const bundle=JSON.parse(text) as Bundle;
 if(!validate(bundle)||bundle.payloadSha256!==snapshotId||await digest(canonical(bundle.payload))!==snapshotId) throw new Error("数据版本或内容校验不一致，已停止显示。");
 const p=bundle.payload, mods=new Set(p.mods.map(m=>m.id)),sources=new Set(p.sourceSnapshots.map(s=>s.id)),relations=new Set(p.relations.map(r=>r.id));
 if(mods.size!==p.mods.length||sources.size!==p.sourceSnapshots.length||relations.size!==p.relations.length) throw new Error("数据实体身份重复。");
 if(p.mods.some(m=>m.id!=="mod:vllm-hust:"+m.componentId||m.sourceRefs.some(r=>!sources.has(r.sourceSnapshotId)))||
 p.relations.some(r=>!mods.has(r.modId)||!sources.has(r.sourceSnapshotId)||!r.modEvidence.every(e=>sources.has(e.sourceSnapshotId)))||
 p.questions.some(q=>q.modIds.some(id=>!mods.has(id))||q.relationIds.some(id=>!relations.has(id)))||
 p.sourceSnapshots.some(s=>!publicUrl(s.url))) throw new Error("来源或实体关联不完整。");
 return bundle;
}
export function useGroupIndex() {
 const [state,setState]=useState<{data?:GroupIndex;error?:string}>({});
 useEffect(()=>{
  const controller=new AbortController();
  fetch(groupAsset("index.json"),{signal:controller.signal,cache:"no-cache"})
  .then(r=>{if(!r.ok)throw new Error("组内 MOD 索引暂不可用（HTTP "+r.status+"）。");return r.json();})
  .then(v=>{validateIndex(v);setState({data:v});})
  .catch(e=>{if(!controller.signal.aborted)setState({error:String(e.message)});});
  return ()=>controller.abort();
 },[]);
 return state;
}
export function useGroupData(requested:string|null) {
 const index=useGroupIndex();
 const snapshot=requested||index.data?.currentSnapshotId;
 const [state,setState]=useState<{snapshot:string;bundle?:Bundle;error?:string}>();
 useEffect(()=>{
  if(!index.data||!snapshot)return;
  const controller=new AbortController();
  const row=index.data.snapshots.find(s=>s.snapshotId===snapshot);
  if(!row||row.withdrawn||!row.bundlePath){setState({snapshot,error:row?.withdrawn?"该历史快照因公开范围调整，已撤回正文。":"该快照不存在，请选择有效版本。"});return;}
  fetch(groupAsset(row.bundlePath),{signal:controller.signal,cache:"no-cache"})
  .then(r=>{if(!r.ok)throw new Error("快照加载失败（HTTP "+r.status+"）。");return r.text();})
  .then(text=>decodeBundle(text,index.data!,snapshot))
  .then(bundle=>setState({snapshot,bundle}))
  .catch(e=>{if(!controller.signal.aborted)setState({snapshot,error:String(e.message)});});
  return ()=>controller.abort();
 },[index.data,snapshot]);
 return {index:index.data,snapshot,bundle:state?.snapshot===snapshot?state?.bundle:undefined,error:index.error||(state?.snapshot===snapshot?state?.error:undefined)};
}
