import { useState } from "react";
import { generationAt, generationConnections, generationFrames, promptPositions } from "./kv-generation";
import { KvGuideLink } from "./KvGuideLink";
import { KvSnapshotText } from "./KvSnapshotText";
import { KvGuideChapterHeading, KvGuideChapterEnd } from "./KvGuideChapter";
import "./kv-generation-refinement.css";

const panels = [
  { operation: "准备输入", focus: "model", input: "批次 x1、x2、x3", compute: "尚未处理输入", weight: "尚未读取", value: "尚未得到向量", sampler: "等待注意力输出", feedback: "准备处理三个输入位置；当前没有 KV。下一步：处理输入。", next: "输入先交给模型，计算后才会产生它们各自的 K / V。" },
  { operation: "预填充与采样", focus: "sample", input: "已处理 x1、x2、x3", compute: "Q1…3、K1…3、V1…3", weight: "各位置可并行；i 只读 1…i", value: "各位置输出，取 y3", sampler: "已完成，选出 x4", feedback: "已有位置 1…3 的 KV；x4 已采样、未回送。下一步：送回 x4。", next: "x4 还没有自己的 KV；将它送回模型输入后，才会产生 K4 / V4。" },
  { operation: "回送与写入", focus: "cache", input: "x4 已回送", compute: "Q4 / K4 / V4", weight: "Q4 尚未读取历史", value: "等待读取", sampler: "等待向量 y4", feedback: "新增 K4 / V4，共 4 个 KV 位置。下一步：用 Q4 读取历史。", next: "下一步读取位置 1…4；读取本身不再增加 KV 条目。" },
  { operation: "读取历史", focus: "read", input: "已处理 x4", compute: "Q4 / K4 / V4（记录）", weight: "Q4 与 K1…K4", value: "V1…V4 得到 y4", sampler: "尚未执行后续计算与采样", feedback: "读取完成，得到向量 y4，KV 仍为 4 个位置。下一步：计算并采样。", next: "y4 还不是 token；接着经过后续模型计算、输出头与采样。" },
  { operation: "采样 token", focus: "sample", input: "x4 已处理，x5 待回送", compute: "Q4 / K4 / V4（记录）", weight: "已使用本轮权重", value: "已得到 y4", sampler: "已完成，选出 x5", feedback: "x5 已采样，但尚无自己的 KV。下一步：将 x5 送回模型。", next: "只有把 x5 送回模型并处理，才会产生 K5 / V5；记录 Q4 不等于缓存旧 Q。" },
  { operation: "回送与写入", focus: "cache", input: "x5 已回送", compute: "Q5 / K5 / V5", weight: "Q5 尚未读取历史", value: "等待读取", sampler: "等待向量 y5", feedback: "新增 K5 / V5，共 5 个 KV 位置。下一步：用 Q5 读取历史。", next: "下一步读取位置 1…5；读取本身不再增加 KV 条目。" },
  { operation: "读取历史", focus: "read", input: "已处理 x5", compute: "Q5 / K5 / V5（记录）", weight: "Q5 与 K1…K5", value: "V1…V5 得到 y5", sampler: "尚未执行后续计算与采样", feedback: "读取完成，得到向量 y5，KV 仍为 5 个位置。本段结束，可回看或重播。", next: "本段到 y5。标准循环可继续到停止条件；最终输出 token 未必再次回送。" },
] as const;

const tokenStatuses = ["输入", "待回送", "已处理", "未生成"] as const;
const existingStatuses = ["输入写入", "新增", "保留"] as const;


const connectionLabels = [
  "尚未写入 KV",
  "写入 x1–x3 的 K / V",
  "写入 K4 / V4",
  "Q4 读取位置 1–4 的 KV",
  "采样 x5，保留已有 KV",
  "写入 K5 / V5",
  "Q5 读取位置 1–5 的 KV",
] as const;

function connectionPosition(position: number) {
  return `calc((100% - 4 * var(--kv-flow-gap)) / 10 + ${position - 1} * (100% + var(--kv-flow-gap)) / 5)`;
}

