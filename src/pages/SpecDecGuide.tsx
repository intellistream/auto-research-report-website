import { useState } from "react";
import { Link } from "react-router-dom";
import type { Topic } from "./TopicPages";
import { academicPaperHrefs } from "./academic-paper";
import { candidates, roundExample, estimateRound } from "./specdec-mechanism";
import "./specdec.css";
import "./specdec-mechanism.css";

const official = [
  { name: "经典推测采样论文", url: "https://proceedings.mlr.press/v202/leviathan23a.html" },
  { name: "vLLM · Speculative Decoding", url: "https://docs.vllm.ai/en/latest/features/spec_decode/" },
  { name: "vLLM · V1 草稿与验证源码", url: "https://github.com/vllm-project/vllm/tree/main/vllm/v1/spec_decode" },
  { name: "vLLM Ascend · Speculative Decoding", url: "https://github.com/vllm-project/vllm-ascend/blob/main/docs/source/user_guide/feature_guide/speculative_decoding.md" },
  { name: "SGLang · Adaptive Speculative Decoding", url: "https://github.com/sgl-project/sglang/blob/main/docs/docs/advanced_features/adaptive_speculative_decoding.mdx" },
  { name: "DFlash · 论文、模型与实现", url: "https://github.com/z-lab/dflash" },
  { name: "vLLM · Speculators 草稿训练", url: "https://github.com/vllm-project/speculators" },
] as const;

const directions = [
  { title: "草稿生成优化", question: "如何更快地生成更可靠的候选？", text: "对齐训练、并行草稿、自推测与检索分别改变候选质量、计算依赖或信息来源。", methods: "EAGLE-3 · DFlash · DSpark · LayerSkip · REST", chapter: 3 },
  { title: "验证优化", question: "哪些候选值得验证，如何确定输出？", text: "共享前缀计算、选择验证预算、改变接受与修正规则；随机验证仍受采样分布约束。", methods: "SpecInfer · EVICT · HybridSpec · Block Verification", chapter: 4 },
  { title: "状态与内存管理", question: "拒绝候选后，怎样正确而高效地继续？", text: "维护有效 KV 与递推状态，减少中间快照及草稿历史的存储和访问。", methods: "ReplaySSM · Twig · MagicDec · Windowed-MTP", chapter: 5 },
  { title: "系统级优化", question: "负载变化时，怎样分配和组织推测计算？", text: "动态长度、共享预算、流水重叠与解耦部署，需要结合实际后端和服务目标。", methods: "SpecDec++ · DSpark · ForeSpark · SmartSpec", chapter: 6 },
] as const;

