import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { KvGuideLink } from "./KvGuideLink";
import { KvSnapshotText } from "./KvSnapshotText";
import { KvGuideChapterEnd } from "./KvGuideChapter";
import { kvMemoryModels } from "./kv-basics";
import { attentionViewAt, advanceAttentionDemo, rewindAttentionDemo, replayAttentionDemo, linearDemoInputs, type DemoCursor, type DemoMatrix, type DemoVector } from "./kv-linear-demo";
import { firstDecodePosition } from "./kv-generation";
import "./kv-linear-attention.css";

const tokenSteps = linearDemoInputs.map((_, index) => index + 1);
const phases = ["ready", "write", "read"] as const;
const vector = (values: DemoVector, digits = 0) => "[" + values.map(value => digits ? value.toFixed(digits) : value).join(", ") + "]";
const phaseName = (phase: DemoCursor["phase"]) => phase === "ready" ? "写入前" : phase === "read" ? "读取完成" : "更新完成";
const snapshotName = ({ step, phase }: DemoCursor) => "演示快照 · 位置 " + step + " / 8 · " + phaseName(phase);
const feedbackFor = ({ step, phase }: DemoCursor) => phase === "ready"
  ? "位置 " + step + "：沿用 " + (step - 1) + " 个 KV 位置和旧 S / z。下一步：写入本轮 K / V。"
  : phase === "write"
    ? "位置 " + step + "：KV 增至 " + step + " 个位置，S / z 已更新。下一步：用 Q" + step + " 读取。"
    : "位置 " + step + "：已读出两个输出向量，KV 与 S / z 不变。" + (step === 8 ? "本段结束，可重播或回看。" : "下一步：处理下一位置。");
const allCursors = tokenSteps.flatMap(step => phases.map(phase => ({ step, phase })));
const feedbackVariants = allCursors.map(feedbackFor);
const snapshotVariants = allCursors.map(snapshotName);
const currentInputFor = ({ step, phase }: DemoCursor) => "本轮输入 x" + step + " · " + (phase === "ready" ? "准备产生 Q / K / V" : "Q" + step + " / K" + step + " / V" + step + " 已产生");
const fullActionFor = ({ step, phase }: DemoCursor) => phase === "ready" ? "保留此前位置" : phase === "read" ? "Q" + step + " 读取历史" : "追加 K" + step + " / V" + step;
const stateActionFor = ({ step, phase }: DemoCursor) => phase === "ready" ? "保留此前状态" : phase === "read" ? "Q" + step + " 读取当前状态" : "更新原来的状态";
const stateOperationFor = ({ step, phase }: DemoCursor) => phase === "ready" ? "本轮尚未写入" : phase === "read" ? "Q" + step + " 读取，状态不变" : "K" + step + " / V" + step + " 更新状态";
const fullMeasureFor = ({ step, phase }: DemoCursor) => phase === "ready" ? "历史逐位置保留" : phase === "read" ? "读取后保留，下一轮继续使用" : "从 " + (step - 1) + " 个增加到 " + step + " 个位置";
const stateMeasureFor = ({ step, phase }: DemoCursor) => phase === "ready" ? "旧状态已包含此前位置" : phase === "read" ? "读取后不变，下一轮继续更新" : "S" + (step - 1) + " / z" + (step - 1) + " 更新，形状不变";
const linearReadFor = (step: number) => {
  const demo = attentionViewAt({ step, phase: "read" });
  return "分子 QᵀS = " + vector(demo.numerator) + "；分母 Qᵀz = " + demo.denominator + "。相除得到输出；读取不改变 S / z。";
};
const waitingRead = "分子 QᵀS 与分母 Qᵀz 尚未计算；输出等待读取。";
const linearReadVariants = [waitingRead, ...tokenSteps.map(linearReadFor)];
const pendingUpdate = "本轮写入量待应用；当前 S / z 仍为写入前值。";
const appliedUpdate = "已应用写入量：旧 S + ΔS = 当前 S；旧 z + K = 当前 z。读取不会再次改变它们。";

function StateMatrix({ label, values, changed }: { label: string; values: DemoMatrix; changed?: DemoMatrix }) {
  return <div className="kv-linear-matrix-group">
    <table className="kv-linear-matrix">
      <caption>{label} · 行：K 特征；列：V 分量</caption>
      <thead><tr><td /><th scope="col">V 分量 1</th><th scope="col">V 分量 2</th></tr></thead>
      <tbody>{values.map((row, rowIndex) => <tr key={rowIndex}><th scope="row">K 特征 {rowIndex + 1}</th>{row.map((value, columnIndex) => <td key={columnIndex} className={changed?.[rowIndex][columnIndex] ? "is-updated" : ""}>{value}</td>)}</tr>)}</tbody>
    </table>
  </div>;
}

