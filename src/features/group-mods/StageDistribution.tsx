import { stageDistribution } from "./selectors";
import type { Bundle } from "./types";

// Key colors by stage identity so they stay consistent across snapshot ordering.
const colors:Record<string,string>={
 startup:"#648d74",scheduling:"#397f70",prefill:"#8e80b3",pd_transfer:"#bb8361",
 decode:"#b39459",speculative:"#7296ba",output_return:"#a57765",resource_reclaim:"#7b958d",

};
const percent=(value:number)=>value===0?"0%":value.toFixed(1)+"%";

export function StageDistribution({bundle,selectedStage,onSelect}:{
 bundle:Bundle;selectedStage:string|null;onSelect:(id:string)=>void;
}) {
 const {total,stages,mappedCount,unmappedCount,legacyProjectionCount}=stageDistribution(bundle);
 let offset=0;
 const slices=stages.filter(stage=>stage.count>0).map(stage=>{
  const slice={...stage,offset};offset+=stage.share;return slice;
 });
 return <section className="gm-stage-section" aria-labelledby="gm-stage-heading">
  <h2 id="gm-stage-heading">按推理环节查看</h2>
  <p className="gm-muted">采用与首页相同的八个推理环节。同一 MOD 可以涉及多个环节，各环节数量存在交叉；占比按当前快照全部有效环节关联次数计算。</p>
  <div className="gm-stage-distribution">
   <figure className="gm-stage-figure">
    <figcaption>环节关联分布</figcaption>
    <div className="gm-stage-ring">
     <svg viewBox="0 0 180 180" role="img" aria-label={"共 "+total+" 次 MOD 与环节关联。"+slices.map(stage=>stage.name+"："+stage.count+" 个 MOD，占 "+percent(stage.share)).join("；")}>
      <circle cx="90" cy="90" r="66" fill="none" stroke="var(--border-subtle)" strokeWidth="22"/>
      {slices.map(stage=><circle key={stage.id} cx="90" cy="90" r="66" pathLength="100" fill="none"
       stroke={colors[stage.id]} strokeWidth={selectedStage===stage.id?26:22}
       strokeDasharray={stage.share+" "+(100-stage.share)} strokeDashoffset={-stage.offset}
       transform="rotate(-90 90 90)" opacity={selectedStage && selectedStage!==stage.id ? .3 : 1}>
       <title>{stage.name+"："+stage.count+" 个 MOD（"+percent(stage.share)+"）"}</title>
      </circle>)}
     </svg>
     <div className="gm-stage-ring-label" aria-hidden="true"><strong>{total}</strong><span>环节关联</span></div>
    </div>
    <p className="gm-muted">覆盖 {mappedCount} / {bundle.payload.mods.length} 个 MOD</p>
    {!!unmappedCount&&<p className="gm-muted">{unmappedCount} 个 MOD 的八环节位置尚未明确，保留在目录。</p>}
    {!total&&<p className="gm-muted">当前版本暂无环节关联</p>}
   </figure>
   <div className="gm-stages" role="group" aria-label="按推理环节筛选 MOD">
    {stages.map(stage=><button type="button" key={stage.id} aria-pressed={selectedStage===stage.id} onClick={()=>onSelect(selectedStage===stage.id?"":stage.id)}>
     <i className="gm-stage-swatch" aria-hidden="true" style={{background:colors[stage.id]}}/>
     <span className="gm-stage-name">{stage.name}<small>{stage.count} 个 MOD</small></span>
     <strong>{percent(stage.share)}</strong>
    </button>)}
   </div>
  </div>
  {legacyProjectionCount>0&&<p className="gm-muted">历史快照正文未改写；本页按来源版本匹配的八环节映射展示，原始分类与逐项依据见“来源与口径”。</p>}
  <p className="gm-stage-note gm-muted">{total?"占比 = 该环节的 MOD 数量 ÷ "+total+" 次有效环节关联。":"当前版本暂无可计算占比的环节关联。"}点击图例筛选，再次点击取消。</p>
 </section>;
}
