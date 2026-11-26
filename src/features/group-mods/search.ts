import { useEffect,useState } from "react";
import type { GroupIndex } from "./types";
export function useModSearchIndex(enabled:boolean) {
 const [state,setState]=useState<{data?:GroupIndex;error?:string}>({});
 useEffect(()=>{
  if(!enabled)return;
  const controller=new AbortController();
  fetch(import.meta.env.BASE_URL+"group-research/index.json",{signal:controller.signal,cache:"no-cache"})
  .then(r=>{if(!r.ok)throw new Error("MOD 索引加载失败");return r.json();})
  .then(v=>{if(v.schemaVersion!==1||!Array.isArray(v.modSearchIndex)||v.modSearchIndex.some((m:unknown)=>!m||typeof m!=="object"||!Object.hasOwn(m,"componentId")||!/^[a-z0-9][a-z0-9-]*$/.test((m as {componentId:string}).componentId)||typeof (m as {displayName:string}).displayName!=="string"||typeof (m as {problemSummary:string}).problemSummary!=="string"||!["aliases","maintainerNames","stageIds"].every(k=>Array.isArray((m as Record<string,unknown>)[k])&&((m as Record<string,unknown>)[k] as unknown[]).every(v=>typeof v==="string"))))throw new Error("MOD 索引格式不受支持");setState({data:v});})
  .catch(e=>{if(!controller.signal.aborted)setState({error:e.message});});
  return ()=>controller.abort();
 },[enabled]);
 return state;
}