function RoundDemo() {
  const [accepted, setAccepted] = useState(1);
  const round = roundExample(accepted);
  const stateLabels = { accepted: "接受", rejected: "首次拒绝", discarded: "后缀丢弃" };
  const retained = ["x", ...round.retained].join(" ");
  return <section className="specdec-mech-round" aria-labelledby="specdec-round-heading">
    <h2 id="specdec-round-heading">一次 Target 前向，能确认几个 token？</h2>
    <p>普通解码确定一个 token 后，才能构造下一次目标模型输入。推测解码先生成候选，再利用一次目标前向计算多个候选前缀下的条件分布。以已计算前缀 x 和三个草稿 token 为例。</p>
    <div className="specdec-mech-control">
      <span id="specdec-accept-label">本轮接受的草稿数</span>
      <div role="group" aria-labelledby="specdec-accept-label">
        {[0, 1, 2, 3].map(n => <button key={n} type="button" aria-pressed={accepted === n} onClick={() => setAccepted(n)}>{n === 3 ? "全部接受" : n + " 个"}</button>)}
      </div>
    </div>
    <div className="specdec-mech-round-content" aria-live="polite" aria-atomic="true">
      <div className="specdec-mech-lane">
        <h3>普通解码 <small>Autoregressive</small></h3>
        <div className="specdec-mech-chain">{round.output.map((token, i) => <div className="specdec-mech-unit" key={i}><small>Target {i + 1}</small><strong>{token}</strong></div>)}</div>
        <p>生成同样数量的有效 token，需要 {round.targetCallsAR} 次串行 Target 前向。</p>
      </div>
      <div className="specdec-mech-lane specdec-mech-lane-active">
        <h3>推测解码 <small>Draft → Verify → Commit</small></h3>
        <div className="specdec-mech-stage"><span>草稿生成</span><div className="specdec-mech-tokens"><b className="specdec-mech-prefix">x</b>{candidates.map(token => <b key={token}>{token}</b>)}</div></div>
        <div className="specdec-mech-stage"><span>一次 Target 验证</span><div className="specdec-mech-tokens">{[1,2,3,4].map(i => <b key={i}>p<sub>{i}</sub></b>)}</div></div>
        <div className="specdec-mech-stage"><span>按顺序接受</span><div className="specdec-mech-decisions">{candidates.map((token,i) => <div key={token} data-status={round.status[i]}><b>{token}</b><small>{stateLabels[round.status[i] as keyof typeof stateLabels]}</small></div>)}</div></div>
        <div className="specdec-mech-stage"><span>实际输出</span><div className="specdec-mech-tokens">{round.retained.map(token => <b className="specdec-mech-accepted" key={token}>{token}</b>)}<b className="specdec-mech-pending">{round.pending}</b><small>{round.allAccepted ? "额外 token" : "修正 token"}</small></div></div>
      </div>
      <div className="specdec-mech-result"><strong>{round.output.length} 个输出 token</strong><span>接受 {accepted} 个草稿 + 1 个{round.allAccepted ? "额外" : "修正"} token</span><span>Target 调用：{round.targetCallsAR} → 1 次</span></div>
      <div className="specdec-mech-state">
        <div><h3>注意力 KV</h3><p>保留前缀 <code>{retained}</code> 的 KV；{round.allAccepted ? "没有被拒绝的草稿条目。" : "使未接受路径上的 KV 条目失效。"}</p></div>
        <div><h3>递推状态</h3><p>{round.allAccepted ? <>保留候选末端状态 <code>s<sub>3</sub></code>。</> : <>恢复或保留 <code>s<sub>{accepted}</sub></code>；候选末端的 <code>s<sub>3</sub></code> 不再有效。</>}</p></div>
      </div>
      <p className="specdec-mech-note">本示例中 {round.pending} 已输出，但对应的目标状态留待下一轮计算。输出序列为 <code>x {round.output.join(" ")}</code>，有效已计算前缀为 <code>{retained}</code>。</p>
    </div>
    <p className="specdec-mech-note">示意：固定三枚草稿、未遇到 EOS 或长度限制，选择一个可能的接受结果。p₁ 至 p₄ 对应 x、xa、xab、xabc 下的目标分布；候选后缀虽然已评分，首次拒绝后不再用于接受。本图比较调用次数，不代表实测加速比。</p>
    <details><summary>贪心验证与随机采样有什么区别？</summary><p>贪心验证要求候选与目标模型的确定性选择一致。标准随机推测采样对从实际提议分布 q 采样的候选 v，以 min(1, p(v)/q(v)) 的概率接受；拒绝后从归一化的正残差 [p−q]₊ 采样修正 token。两者分别保证相同贪心规则下的输出序列与参考采样分布；随机采样不要求两次独立运行得到相同文本。</p></details>
  </section>;
}