export interface KvLinearAttentionProps {
  initialStep?: number;
  resetToken?: number;
  onPositionChange?: (position: number) => void;
  onSelectHybrid: () => void;
}

type HistoryComparisonProps = Pick<KvLinearAttentionProps, "resetToken" | "onPositionChange"> & { initialStep: number };

function HistoryComparison({ initialStep, resetToken, onPositionChange }: HistoryComparisonProps) {
  const [cursor, setCursor] = useState<DemoCursor>(() => replayAttentionDemo({ step: initialStep }));
  useEffect(() => setCursor(replayAttentionDemo({ step: initialStep })), [initialStep, resetToken]);
  const { step, phase } = cursor;
  const demo = attentionViewAt(cursor);
  const ready = phase === "ready";
  const reading = phase === "read";
  const done = reading && step === tokenSteps.length;
  const actionLabel = ready ? "写入本轮历史" : reading ? done ? "已读完 8 个位置" : "处理下一个位置" : "用 Q 读取结果";
  const currentZ = "当前 z" + demo.savedCount + " = " + vector(demo.visibleNormalizer);
  const currentZVariants = ["当前 z" + (step - 1) + " = " + vector(demo.previousNormalizer), "当前 z" + step + " = " + vector(demo.normalizer)];
  function changeByUser(next: DemoCursor) {
    setCursor(next);
    if (next.step !== step) onPositionChange?.(next.step);
  }
  return <div className={"kv-linear-demo is-" + phase} data-position={step} data-phase={phase}>
    <div className="kv-linear-toolbar">
      <div className="kv-linear-toolbar-top">
        <strong><KvSnapshotText text={snapshotName(cursor)} variants={snapshotVariants} /></strong>
        <button className="kv-linear-advance" type="button" aria-controls="kv-linear-current-snapshot" onClick={() => changeByUser(advanceAttentionDemo(cursor))} disabled={done}>{actionLabel}</button>
      </div>
      <p className="kv-linear-feedback" aria-live="polite" aria-atomic="true"><KvSnapshotText text={feedbackFor(cursor)} variants={feedbackVariants} /></p>
    </div>
    <div id="kv-linear-current-snapshot">
      <p className="kv-linear-current-input"><KvSnapshotText text={currentInputFor(cursor)} variants={allCursors.map(currentInputFor)} /></p>
      <div className="kv-linear-action-pair">
        <figure className="kv-linear-panel is-full-attention">
          <figcaption><span>全注意力（softmax）</span><strong><KvSnapshotText text={fullActionFor(cursor)} variants={allCursors.map(fullActionFor)} /></strong></figcaption>
          <div className={"kv-linear-history" + (reading ? " is-reading" : "")} role="group" aria-label="本层已有的逐位置 KV">
            {tokenSteps.slice(0, demo.savedCount).map(position => <div key={position} className={"kv-linear-kv is-written" + (phase === "write" && position === step ? " is-new" : "")}>
              <span>K{position}/V{position}</span><span>{phase === "write" && position === step ? "新增" : "保留"}</span>
            </div>)}
            {demo.savedCount === 0 && <p className="kv-linear-empty">尚无历史 KV。</p>}
          </div>
          <div className="kv-linear-measure"><strong>{demo.savedCount} 个 KV 位置</strong><span><KvSnapshotText text={fullMeasureFor(cursor)} variants={allCursors.map(fullMeasureFor)} /></span></div>
        </figure>
        <figure className="kv-linear-panel is-recurrent">
          <figcaption><span>基础线性注意力</span><strong><KvSnapshotText text={stateActionFor(cursor)} variants={allCursors.map(stateActionFor)} /></strong></figcaption>
          <div className="kv-linear-state-visual">
            <span className="kv-linear-state-action"><KvSnapshotText text={stateOperationFor(cursor)} variants={allCursors.map(stateOperationFor)} /></span>
            <div className="kv-linear-state-shape" role="img" aria-label={"S" + demo.savedCount + " 为 2 乘 2，z" + demo.savedCount + " 为 2 维的状态示意"}>
              <div><strong>S{demo.savedCount}</strong><div className="kv-linear-state-cells" aria-hidden="true">{demo.visibleState.flat().map((_, index) => <span key={index} />)}</div></div>
              <div><strong>z{demo.savedCount}</strong><div className="kv-linear-z-cells" aria-hidden="true">{demo.visibleNormalizer.map((_, index) => <span key={index} />)}</div></div>
            </div>
          </div>
          <div className="kv-linear-measure"><strong>S：2 × 2；z：2 维</strong><span><KvSnapshotText text={stateMeasureFor(cursor)} variants={allCursors.map(stateMeasureFor)} /></span></div>
        </figure>
      </div>
      <div className="kv-linear-output-pair" aria-label="本轮两种方法的输出向量">
        <div><span>全注意力（softmax）· y{step}</span><strong>{demo.output ? "≈ " + vector(demo.output.full, 3) : "等待读取"}</strong></div>
        <div><span>基础线性注意力（φ(x) = x）· y{step}</span><strong>{demo.output ? "≈ " + vector(demo.output.linear, 3) : "等待读取"}</strong></div>
      </div>
      <p className="kv-linear-method-note">两种方法的权重规则不同，输出不保证相同。y 是本层向量；还需后续模型计算、输出头与采样，才能得到下一个 token。</p>
    </div>
    <div className="kv-linear-secondary-actions">
      <button type="button" aria-controls="kv-linear-current-snapshot" disabled={step === 1 && ready} onClick={() => changeByUser(rewindAttentionDemo(cursor))}>上一步</button>
      <button type="button" aria-controls="kv-linear-current-snapshot" onClick={() => setCursor(replayAttentionDemo(cursor))}>重播第 {step} 位置</button>
      <div className="kv-linear-position"><label htmlFor="kv-linear-position">回看教学快照</label><div className="kv-memory-select"><select id="kv-linear-position" aria-controls="kv-linear-current-snapshot" value={step} onChange={event => changeByUser(replayAttentionDemo({ step: Number(event.target.value) }))}>{tokenSteps.map(position => <option key={position} value={position}>位置 {position} · 写入前</option>)}</select><ChevronDown size={18} aria-hidden="true" /></div></div>
    </div>
    <p className="kv-linear-snapshot-note">重播回到当前选中位置的写入前；回看和上一步切换演示快照，不表示真实运行撤销缓存。默认位置 4 的旧状态已包含前 3 个位置。</p>
    <details className="kv-linear-depth">
      <summary>深入一步：把这一轮算出来</summary>
      <div className="kv-linear-input-values"><strong>第 {step} 个位置 · {phaseName(phase)}</strong><span>Q{step} = {vector(demo.current.q)}</span><span>K{step} = {vector(demo.current.k)}</span><span>V{step} = {vector(demo.current.v)}</span></div>
      <p>Q / K / V 是本轮给定的教学数值。先核对写入，再读取输出；待应用的增量不是当前状态。</p>
      <div className="kv-linear-update-comparison" aria-label="写入前、写入量和当前状态">
        <div><StateMatrix label={"S" + (step - 1) + " · 写入前"} values={demo.previous} /><p>旧 z{step - 1} = {vector(demo.previousNormalizer)}</p></div>
        <div><StateMatrix label={"ΔS · " + (ready ? "待应用" : "已应用")} values={demo.update} /><p>本轮 K = {vector(demo.current.k)} · {ready ? "待应用" : "已应用"}</p></div>
        <div className="kv-linear-current-numbers"><StateMatrix label={"S" + demo.savedCount + " · 当前"} values={demo.visibleState} changed={phase === "write" ? demo.update : undefined} /><p><KvSnapshotText text={currentZ} variants={currentZVariants} /></p></div>
      </div>
      <p className="kv-linear-update-note"><KvSnapshotText text={ready ? pendingUpdate : appliedUpdate} variants={[pendingUpdate, appliedUpdate]} /></p>
      <div className="kv-linear-numeric-pair">
        <div className="kv-linear-panel is-full-attention"><h4>全注意力（softmax）</h4>
          <p><KvSnapshotText text={reading ? "softmax(QKᵀ / √2) 得到权重，再按权重汇总 V；权重列在下表。" : "本轮尚未读取，权重与输出还未计算。"} variants={["softmax(QKᵀ / √2) 得到权重，再按权重汇总 V；权重列在下表。", "本轮尚未读取，权重与输出还未计算。"]} /></p>
          <div className="kv-linear-output"><span>全注意力输出 y{step}</span><strong>{demo.output ? "≈ " + vector(demo.output.full, 3) : "等待读取"}</strong></div>
        </div>
        <div className="kv-linear-panel is-recurrent"><h4>基础线性注意力</h4>
          <p><KvSnapshotText text={reading ? linearReadFor(step) : waitingRead} variants={linearReadVariants} /></p>
          <div className="kv-linear-output"><span>基础线性注意力输出 y{step}</span><strong>{demo.output ? "≈ " + vector(demo.output.linear, 3) : "等待读取"}</strong></div>
        </div>
      </div>
      <p className="kv-linear-cost">固定头数和维度、单层单请求的注意力部分：带缓存生成时，全注意力单步读取量随历史长度增长；本例固定形状状态的单步更新与读取量不随历史长度增长。实际速度取决于状态维度、硬件与实现，短上下文不保证更快。</p>
      <p>完整长度 T 的序列中，全注意力的注意力运算量随 T² 增长，本例递推运算量随 T 增长；这不是整模型耗时或实测加速倍数，也不要求全注意力显式存下 T × T 矩阵。</p>
      <div className="kv-linear-input-history" tabIndex={0} role="region" aria-label="历史 KV 数值表，可横向滚动">
        <table><caption>位置 {step} · 当前保留的 KV 与本轮权重</caption><thead><tr><th scope="col">位置</th><th scope="col">K</th><th scope="col">V</th><th scope="col">权重</th></tr></thead><tbody>
          {demo.history.slice(0, demo.savedCount).map(({ k, v }, index) => <tr key={index}><th scope="row">{index + 1}</th><td>{vector(k)}</td><td>{vector(v)}</td><td>{reading ? (demo.fullWeights[index] * 100).toFixed(1) + "%" : "未读取"}</td></tr>)}
        </tbody></table>
        {demo.savedCount === 0 && <p>尚无历史 KV。</p>}
      </div>
    </details>
    <p className="kv-linear-caption">另设的二维教学数值：Q / K 为正数，φ(x) = x。色块区分两种方法，面积不代表字节数；精确矩阵在展开层。两种方法共享输入仅为比较计算形式，不代表真实模型激活，也不是 Qwen3.5 的规则。</p>
  </div>;
}