function KvGenerationConnections({ frame }: { frame: number }) {
  const flow = generationConnections(frame);
  const first = flow.readPositions[0];
  const last = flow.readPositions.at(-1);
  return <figure className="kv-generation-transfer" aria-label="本帧输入与 KV 缓存的关系">
    <figcaption><KvSnapshotText text={connectionLabels[frame]} variants={connectionLabels} /></figcaption>
    <div className="kv-generation-connections" aria-hidden="true">
      {flow.readPositions.length > 0 && <>
        <span className="kv-flow-read-bus" style={{ left: connectionPosition(first), width: `calc(${connectionPosition(last!)} - ${connectionPosition(first)})` }} />
        {flow.readPositions.map(position => <span key={position} className="kv-flow-read-source" data-read-position={position}
          style={{ left: connectionPosition(position) }} />)}
        <svg className="kv-flow-read-target" data-query-position={flow.queryPosition} style={{ left: connectionPosition(flow.queryPosition!) }}
          width="24" height="28" viewBox="0 0 24 28" fill="none" focusable="false">
          <path d="M12 27V2M6 8L12 2L18 8" />
        </svg>
      </>}
      {flow.writePositions.map(position => <svg key={position} className="kv-flow-write" data-write-position={position}
        style={{ left: connectionPosition(position) }} width="24" height="56" viewBox="0 0 24 56" fill="none" focusable="false">
        <path d="M12 1V54M6 48L12 54L18 48" />
      </svg>)}
    </div>
  </figure>;
}