function DraftStructures() {
  return <section className="specdec-mech-section" aria-labelledby="specdec-structure-heading">
    <h2 id="specdec-structure-heading">草稿如何生成，候选如何组织？</h2>
    <p>草稿来源和计算依赖是不同维度。检索可以复用文本，自推测可以复用目标模型的一部分计算；神经草稿还可以改变预测位置之间的依赖。</p>
    <div className="specdec-mech-structures">
      <figure><figcaption><strong>自回归草稿</strong><span>每步使用前序预测</span></figcaption><div className="specdec-mech-chain">{candidates.map((v,i) => <div key={v} className="specdec-mech-unit"><small>前向 {i+1}</small><strong>{v}</strong></div>)}</div><p>传统小模型草稿、EAGLE 类逐步预测。</p></figure>
      <figure><figcaption><strong>并行块草稿</strong><span>共享一次草稿主干前向</span></figcaption><div className="specdec-mech-backbone">并行主干</div><div className="specdec-mech-branches">{candidates.map(v => <b key={v}>{v}</b>)}</div><p>DFlash 等在同一块内并行预测多个位置。</p></figure>
      <figure><figcaption><strong>半自回归草稿</strong><span>并行主干 + 轻量顺序精化</span></figcaption><div className="specdec-mech-backbone">并行主干</div><div className="specdec-mech-chain specdec-mech-refine">{candidates.map(v => <div key={v} className="specdec-mech-unit"><small>精化</small><strong>{v}</strong></div>)}</div><p>DSpark、Domino 利用前序实际候选改善后续预测。</p></figure>
    </div>
    <div className="specdec-mech-tree">
      <div><h3>链式候选</h3><svg viewBox="0 0 240 82" role="img" aria-label="x 到 a 到 b 到 c，三个候选位置"><path d="M24 40H216" className="specdec-tree-edge"/>{["x","a","b","c"].map((v,i) => <g key={v} transform={"translate("+(24+i*64)+" 40)"}><circle r="14" className={i===0?"specdec-tree-root":"specdec-tree-node"}/><text dy="5">{v}</text></g>)}</svg><p>3 个候选位置，每个深度一条路径。</p></div>
      <div><h3>树形候选</h3><svg viewBox="0 0 240 82" role="img" aria-label="a 为共享前缀，其后有 b c 与 d e 两条路径"><path d="M24 40H88L152 18H216M88 40L152 64H216" className="specdec-tree-edge"/>{[["x",24,40],["a",88,40],["b",152,18],["c",216,18],["d",152,64],["e",216,64]].map(([v,x,y]) => <g key={v} transform={"translate("+x+" "+y+")"}><circle r="14" className={v==="x"?"specdec-tree-root":"specdec-tree-node"}/><text dy="5">{v}</text></g>)}</svg><p>5 个不同候选节点，共享 a，扩大备选覆盖。</p></div>
    </div>
    <p>树形验证使用路径可见性约束共享前缀，不能让不同分支互相读取状态。更多节点可能提高接受长度，也可能增加实际验证工作；并行块草稿本身不等于树形验证。</p>
  </section>;
}

