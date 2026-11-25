import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { KvGuideLink } from "./KvGuideLink";
import { KvGuideChapterHeading, KvGuideChapterEnd } from "./KvGuideChapter";
import { estimateModelKVBytes, kvMemoryModels, initialMemoryLoad, doubleMemoryLoad, memoryReference, memoryReferenceGiB, memoryLimits, memoryMinimums, memoryTokenStep, type MemoryLoad, type MemoryAction, type MemoryComparison } from "./kv-basics";

const formatGiB = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 8 });
const modelFor = (id: string) => kvMemoryModels.find(item => item.id === id) ?? kvMemoryModels[0];
const amountFor = (load: MemoryLoad) => estimateModelKVBytes(load.tokens, load.sequences, modelFor(load.modelId)) / 2 ** 30;
const describeLoad = (load: MemoryLoad) => `${modelFor(load.modelId).name} · ${load.tokens.toLocaleString("en-US")} token × ${load.sequences} 请求`;
const actionLabels: Record<MemoryAction, string> = { model: "切换模型", "double-tokens": "已缓存长度翻倍", "double-requests": "请求数翻倍", restore: "恢复示例" };

export default function KvMemory({ load, comparison, onChange }: {
  load: MemoryLoad; comparison: MemoryComparison | null; onChange: (change: Partial<MemoryLoad>, action?: MemoryAction) => void;
}) {
  const { modelId, tokens, sequences } = load;
  const model = modelFor(modelId);
  const { gib, percent, unfilledGiB, overflowGiB, cells } = memoryReference(estimateModelKVBytes(tokens, sequences, model));
  const overflowCells = Array.from({ length: Math.ceil(overflowGiB) }, (_, index) => Math.min(1, overflowGiB - index));
  const doubledTokens = doubleMemoryLoad(load, "tokens");
  const doubledRequests = doubleMemoryLoad(load, "sequences");
  const scope = `${model.name} · BF16 · ${model.fullAttentionLayers} 层全注意力 KV`;
  const resultSummary = `${scope}，每请求已缓存 ${tokens.toLocaleString("en-US")} token，${sequences} 个等长独立请求，共 ${formatGiB(gib)} GiB。${model.linearAttentionLayers ? `另有 ${model.linearAttentionLayers} 层递推状态及其他开销未计入。` : "不含权重、激活与分配开销。"}${overflowGiB > 0 ? `超出 64 GiB 参照 ${formatGiB(overflowGiB)} GiB。` : ""}`;
  const [announcement, setAnnouncement] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setAnnouncement(resultSummary), 350);
    return () => clearTimeout(timer);
  }, [resultSummary]);
  return <section id="kv-basics-memory" className="kv-basics-memory kv-guide-chapter" tabIndex={-1}>
    <KvGuideChapterHeading number="02" category="估算容量" title="长度和请求数怎样影响 KV 占用？">同一模型与 KV 精度下，缓存长度或请求数翻倍，这部分全注意力 KV 也翻倍。这里假设请求等长、彼此独立，全部 KV 位于单卡。</KvGuideChapterHeading>
    <div className="kv-memory-calculator">
      <div className="kv-memory-controls">
        <div className="kv-memory-control-intro"><h4>选择模型，调整请求规模</h4><p>一次改变一个变量，观察容量结果。</p></div>
        <div className="kv-memory-model">
          <label htmlFor="kv-memory-model">模型 <span>KV 数据类型：BF16 · 每值 2 字节</span></label>
          <div className="kv-memory-select"><select id="kv-memory-model" value={model.id} onChange={e => onChange({ modelId: e.target.value }, "model")} aria-describedby="kv-memory-model-scope">
            {kvMemoryModels.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}
          </select><ChevronDown size={18} aria-hidden="true" /></div>
          <p id="kv-memory-model-scope" className="kv-memory-model-scope">{model.fullAttentionLayers} 层全注意力 · {model.kvHeads} 个 KV 头 · 每头 {model.headSize} 维。
            {model.linearAttentionLayers > 0 && <strong>另有 {model.linearAttentionLayers} 层递推状态未计入。<KvGuideLink part="kv-basics-linear-attention">了解混合结构怎样保存历史</KvGuideLink></strong>}
          </p>
        </div>
        <div className="kv-memory-input">
          <label htmlFor="kv-context-length">每请求已缓存长度（token）<output htmlFor="kv-context-length">{tokens.toLocaleString("en-US")}</output></label>
          <input id="kv-context-length" type="range" min={memoryMinimums.tokens} max={memoryLimits.tokens} step={memoryTokenStep} value={tokens} onChange={e => onChange({ tokens: Number(e.target.value) })} aria-describedby="kv-memory-teaching-range" />
          <div className="kv-memory-range" aria-hidden="true"><span>1,024</span><span>32,768</span></div>
        </div>
        <div className="kv-memory-input">
          <label htmlFor="kv-concurrent-sequences">同时保留 KV 的请求数<output htmlFor="kv-concurrent-sequences">{sequences}</output></label>
          <input id="kv-concurrent-sequences" type="range" min={memoryMinimums.sequences} max={memoryLimits.sequences} step="1" value={sequences} onChange={e => onChange({ sequences: Number(e.target.value) })} />
          <div className="kv-memory-range" aria-hidden="true"><span>1 个</span><span>16 个</span></div>
        </div>
        <p id="kv-memory-teaching-range" className="kv-memory-range-note">教学范围：1,024–32,768 token，步长 1,024；1–16 请求。已缓存长度不是模型的上下文上限。</p>
        <div className="kv-memory-experiments">
          <button type="button" disabled={!doubledTokens} onClick={() => doubledTokens && onChange(doubledTokens, "double-tokens")}>已缓存长度翻倍</button>
          <button type="button" disabled={!doubledRequests} onClick={() => doubledRequests && onChange(doubledRequests, "double-requests")}>请求数翻倍</button>
          <button type="button" onClick={() => onChange(initialMemoryLoad, "restore")} disabled={modelId === initialMemoryLoad.modelId && tokens === initialMemoryLoad.tokens && sequences === initialMemoryLoad.sequences}>恢复 Qwen3-14B · 8,192 token × 4 请求</button>
          {(!doubledTokens || !doubledRequests) && <p>{!doubledTokens && "已缓存长度再翻倍将超出教学范围 32,768。"}{!doubledRequests && "请求数再翻倍将超出教学范围 16。"}</p>}
        </div>
        <p className="kv-memory-unit">当前每 token、每请求：<strong>{estimateModelKVBytes(1, 1, model) / 1024} KiB</strong> 全注意力 KV。</p>
      </div>
      <div className="kv-memory-overview">
        <div className="kv-memory-result" aria-label="当前容量结果">
          <span>估算 KV 存储量 · {scope}</span><span>{tokens.toLocaleString("en-US")} token / 请求 × {sequences} 个等长独立请求</span>
          <strong>{formatGiB(gib)} <small>GiB</small></strong><span>相当于 64 GiB 参照的 {percent.toFixed(2)}%</span>
          <span>{model.linearAttentionLayers > 0 ? `另需 ${model.linearAttentionLayers} 层递推状态及其他开销，未计入` : "不含模型权重、激活与分配开销"}</span>
          {overflowGiB > 0 && <span className="kv-memory-overflow">超出参照 {formatGiB(overflowGiB)} GiB；下方橙色格子表示超出部分。</span>}
        </div>
        <span className="kv-memory-announcement" aria-live="polite" aria-atomic="true">{announcement}</span>
      <figure className="kv-hbm-figure" aria-labelledby="kv-hbm-title">
        <figcaption className="kv-hbm-heading"><div><strong id="kv-hbm-title">64 GiB 统一参照</strong><span>Ascend 910B2 容量示意</span></div><span>每格 1 GiB</span></figcaption>
        <p className="kv-hbm-current">{scope}<br />{tokens.toLocaleString("en-US")} token × {sequences} 请求 · {formatGiB(gib)} GiB（{percent.toFixed(2)}%）</p>
        <div className="kv-hbm-chart" role="img" aria-label={`全注意力 KV 占 64 GiB 参照的 ${percent.toFixed(2)}%。${overflowGiB > 0 ? `绿色表示参照内 ${memoryReferenceGiB} GiB，橙色表示超出 ${formatGiB(overflowGiB)} GiB；每格仍为 1 GiB。` : "未填部分不是实际可用显存。"}`}>
          <div className="kv-hbm-grid" aria-hidden="true">
            {cells.map((fill, index) => <span className="kv-hbm-cell" key={index}><span style={{ width: `${fill * 100}%` }} /></span>)}
          </div>
          {overflowGiB > 0 && <div className="kv-hbm-overflow" aria-hidden="true">
            <p>超出参照 {formatGiB(overflowGiB)} GiB</p>
            <div className="kv-hbm-grid">{overflowCells.map((fill, index) =>
              <span className="kv-hbm-cell is-overflow" key={index}><span style={{ width: `${fill * 100}%` }} /></span>)}</div>
          </div>}
        </div>
        <div className="kv-hbm-legend">
          <div><span className="kv-hbm-swatch is-kv" aria-hidden="true" /><span>{overflowGiB > 0 ? "参照内 KV" : "全注意力 KV"}<strong>{formatGiB(Math.min(gib, memoryReferenceGiB))} GiB</strong></span></div>
          <div><span className={"kv-hbm-swatch" + (overflowGiB > 0 ? " is-overflow" : "")} aria-hidden="true" /><span>{overflowGiB > 0 ? "超出参照" : "参照图未填部分"}<strong>{formatGiB(overflowGiB > 0 ? overflowGiB : unfilledGiB)} GiB</strong></span></div>
        </div>
        <p className="kv-hbm-note">{overflowGiB > 0 ? `KV 估算超出 64 GiB 参照 ${formatGiB(overflowGiB)} GiB；完整需求为 ${formatGiB(gib)} GiB。` : gib === memoryReferenceGiB ? "这部分 KV 已填满参照图，还需另计权重等开销。" : "未填部分尚未扣除模型权重、激活和分配等开销，并非实际空闲显存。"}</p>
        {model.linearAttentionLayers > 0 && <p className="kv-hbm-scope"><strong>只计 {model.fullAttentionLayers} 层全注意力 KV。</strong><br />另需 {model.linearAttentionLayers} 层递推状态及其他开销，未在方格中估算。</p>}
        <p className="kv-hbm-caption">理论存储示意 · 方格不是分页块；64 GiB 参照不能判断整个模型能否运行。</p>
      </figure>
      </div>
      {comparison && <div className="kv-memory-change"><strong>本次操作：{actionLabels[comparison.action]}</strong>
        <p>之前：{describeLoad(comparison.before)} → {formatGiB(amountFor(comparison.before))} GiB</p>
        <p>现在：{describeLoad(comparison.after)} → {formatGiB(amountFor(comparison.after))} GiB</p>
        <p>均按 BF16，仅比较各模型的全注意力 KV。{comparison.action === "model" ? "已缓存长度和请求数保持不变；两模型每 token、每请求分别为 160 / 20 KiB。" : comparison.action === "restore" ? "模型、已缓存长度和请求数同时恢复为示例配置。" : "只改变所选项，另一个负载项与模型保持不变。"}</p>
      </div>}
    </div>
    <details className="kv-memory-model-difference kv-basics-formula"><summary>为什么不同模型的全注意力 KV 相差 8 倍？</summary>
      <div className="kv-memory-specs" role="region" aria-label="全注意力规格对照，可横向滚动" tabIndex={0}><table><caption>固定版本的全注意力规格 · 两者 KV 均按 BF16，每值 2 字节</caption><thead><tr><th scope="col">模型</th><th scope="col">全注意力层</th><th scope="col">KV 头</th><th scope="col">头维度</th><th scope="col">每 token / 请求</th></tr></thead><tbody>{kvMemoryModels.map(item => <tr key={item.id}><th scope="row">{item.name}</th><td>{item.fullAttentionLayers}</td><td>{item.kvHeads}</td><td>{item.headSize}</td><td>{estimateModelKVBytes(1, 1, item) / 1024} KiB</td></tr>)}</tbody></table></div>
      <p>全注意力层数 × KV 头数 × 头维度的比例为 <strong>(10/40) × (2/8) × (256/128) = 1/8</strong>。它只比较相同负载、相同 KV 精度下的全注意力 KV，不是完整模型或全部缓存的比例。</p>
    </details>
    <details className="kv-basics-formula"><summary>查看公式与适用范围</summary>
      <p>固定版本配置的位置上限为 {model.configContextLimit.toLocaleString("en-US")}；它不是当前缓存长度，也不保证具体部署可用到该长度。</p>
      <p>14B：40 层 × 8 个 KV 头 × 128 维 × 2（K 与 V 两份）× 2 字节 = 160 KiB / token / 请求。35B 全注意力部分：10 × 2 × 256 × 2 × 2 = 20 KiB / token / 请求。</p>
      <p>等长独立请求的总字节数 = 2（K 与 V）× 请求数 × 已缓存长度 × 全注意力层数 × KV 头数 × 头维度 × 每值字节数。不等长时，先把各请求实际已缓存长度求和，再乘其余相同规格。</p>
      <p>跨请求共享只有在实际共用物理缓存时才减少存储。GQA / MQA 应填实际 KV 头数，不能用 Query 头数。此处不包含模型权重、激活、分配留空、量化辅助数据及分布式副本，不直接适用于 MLA 或滑动窗口。Qwen3.5 的 30 层递推状态、视觉编码器、中间状态、MTP 辅助层和各层不同布局需另算。</p>
      <p>KV BF16 描述缓存数值的精度，与权重量化分开。1 KiB = 2¹⁰ 字节，1 GiB = 2³⁰ 字节。<a href={model.source} target="_blank" rel="noreferrer">查看 {model.name} 固定版本官方配置</a>（配置核对：{model.sourceCheckedOn}）。</p>
      <p>容量参照采用 910B2 常见的 64 GiB 配置（65,536 MiB），实际可用容量以设备报告与部署配置为准。<a href="https://github.com/Project-HAMi/ascend-device-plugin/blob/9325759b9d297302908e91e17d81a2676ffd7a6f/ascend-device-configmap.yaml#L39-L44" target="_blank" rel="noreferrer">910B2 容量配置参考</a></p>
    </details>
    <details className="kv-basics-formula kv-memory-self-check"><summary>可跳过的自检：4 个请求变为 6 个，会占多少？</summary>
      <p>限定 Qwen3-14B、KV BF16、每请求已缓存 8,192 token、等长独立请求、全注意力 KV 全放单卡。4 请求为 5 GiB；6 请求是 6/4 = 1.5 倍，即 <strong>7.5 GiB</strong>。只改变请求数，不代表含权重等开销的完整显存也变为 1.5 倍。</p>
    </details>
    <KvGuideChapterEnd part="kv-basics-lifecycle" label="继续：认识复用与释放">这些数字只计算标明的全注意力 KV。请求越多、保留历史越长，占用越大；权重、递推状态等开销另计。</KvGuideChapterEnd>
  </section>;
}