export default function KvGeneration({ onCompare }: { onCompare: (position: number) => void }) {
  const [frame, setFrame] = useState(0);
  const current = generationAt(frame);
  const scene = panels[frame];
  const comparePosition = frame >= 5 ? 5 : 4;
  const connections = generationConnections(frame);
  const readHere = scene.focus === "read";
  const sampled = current.pendingToken !== null;
  const variants = (field: keyof typeof panels[number]) => panels.map(panel => panel[field]);
  return <section id="kv-basics-process" className="kv-guide-chapter" tabIndex={-1}>
    <KvGuideChapterHeading number="01" category="生成与保存" title="KV 怎样产生并留下来？">模型处理一个 token 位置时产生它的 K / V，供后续位置读取。下面跟随一个请求的三个输入位置，只展开一层全注意力。</KvGuideChapterHeading>
    <p className="kv-guide-example-scope">x1、x2、x3 表示 token 位置，不是一字一个 token；这里使用教学示意，没有使用真实模型激活。</p>
    <p>Q（查询）与 K（键）先确定权重，再按权重汇总 V（值），得到本层注意力输出向量 y。y 经后续模型计算、输出头与采样，才成为下一个 token。</p>
    <div className="kv-generation" data-frame={frame}>
      <div className="kv-generation-toolbar">
        <div className="kv-generation-toolbar-top"><strong>演示快照 {frame + 1} / {generationFrames.length}</strong><span>本帧：{scene.operation}</span></div>
        <div className="kv-demo-actions">
          <button type="button" aria-controls="kv-generation-scene" onClick={() => setFrame(value => Math.min(generationFrames.length - 1, value + 1))} disabled={frame === generationFrames.length - 1}>{current.action}</button>
          <button type="button" aria-controls="kv-generation-scene" disabled={frame === 0} onClick={() => setFrame(value => Math.max(0, value - 1))}>上一步</button>
          <button type="button" aria-controls="kv-generation-scene" onClick={() => setFrame(0)}>重播七帧</button>
        </div>
        <p className="kv-generation-color-key">浅绿：已有输入或缓存；浅黄：采样后待回送；边框与箭头：本步操作。</p>
        <p className="kv-generation-feedback" aria-live="polite" aria-atomic="true"><KvSnapshotText text={scene.feedback} variants={variants("feedback")} /></p>
      </div>
      <div id="kv-generation-scene">
        <h4><KvSnapshotText text={current.title} variants={generationFrames.map(item => item.title)} /></h4>
        <div className={"kv-generation-model" + (scene.focus === "model" ? " is-active" : "")} data-snapshot-region="model">
          <div><span>本帧模型输入</span><strong><KvSnapshotText text={scene.input} variants={variants("input")} /></strong></div>
          <div><span>本层 Q / K / V 计算</span><strong><KvSnapshotText text={scene.compute} variants={variants("compute")} /></strong></div>
        </div>
        <p className="kv-generation-row-label">Token 序列</p>
        <div className="kv-generation-tokens" role="group" aria-label="同一请求中的 token 位置，含未来占位">
          {[1, 2, 3, 4, 5].map(position => <div key={position} className={[
            position <= promptPositions.length || current.kvPositions.includes(position) ? "is-input" : "",
            current.currentPosition === position ? "is-current" : current.pendingToken === position ? "is-pending" : "",
          ].filter(Boolean).join(" ")}>
            <strong>x{position}</strong><span><KvSnapshotText text={position <= promptPositions.length ? "输入" : current.pendingToken === position ? "待回送" : current.kvPositions.includes(position) ? "已处理" : "未生成"} variants={tokenStatuses} /></span>
          </div>)}
        </div>
        <KvGenerationConnections frame={frame} />
        <div className={"kv-generation-cache" + (connections.writePositions.length ? " is-writing" : "")}>
          <div className="kv-generation-cache-heading"><strong>KV 缓存</strong></div>
          <div className={"kv-generation-cache-space" + (readHere ? " is-reading" : "")}>
            {current.kvPositions.length > 0 ? <div className="kv-generation-slots" role="group" aria-label="本层已有的 KV 条目">
              {current.kvPositions.map(position => <div key={position} className={"is-stored" + (connections.writePositions.includes(position) ? " is-new" : "")}>
                <strong><span>K{position}</span><span className="kv-generation-kv-divider" aria-hidden="true">/</span><span>V{position}</span></strong><span><KvSnapshotText text={frame === 1 ? "输入写入" : connections.writePositions.includes(position) ? "新增" : "保留"} variants={existingStatuses} /></span>
              </div>)}
            </div> : <p className="kv-generation-empty">尚无 KV 条目，先处理输入。</p>}
          </div>
          <p className="kv-generation-cache-scope">只列已有 KV 位置，不是物理块；旧 Q 不留作缓存。</p>
        </div>
        <ol className={"kv-generation-read-path" + (scene.focus === "read" ? " is-active" : "")} aria-label="本层读取的先后关系">
          <li><span>Q 与 K 确定权重</span><strong><KvSnapshotText text={scene.weight} variants={variants("weight")} /></strong></li>
          <li><span>按权重汇总 V</span><strong><KvSnapshotText text={scene.value} variants={variants("value")} /></strong></li>
        </ol>
        <ol className="kv-generation-output" aria-label="从注意力向量到采样 token">
          <li><span>本层注意力输出</span><strong><KvSnapshotText text={current.attentionOutput ? "y" + current.attentionOutput + " · 向量" : "等待读取"} variants={["y3 · 向量", "y4 · 向量", "y5 · 向量", "等待读取"]} /></strong></li>
          <li className={scene.focus === "sample" ? "is-active" : ""}><span>后续模型计算、输出头与采样</span><strong><KvSnapshotText text={scene.sampler} variants={variants("sampler")} /></strong></li>
          <li className={scene.focus === "sample" ? "is-active" : ""}><span>采样得到的 token</span><strong><KvSnapshotText text={sampled ? "x" + current.pendingToken + " · 尚无自己的 KV" : "尚未采样"} variants={["x4 · 尚无自己的 KV", "x5 · 尚无自己的 KV", "尚未采样"]} /></strong></li>
        </ol>
        <p className="kv-generation-return"><KvSnapshotText text={scene.next} variants={variants("next")} /></p>
        <p className="kv-generation-snapshot-note">上一步和重播切换演示快照，不表示真实运行会撤销缓存。各区域只更新当前状态。</p>
        <KvGuideLink part="kv-basics-linear-attention" targetState={{ position: comparePosition }} onNavigate={() => onCompare(comparePosition)}>选读：查看第 {comparePosition} 个位置的两种历史保存方式</KvGuideLink>
        <p className="kv-generation-compare-note">打开另设数值的独立位置 {comparePosition} 教学示例，不表示本帧已产生该位置的 KV。</p>
      </div>
    </div>
    <details className="kv-basics-formula kv-generation-self-check"><summary>可跳过自检：x6 已采样、还没回送，缓存到哪里？</summary>
      <p>在标准自回归生成、没有淘汰的条件下，缓存到位置 5。模型处理 x5 后得到向量，再经后续计算与采样选出 x6；只有把 x6 回送模型并处理它，才会产生 K6 / V6。不确定时也可以直接展开核对。</p>
    </details>
    <details className="kv-basics-formula"><summary>深入一步：多个层、注意力头与输入的可见范围</summary>
      <p>Prefill 可以并行处理多个输入位置，并通过因果掩码限制每个位置只能读取自己及之前的位置。最后输入位置的 y3 用于后续计算和采样 x4，其他输入位置也有输出。</p>
      <p>固定区域表示数据依赖，不规定所有位置必须先统一写入再统一读取。Decode 演示先写入、再读取是教学顺序；实际算子可融合，物理写入时机也可不同。执行中可以产生临时 Q 张量；计算记录不表示旧 Q 被持久缓存。</p>
    </details>
    <KvGuideChapterEnd part="kv-basics-memory" label="继续：估算缓存占用">处理新位置才增加它的 KV，读取本身不增加条目。真实模型的各个全注意力层都需要保存自己的 KV。</KvGuideChapterEnd>
  </section>;
}