export default function KvLinearAttention({ initialStep = firstDecodePosition, resetToken, onPositionChange, onSelectHybrid }: KvLinearAttentionProps) {
  const hybrid = kvMemoryModels.find(model => model.id === "qwen3.5-35b-a3b")!;
  return <section id="kv-basics-linear-attention" className="kv-linear-section" tabIndex={-1}>
    <h3>历史一定要逐个位置保存吗？</h3>
    <p>沿用生成图的位置编号，另设一组二维教学数值，比较单层、单请求的两种规则。默认从位置 4 写入前开始，前 3 个位置已计入旧状态；每轮先更新历史，再用 Q 读取。</p>
    <HistoryComparison initialStep={initialStep} resetToken={resetToken} onPositionChange={onPositionChange} />
    <div className="kv-linear-explanation">
      <div><h4>先区分保存、更新和读取</h4><p>全注意力逐位置保留历史；基础线性注意力将 K / V 的关联累计到固定形状的 S，并把 K 特征累计到归一化向量 z。写入改变内容，读取产生本轮输出。本例的 S / z 不是 Qwen3.5 的更新规则。</p></div>
      <div><h4>固定状态有哪些取舍？</h4><p>本例不逐位置保留原始 KV，仅凭 S / z 不能保证还原任意历史位置的 V。“固定”限定同一模型、单层单请求的持久推理状态；请求变多仍需更多状态。实际状态可能很大，不保证任何历史长度下都更小；训练和分块计算的临时内存另算。</p></div>
    </div>
    <details className="kv-linear-self-check"><summary>可跳过自检：只剩 S / z，能保证找回原始 V1 吗？</summary>
      <p>不能保证。按本例的更新规则，让两个位置的 K 都为 [1, 1]：历史 A 的 V 依次为 [1, 0]、[0, 1]；历史 B 的 V 依次为 [0.5, 0.5]、[0.5, 0.5]。两段历史都得到 S = [[1, 1], [1, 1]]、z = [2, 2]，但 V1 不同；仅凭这个状态无法唯一确定原始 V1。</p>
      <p>这只说明状态不保证可逆，不评价模型质量。在同 K 的这个反例中，softmax 汇总的输出也可以相同。不确定时也可以直接展开核对。</p>
    </details>
    <details className="kv-linear-formula">
      <summary>展开看：最基础的线性注意力怎样递推</summary>
      <p>一种基础做法用 φ 将 Q、K 变为固定维度的特征，令相似度为 φ(q)ᵀφ(k)。采用产生正相似度的特征映射、归一化分母非零时，可先汇总历史，再由查询读取。初始 S 和 z 为零，每步更新：</p>
      <div className="kv-linear-equations"><code>Sₜ = Sₜ₋₁ + φ(kₜ) vₜᵀ</code><code>zₜ = zₜ₋₁ + φ(kₜ)</code><code>yₜ = [φ(qₜ)ᵀ Sₜ] / [φ(qₜ)ᵀ zₜ]</code></div>
      <p>S 保存键特征与值的累积关联，z 用于归一化，y 是本步输出。特征维度不必等于原始 K 的维度；S 的大小包含特征维度与 V 维度的乘积。本例人为选择二维正数及恒等映射，读取使用已纳入当前位置的状态；这个数学顺序不规定物理写入时机。</p>
      <p>这是一类基础线性注意力的规则，权重定义与 softmax 不同；下方混合模型使用它自身的递推规则，不能把这里的 S / z 直接套用过去。</p>
    </details>
    <div className="kv-linear-hybrid">
      <div className="kv-linear-hybrid-heading"><div><span className="kv-direction">连接到模型与容量</span><h4>Qwen3.5-35B-A3B 怎样结合两种结构？</h4></div><span>30 层线性 + 10 层全注意力</span></div>
      <p className="kv-linear-layer-axis">下图沿模型的<strong>层编号</strong>排列，是层轴。每个输入位置的表示都经过这些层；不是每 4 个 token 切换一次结构。</p>
      <ol className="kv-linear-layer-group" aria-label="第一组注意力层的层编号，整组排列重复十次">
        {[1, 2, 3].map(layer => <li key={layer}><small>第 {layer} 层</small><strong>线性注意力</strong><span>Gated DeltaNet</span><small>更新递推状态</small></li>)}
        <li className="is-full"><small>第 4 层</small><strong>全注意力</strong><span>Gated Attention</span><small>保留逐位置 KV</small></li>
      </ol>
      <p className="kv-linear-repeat">这种层类型排列重复 10 组，共 40 层 · 图中只画注意力部分，省略 MoE 等模块。</p>
      <p>Gated DeltaNet 有自己的门控递推与状态更新规则。上方的基础 S / z 示例用于说明固定形状状态的思路，不能代表该模型的状态组成或完整计算。</p>
      <p>按所列固定版本配置，该模型每三个线性注意力层之后接一个全注意力层。持久状态包括这两类：容量图选择 Qwen3.5-35B-A3B 时，只计算其中 <strong>{hybrid.fullAttentionLayers} 层全注意力的 KV</strong>；另有 {hybrid.linearAttentionLayers} 层的递推状态和其他开销需要单独计入。全注意力部分仍使混合模型的缓存随上下文增长。</p>
      <KvGuideLink className="kv-linear-memory-link" part="kv-basics-memory" targetState={{ modelId: "qwen3.5-35b-a3b" }} onNavigate={onSelectHybrid}>查看这个模型的容量估算</KvGuideLink><p className="kv-linear-repeat">将显式选择 Qwen3.5-35B-A3B，保留你当前的已缓存长度和请求数。</p>
    </div>
    <KvGuideChapterEnd part="kv-basics-questions" label="继续：选择研究问题">改变历史保存方式属于模型结构选择；已有 KV 的精度、分配、复用与搬运则是其他研究对象。</KvGuideChapterEnd>
    <details className="kv-linear-sources"><summary>本节资料与模型配置</summary><div>
      <a href="https://proceedings.mlr.press/v119/katharopoulos20a.html" target="_blank" rel="noreferrer">Linear Transformers · 基础递推</a>
      <a href="https://arxiv.org/html/2412.06464v1" target="_blank" rel="noreferrer">Gated DeltaNet · 原文</a>
      <a href="https://huggingface.co/Qwen/Qwen3.5-35B-A3B" target="_blank" rel="noreferrer">Qwen3.5 官方模型卡</a>
      <a href={hybrid.source} target="_blank" rel="noreferrer">35B-A3B 固定版本配置</a>
    </div></details>
  </section>;
}