function CostDemo() {
  const [k,setK] = useState(3);
  const [alpha,setAlpha] = useState(.8);
  const [extra,setExtra] = useState(.15);
  const cost = estimateRound(k,alpha,extra);
  const barMax = Math.max(cost.expectedOutput,cost.roundTime);
  return <section className="specdec-mech-section" aria-labelledby="specdec-cost-heading">
    <h2 id="specdec-cost-heading">接受更多，就一定更快吗？</h2>
    <p>加速取决于每轮有效输出与总耗时的比值。调节草稿长度、条件接受概率和额外验证成本，比较同等期望生成进度所需的时间。</p>
    <div className="specdec-mech-cost">
      <div className="specdec-mech-sliders">
        <label htmlFor="specdec-k">草稿长度 K <output htmlFor="specdec-k">{k}</output></label>
        <input id="specdec-k" type="range" min="1" max="8" step="1" value={k} onChange={e=>setK(Number(e.target.value))}/>
        <label htmlFor="specdec-alpha">条件接受概率 α <output htmlFor="specdec-alpha">{Math.round(alpha*100)}%</output></label>
        <input id="specdec-alpha" type="range" min="0" max="1" step=".05" value={alpha} onChange={e=>setAlpha(Number(e.target.value))}/>
        <label htmlFor="specdec-verify-cost">每个新增验证位置的成本 <output htmlFor="specdec-verify-cost">{extra.toFixed(2)}</output></label>
        <input id="specdec-verify-cost" type="range" min="0" max=".8" step=".05" value={extra} onChange={e=>setExtra(Number(e.target.value))}/>
        <div className="specdec-mech-presets"><button type="button" onClick={()=>setExtra(.1)}>验证成本较低</button><button type="button" onClick={()=>setExtra(.65)}>验证成本较高</button></div>
      </div>
      <div className="specdec-mech-cost-result" aria-live="polite" aria-atomic="true">
        <span>理论局部解码速率比</span><strong>{cost.speedup.toFixed(2)}×</strong><span>{cost.speedup > 1.000001 ? "此配置获得加速" : cost.speedup < .999999 ? "普通解码更有利" : "两者速率相当"}</span>
        <p>期望输出 {cost.expectedOutput.toFixed(2)} token / 轮</p>
        <div className="specdec-mech-bar-label"><span>普通解码</span><b>{cost.expectedOutput.toFixed(2)}</b></div><div className="specdec-mech-bar"><span className="specdec-mech-ar-bar" style={{width:cost.expectedOutput/barMax*100+"%"}}/></div>
        <div className="specdec-mech-bar-label"><span>推测解码</span><b>{cost.roundTime.toFixed(2)}</b></div><div className="specdec-mech-bar" aria-label="草稿、验证、其他开销">{([["draft",cost.draft],["verify",cost.verify],["other",cost.other]] as const).map(([name,value]) => <span key={name} data-cost={name} style={{width:value/barMax*100+"%"}}/>)}</div>
        <div className="specdec-mech-legend"><span data-cost="draft">草稿 {cost.draft.toFixed(2)}</span><span data-cost="verify">验证 {cost.verify.toFixed(2)}</span><span data-cost="other">其他 {cost.other.toFixed(2)}</span></div>
      </div>
    </div>
    <p className="specdec-mech-note">理论示意，非 GPU/NPU 实测。普通解码单 token 耗时为 1，固定每个草稿成本 0.10，其他轮次成本 0.08。各阶段按串行相加；条件接受概率视为常数，不考虑 EOS、排队及重叠。</p>
    <details><summary>计算关系与适用条件</summary><p>期望输出 E[L] = 1 + α + α² + … + αᴷ；轮次耗时 T = 0.10K + (1 + δK) + 0.08，其中 δ 为新增验证位置成本。速率比 S = E[L] / T。α 是此前候选均被接受条件下的接受概率，不要求实际事件独立。真实验证成本与批大小、上下文、专家路由及内核布局有关，不能由此直接推算 Serving 吞吐量。</p></details>
  </section>;
}

export default function SpecDecGuide({ topic }: { topic: Topic }) {
  const hrefs = topic.academicPaper && academicPaperHrefs(topic.id, topic.academicPaper);
  return <article className="specdec-guide specdec-mechanism">
    <RoundDemo/>
    <DraftStructures/>
    <CostDemo/>
    <section className="specdec-mech-section" aria-labelledby="specdec-research-heading">
      <h2 id="specdec-research-heading">从零开始，如何阅读本专题？</h2>
      <p>上面的执行过程引出四类优化问题。每类方法改变不同的计算、状态或调度环节；同一系统可能同时包含多个机制。</p>
      <div className="specdec-mech-directions">{directions.map(item=><article key={item.chapter}><h3>{item.title}</h3><strong>{item.question}</strong><p>{item.text}</p><p className="specdec-mech-methods">{item.methods}</p>{hrefs ? <a href={hrefs.html+"#section-"+item.chapter} target="_blank" rel="noreferrer">阅读综述第 {item.chapter} 章 ↗</a> : <Link to={{search:"view=paper"}}>阅读综述 →</Link>}</article>)}</div>
      <div className="specdec-mech-reading"><Link to={{search:"view=paper"}}>阅读学术综述全文 →</Link><Link to={{search:"view=report"}}>跟踪动态报告 →</Link></div>
    </section>
    <footer className="specdec-mech-sources"><strong>进一步阅读</strong><p>机制与性能模型依据本站综述第 2–6 章，交互数值为教学示意。实现支持以所用框架、模型及后端版本为准。</p>{official.map(item=><a key={item.url} href={item.url} target="_blank" rel="noreferrer">{item.name} ↗</a>)}</footer>
  </article>;
}
