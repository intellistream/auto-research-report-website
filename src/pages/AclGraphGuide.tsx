import { useState, type ReactNode } from "react";
import {
  ArrowRight, Box, Check, Clapperboard, Cpu, Factory, GitBranch,
  Layers3, ListOrdered, MapPin, Play, Repeat2, Timer,
} from "lucide-react";
import { Link } from "react-router-dom";
import "./aclgraph-guide.css";

const readingSteps = ["为什么会等", "什么是图重放", "收益与边界", "走向真实系统"];

function jumpToStep(stepNumber: number) {
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  document.getElementById(`acl-step-${stepNumber}`)?.scrollIntoView({
    behavior: reduced ? "auto" : "smooth", block: "start",
  });
}

function StepHeading({ number, label, title }: { number: string; label: string; title: string }) {
  return (
    <header className="acl-step-heading">
      <span className="acl-step-number" aria-hidden="true">{number}</span>
      <div>
        <p className="acl-step-eyebrow">第 {Number(number)} 步 · {label}</p>
        <h2 id={`acl-step-${Number(number)}-title`}>{title}</h2>
      </div>
    </header>
  );
}

function TimeBlock({ start, end, label, waiting = false, children }: {
  start: number; end: number; label: string; waiting?: boolean; children?: ReactNode;
}) {
  return (
    <span className={`acl-time-block${waiting ? " acl-time-wait" : ""}`}
      style={{ gridColumn: `${start + 1} / ${end + 1}` }} aria-label={label} title={label}>
      {children ?? label}
    </span>
  );
}

function PhaseExplorer() {
  const [phase, setPhase] = useState<"prefill" | "decode">("decode");
  const decode = phase === "decode";
  return (
    <div className="acl-phase-explorer">
      <div className="acl-interaction-heading">
        <div><p className="acl-mini-label">换个推理阶段，看看谁在等谁</p><h3>同一台 NPU，忙碌程度大不同</h3></div>
        <span className="acl-interaction-hint"><Repeat2 size={14} aria-hidden="true" /> 点一下切换</span>
      </div>
      <div className="acl-guide-toggle" role="group" aria-label="选择推理阶段">
        <button type="button" aria-pressed={!decode} aria-controls="acl-phase-result" onClick={() => setPhase("prefill")}>Prefill<span>（首字读题）</span></button>
        <button type="button" aria-pressed={decode} aria-controls="acl-phase-result" onClick={() => setPhase("decode")}>Decode<span>（逐字吐词）</span></button>
      </div>
      <div className="acl-phase-result" id="acl-phase-result" data-phase={phase}>
        <div className="acl-phase-copy" aria-live="polite" aria-atomic="true">
          <span className={`acl-bottleneck${decode ? " acl-bottleneck-warn" : ""}`}>{decode ? "CPU 下发瓶颈（Launch-bound）" : "计算瓶颈（Compute-bound）"}</span>
          <h4>{decode ? "像一边想，一边逐字抄写答案" : "像一次摊开整张试卷精读"}</h4>
          <p>{decode
            ? "一次常规 Decode 中，每条请求通常只生成 1 个新词，却仍要串行经过上百个算子。小批次时，矩阵很薄，有些小算子几微秒就算完了。"
            : "Prefill 一次读入成百上千个词，矩阵更大，单个大算子可能算上毫秒级。NPU 算当前任务时，CPU 已把后面的任务排好了。"}</p>
          <p className="acl-phase-takeaway">{decode
            ? <>NPU 算完了，下条任务还没到：橙色空泡就是<strong>算力闲置在「等派活」上</strong>。</>
            : <>CPU 下发耗时被<strong>藏在计算时间背后</strong>，队列不断粮，NPU 就能连着算。</>}</p>
        </div>
        <figure className="acl-phase-lanes" key={phase} aria-label={decode ? "短算子示意：CPU 连续下发，NPU 在算子之间等待" : "长算子示意：CPU 提前排好任务，NPU 连续计算"}>
          <figcaption>示意流水 · 同一时间轴 <ArrowRight size={14} aria-hidden="true" /></figcaption>
          <div className="acl-execution-row">
            <span className="acl-device-label">CPU<small>派活</small></span>
            <div className="acl-time-track acl-phase-track acl-host-track">
              <TimeBlock start={0} end={4} label="派活 1" />
              <TimeBlock start={4} end={decode ? 10 : 8} label="派活 2" />
              <TimeBlock start={decode ? 10 : 8} end={decode ? 16 : 12} label="派活 3" />
            </div>
          </div>
          <div className="acl-execution-row">
            <span className="acl-device-label">NPU<small>计算</small></span>
            <div className="acl-time-track acl-phase-track acl-device-track">
              <TimeBlock start={4} end={decode ? 6 : 9} label="算1" />
              {decode && <TimeBlock start={6} end={10} label="等待 CPU 下发任务 2" waiting>等派活</TimeBlock>}
              <TimeBlock start={decode ? 10 : 9} end={decode ? 12 : 14} label="算2" />
              {decode && <TimeBlock start={12} end={16} label="等待 CPU 下发任务 3" waiting>等派活</TimeBlock>}
              <TimeBlock start={decode ? 16 : 14} end={decode ? 18 : 19} label="算3" />
            </div>
          </div>
          <p className="acl-lane-legend"><span className="acl-legend-compute" /> 算子计算 <span className="acl-legend-wait" /> 等派活的空泡</p>
        </figure>
      </div>
      <p className="acl-guide-note">这里的「词」指 token，即模型切出的文本片段，不一定等于一个汉字或完整单词。图中是典型情景：Decode 也可能受显存带宽或计算等因素限制，并非一定慢在下发。</p>
    </div>
  );
}

function CapturePreparation() {
  return (
    <figure className="acl-capture-context" aria-labelledby="acl-capture-caption">
      <figcaption id="acl-capture-caption"><Clapperboard size={18} aria-hidden="true" /> 先录一遍流程，再换数据反复用</figcaption>
      <div className="acl-capture-lifecycle">
        <div className="acl-capture-phase">
          <h3><span>01</span> 首次准备 · 图捕获 <small>Capture</small></h3>
          <div className="acl-captured-graph">
            <div className="acl-captured-graph-title"><strong>图 G</strong><span><Check size={14} aria-hidden="true" /> 已录制</span></div>
            <div className="acl-captured-operators">
              <span><strong>加法</strong><code>s = a + b</code></span>
              <span className="acl-dependency-arrow"><small>结果 s</small><ArrowRight size={22} aria-hidden="true" /></span>
              <span><strong>乘法</strong><code>y = s × c</code></span>
            </div>
            <p>记录顺序与依赖：乘法要用加法的结果 s。</p>
          </div>
          <p className="acl-guide-note">这里只画两个算子；真实模型中可一次捕获数百个连续算子。录下的是流程，不是某一轮的答案。</p>
        </div>
        <ArrowRight className="acl-capture-next" size={24} aria-hidden="true" />
        <div className="acl-reuse-phase">
          <h3><span>02</span> 后续推理 · 复用同一张图 G <small>Replay</small></h3>
          <div className="acl-replay-rounds">
            {["第 1 轮", "第 2 轮", "第 N 轮"].map((round) => (
              <div className="acl-replay-round" key={round}>
                <span className="acl-round-number">{round}</span>
                <span>填入新数据<small>固定输入位置</small></span><ArrowRight size={14} aria-hidden="true" />
                <strong>重放图 G<small>CPU 仅发 1 次</small></strong><ArrowRight size={14} aria-hidden="true" /><span>本轮结果</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </figure>
  );
}

function ExecutionDiagram({ replay = false, longOperators }: { replay?: boolean; longOperators: boolean }) {
  // Both paths share one 24-unit scale, the same launch start and identical NPU durations.
  const launchEnd = 4;
  const secondLaunchEnd = 12;
  const duration = longOperators ? 10 : 4;
  const addEnd = launchEnd + duration;
  const multiplyStart = replay ? addEnd : Math.max(addEnd, secondLaunchEnd);
  return (
    <figure className={`acl-execution${replay ? " acl-execution-replay" : ""}`}>
      <figcaption>
        <span className="acl-execution-icon">{replay ? <Play size={16} aria-hidden="true" /> : <ListOrdered size={16} aria-hidden="true" />}</span>
        <div><strong>{replay ? "ACL Graph 重放" : "直接提交"}</strong><small>{replay ? "一次提交，连贯执行" : "逐条下发算子"}</small></div>
        <span className="acl-submit-count">{replay ? "1 次下发" : "2 次下发"}</span>
      </figcaption>
      <div className="acl-execution-row">
        <span className="acl-device-label">CPU<small>提交</small></span>
        <div className="acl-time-track acl-host-track">
          <TimeBlock start={0} end={launchEnd} label={replay ? "启动图 G" : "下发加法"}>{replay ? <>启动<small>图 G</small></> : <>下发<small>加法</small></>}</TimeBlock>
          {!replay && <TimeBlock start={launchEnd} end={secondLaunchEnd} label="下发乘法">下发<small>乘法</small></TimeBlock>}
        </div>
      </div>
      <div className="acl-execution-row">
        <span className="acl-device-label">NPU<small>单流执行</small></span>
        <div className="acl-time-track acl-device-track">
          <TimeBlock start={launchEnd} end={addEnd} label="加法" />
          {addEnd < multiplyStart && <TimeBlock start={addEnd} end={multiplyStart} label="干等 CPU 下发（空泡）" waiting>等下发</TimeBlock>}
          <TimeBlock start={multiplyStart} end={multiplyStart + duration} label="乘法" />
        </div>
      </div>
      <p className="acl-execution-caption">{longOperators
        ? replay ? "同刻结束：省了提交工作，计算仍是主角。" : "乘法已排队，等加法算完就能接着算。"
        : replay ? "两个算子紧紧相连，省下中间等待。" : "加法已经算完，乘法指令还没到。"}</p>
    </figure>
  );
}

function ReplayExperiment() {
  const [longOperators, setLongOperators] = useState(false);
  return (
    <div className="acl-guide-overview">
      <div className="acl-interaction-heading"><div><p className="acl-mini-label">动手看懂 · CPU / NPU 时间线</p><h3>图重放省去了哪部分工作？</h3></div><Timer size={24} aria-hidden="true" /></div>
      <div className="acl-guide-toggle" role="group" aria-label="选择算子耗时">
        <button type="button" aria-pressed={!longOperators} aria-controls="acl-replay-result" onClick={() => setLongOperators(false)}>算子耗时短<span>（典型 Decode）</span></button>
        <button type="button" aria-pressed={longOperators} aria-controls="acl-replay-result" onClick={() => setLongOperators(true)}>算子耗时长<span>（典型 Prefill / 大批次）</span></button>
      </div>
      <p className="acl-timeline-scale">教学示意 · 两图同一刻度，时间向右 <ArrowRight size={14} aria-hidden="true" /><span>块越宽，耗时越长</span></p>
      <div className="acl-execution-grid" id="acl-replay-result"><ExecutionDiagram longOperators={longOperators} /><ExecutionDiagram replay longOperators={longOperators} /></div>
      <div className="acl-experiment-takeaway" aria-live="polite" aria-atomic="true">
        <strong>ACL Graph 并没有让 NPU 单个算子算得更快。</strong>
        <p>{longOperators
          ? "长算子模式：加法还在计算时，CPU 已下发完乘法。下发开销被计算掩盖，两种方式同刻结束，端到端延迟几乎不变；图重放仍能减少 CPU 的提交工作。"
          : "短算子模式：两图的加法、乘法块一样宽！它省掉的是 CPU 逐条下发的重复工作，以及 NPU 干等的橙色空泡。本例中，图内两步可以无缝衔接。"}</p>
      </div>
      <p className="acl-experiment-note">图启动本身仍有开销，输入准备也仍然需要；这里仅演示两个算子的单流顺序，未计入数据复制等其他成本。</p>
      <nav className="acl-source-links" aria-label="时间线的官方参考">
        <a href="https://www.hiascend.com/doc_center/source/zh/canncommercial/900/programug/acldevg/runtime_doc_dev_0011.html" target="_blank" rel="noreferrer">单流顺序 ↗</a>
        <a href="https://www.hiascend.com/doc_center/source/zh/CANNCommunityEdition/910/API/runtimeapi/aclcppdevg_03_1782.html" target="_blank" rel="noreferrer">CANN 图捕获 ↗</a>
        <a href="https://github.com/vllm-project/vllm-ascend/blob/fef7a9886cf1365ae951ff01fb1599802ca5cc6a/vllm_ascend/compilation/acl_graph.py#L255-L297" target="_blank" rel="noreferrer">vLLM Ascend 重放源码 ↗</a>
      </nav>
    </div>
  );
}

function SavingsEstimator() {
  const [tokens, setTokens] = useState(500);
  const [savedMs, setSavedMs] = useState(2);
  // Illustrative steady-state model, not a hardware benchmark. Baseline includes remaining launch work.
  const replayMs = 12;
  const directMs = replayMs + savedMs;
  const computeWidth = (replayMs / directMs) * 100;
  const savedSeconds = (tokens * savedMs) / 1000;
  return (
    <section className="acl-savings" aria-labelledby="acl-savings-title">
      <div className="acl-subsection-heading"><span className="acl-subsection-icon"><Timer size={19} aria-hidden="true" /></span><div><p className="acl-mini-label">收益 · 小节省，反复累加</p><h3 id="acl-savings-title">一次捕获、千次重放，直接拉低 TPOT</h3></div></div>
      <p><strong>TPOT</strong>（Time Per Output Token）就是每吐出一个新词的平均耗时，越小，回答就越流畅。</p>
      <div className="acl-estimator-body">
        <div className="acl-estimator-controls">
          <div className="acl-control-label" id="acl-token-label">这次回答有多长？</div>
          <div className="acl-token-presets" role="group" aria-labelledby="acl-token-label">
            {[{ value: 100, label: "短答" }, { value: 500, label: "常规对话" }, { value: 2000, label: "长推理" }].map(({ value, label }) => <button key={value} type="button" aria-pressed={tokens === value} onClick={() => setTokens(value)}>{value} 词<span>（{label}）</span></button>)}
          </div>
          <div className="acl-slider-heading"><label htmlFor="acl-saved-ms">单步省下的下发与空泡耗时</label><output htmlFor="acl-saved-ms">{savedMs.toFixed(1)} ms</output></div>
          <input id="acl-saved-ms" type="range" min="0.5" max="4" step="0.5" value={savedMs} aria-valuetext={`${savedMs.toFixed(1)} 毫秒`} aria-describedby="acl-estimator-assumption" onChange={(event) => setSavedMs(Number(event.target.value))} />
          <div className="acl-range-limits"><span>0.5 ms</span><span>4.0 ms</span></div>
          <p className="acl-guide-note" id="acl-estimator-assumption">假设重放后，计算与保留的启动等开销共 12.0 ms / 步。把回答长度近似作为 Decode 重放次数，不含排队和首字等待。</p>
        </div>
        <div className="acl-estimator-result" aria-live="polite" aria-atomic="true">
          <span className="acl-estimate-badge">示意估算模型 · 非实测</span>
          <p className="acl-saved-total">本轮回答累计省下<strong>{savedSeconds.toFixed(2)}<span> 秒</span></strong></p>
          <p className="acl-tpot-change">TPOT <span>{directMs.toFixed(1)} ms</span><ArrowRight size={15} aria-hidden="true" /><strong>{replayMs.toFixed(1)} ms</strong></p>
          <span className="acl-estimate-reduction">每词耗时约减少 {((savedMs / directMs) * 100).toFixed(1)}%</span>
        </div>
      </div>
      <figure className="acl-savings-bars" aria-label={`每词耗时示意：无图重放 ${directMs.toFixed(1)} 毫秒，开启 ACL Graph ${replayMs.toFixed(1)} 毫秒`}>
        <div className="acl-savings-bar-row"><span>无图重放<small>逐条下发</small></span><div className="acl-proportional-track"><span className="acl-bar-compute" style={{ width: `${computeWidth}%` }} /><span className="acl-bar-overhead" style={{ width: `${100 - computeWidth}%` }} /></div><strong>{directMs.toFixed(1)} ms</strong></div>
        <div className="acl-savings-bar-row"><span>开启 ACL Graph<small>整图重放</small></span><div className="acl-proportional-track"><span className="acl-bar-compute" style={{ width: `${computeWidth}%` }} /></div><strong>{replayMs.toFixed(1)} ms</strong></div>
        <figcaption><span className="acl-legend-compute" /> 计算与保留开销 <span className="acl-legend-wait" /> 可省的下发与空泡</figcaption>
      </figure>
      <div className="acl-warmup-note"><Clapperboard size={19} aria-hidden="true" /><p><strong>捕获一次，也要花时间。</strong> 假设同一张图准备约 120 ms，在服务预热时完成；重复使用 1,000 次后，平均每次只摊 0.12 ms。上面的累计节省按预热后的回答计算。</p></div>
      <p className="acl-guide-note">* 以上为教学示意模型，帮助你建立「一次捕获、长期摊薄」的数量级直觉，具体加速比随模型规模、批大小与硬件配置变化。</p>
    </section>
  );
}

const constraints = [
  { icon: Box, number: "01", title: "张量形状必须固定", text: "输入矩阵的维度（批大小、序列长度等）一变，录好的算子尺寸就可能对不上。要先补齐到匹配尺寸，或选择另一张图。" },
  { icon: MapPin, number: "02", title: "内存地址必须固定", text: "图记住了从哪块 NPU 显存读数据、往哪块显存写结果。每轮复用固定缓冲区，只换内容；多份图及其缓冲区还可能叠加显存占用。" },
  { icon: GitBranch, number: "03", title: "控制流必须静态", text: "不能中途把结果读回 CPU，再临时做 if / else 决策、改走另一条路线。需要 CPU 实时判断的逻辑，通常要留在图外。" },
];

const attentionSteps = [
  { name: "输入投影", subtitle: "QKV 线性变换", graph: 1 },
  { name: "注意力计算", subtitle: "变长上下文打分", graph: null },
  { name: "输出映射", subtitle: "汇总线性变换", graph: 2 },
] as const;

const forwardModes = {
  NONE: { title: "直接执行", note: "三步全部在图外逐条执行。适合调试算子，或当前形状没有匹配图时兜底。" },
  PIECEWISE: { title: "分段重放", note: "前后规整的线性变换分别重放，注意力留在图外执行。兼顾加速与动态灵活性。" },
  FULL: { title: "整图重放", note: "把图中三步一起打包，CPU 一次下发完成这一层。下发开销最低，短算子的 Decode 通常更受益。" },
} as const;

function ForwardDiagram({ mode }: { mode: keyof typeof forwardModes }) {
  return (
    <figure className="acl-forward-diagram">
      <figcaption><strong>{forwardModes[mode].title}</strong><code>{mode}</code></figcaption>
      <div className={mode === "FULL" ? "acl-forward-whole" : "acl-forward-per-step"}>
        {mode === "FULL" && <span className="acl-forward-action"><Play size={13} aria-hidden="true" /> 重放同一张大图 · CPU 仅下发 1 次</span>}
        <ol className="acl-forward-steps">
          {attentionSteps.map(({ name, subtitle, graph }) => {
            const outside = mode === "NONE" || (mode === "PIECEWISE" && graph === null);
            return <li key={name} className={outside ? "acl-forward-outside" : undefined}>{mode !== "FULL" && <span className="acl-forward-action">{outside ? "图外执行" : `重放图 ${graph}`}</span>}<strong>{name}</strong><small>{subtitle}</small></li>;
          })}
        </ol>
      </div>
      <p>{forwardModes[mode].note}</p>
    </figure>
  );
}

export function AclGraphGuide() {
  return (
    <article className="acl-guide" data-testid="aclgraph-guide">
      <header className="acl-reading-orientation">
        <span className="acl-reading-badge">大一大二零前置导读 · 约 4 分钟读懂核心原理</span>
        <p>先看懂「NPU 为什么会等」，再理解图重放如何省掉等待。你只需要知道：模型的一次前向，由许多小计算（算子）组成。</p>
        <nav className="acl-reading-steps" aria-label="四步导读跳转">
          {readingSteps.map((label, index) => <button key={label} type="button" onClick={() => jumpToStep(index + 1)}><span>0{index + 1}</span>{label}<ArrowRight size={14} aria-hidden="true" /></button>)}
        </nav>
      </header>

      <section className="acl-guide-step" id="acl-step-1" aria-labelledby="acl-step-1-title">
        <StepHeading number="01" label="建立直觉" title="为什么大模型推理会慢在「发指令」？" />
        <div className="acl-dispatch-flow" role="group" aria-label="CPU 到异步任务队列，再到昇腾 NPU 的派活流程">
          <div className="acl-dispatch-node"><span className="acl-node-icon"><Cpu size={23} aria-hidden="true" /></span><p className="acl-node-role">Host · 主机端</p><h3>CPU</h3><strong>派活的包工头</strong><p>执行 Python / C++ 逻辑，逐条把算子打包成指令发出去。</p></div>
          <ArrowRight className="acl-flow-arrow" size={22} aria-hidden="true" />
          <div className="acl-dispatch-node acl-dispatch-queue"><span className="acl-node-icon"><ListOrdered size={23} aria-hidden="true" /></span><p className="acl-node-role">Stream · 执行流</p><h3>异步任务队列</h3><strong>派单传送带</strong><p>CPU 丢进任务就继续准备下一条，NPU 在同一条流里按顺序取活干。</p><div className="acl-queue-parcels" aria-hidden="true"><span>任务 3</span><span>任务 2</span><span>任务 1</span><ArrowRight size={16} /></div></div>
          <ArrowRight className="acl-flow-arrow" size={22} aria-hidden="true" />
          <div className="acl-dispatch-node"><span className="acl-node-icon acl-node-device"><Factory size={23} aria-hidden="true" /></span><p className="acl-node-role">Device · 设备端</p><h3>昇腾 NPU</h3><strong>超级计算工厂</strong><p>算力极强，有足够的活就能忙起来；队列一旦空了，也只能停下来干等。</p></div>
        </div>
        <p className="acl-intuition-note">推理慢，不一定是 NPU 算不动。<strong>CPU 准备并下发每条指令也要耗时</strong>：框架调度、驱动提交，累加起来就是微秒级开销。</p>
        <PhaseExplorer />
      </section>

      <section className="acl-guide-step" id="acl-step-2" aria-labelledby="acl-step-2-title">
        <StepHeading number="02" label="理解原理" title="什么是 ACL Graph？从「逐条喊活」到「录像回放」" />
        <div className="acl-definition"><span className="acl-definition-icon"><Clapperboard size={25} aria-hidden="true" /></span><div><h3>ACL Graph = 一张可以反复执行的「固定流程单」</h3><p>它是昇腾 <strong>CANN</strong>（昇腾计算软件平台）上的<strong>执行图捕获（Capture）与重放（Replay）机制</strong>，可类比 NVIDIA GPU 上的 CUDA Graph。</p><p>Decode 每吐一个新词，往往会按相同顺序跑同一批算子。对于满足静态条件的部分，第一次把动作录成<strong>图 G</strong>；以后填入新数据，CPU 只发一次<strong>「重放图 G」</strong>，NPU 就能按流程连贯执行。</p></div></div>
        <CapturePreparation />
        <ReplayExperiment />
      </section>

      <section className="acl-guide-step" id="acl-step-3" aria-labelledby="acl-step-3-title">
        <StepHeading number="03" label="看清收益与边界" title="ACL Graph 有什么用？为什么不能「无脑全开」？" />
        <SavingsEstimator />
        <section className="acl-constraints" aria-labelledby="acl-constraints-title">
          <div className="acl-subsection-heading"><span className="acl-subsection-icon acl-warning-icon"><Box size={19} aria-hidden="true" /></span><div><p className="acl-mini-label">边界 · 固定的流程，也有固定的要求</p><h3 id="acl-constraints-title">静态图的三大硬性前提</h3></div></div>
          <p>先看最基础的情况：同一张普通静态图，不修改图任务，直接反复重放。</p>
          <div className="acl-constraint-grid">{constraints.map(({ icon: Icon, number, title, text }) => <div className="acl-constraint-card" key={number}><div className="acl-constraint-top"><Icon size={20} aria-hidden="true" /><span>前提 {Number(number)}</span></div><h4>{title}</h4><p>{text}</p></div>)}</div>
          <p className="acl-guide-note">固定的是图使用的形状、地址和流程，不是输入数值。工程上还可用尺寸补齐、多图匹配，以及后端支持的任务参数更新来适配变化。</p>
        </section>
        <section className="acl-guide-modes" aria-labelledby="acl-forward-title">
          <div className="acl-subsection-heading"><span className="acl-subsection-icon"><Layers3 size={19} aria-hidden="true" /></span><div><p className="acl-mini-label">折中 · 规整的录下来，变化的留在外面</p><h3 id="acl-forward-title">同一层前向的三种执行模式</h3></div></div>
          <p>当一层里的部分算子，尤其是依赖变长上下文的注意力计算，难以满足静态前提时，可以只录下其中规整的片段。</p>
          <p className="acl-guide-note">把一层简化成三步：先把输入转换成注意力要用的三份表示（Q、K、V），再为上下文打分，最后汇总输出。真实前向还有更多算子；FULL 通常捕获整次模型前向，这里只展开一层。</p>
          <ForwardDiagram mode="NONE" /><ForwardDiagram mode="PIECEWISE" /><ForwardDiagram mode="FULL" />
          <p className="acl-forward-note">整图重放的注意力后端还需支持相应的参数更新与同步。是否更快，仍要看批次和后端条件。 <a href="https://docs.vllm.ai/projects/ascend/en/v0.23.0/developer_guide/Design_Documents/ACL_Graph.html#full-vs-piecewise-on-ascend" target="_blank" rel="noreferrer">实现说明 ↗</a></p>
          <details className="acl-advanced-modes">
            <summary>进阶扩展：vLLM-Ascend 里怎么自动选模式？</summary>
            <p><code>FULL_DECODE_ONLY</code>：仅对符合条件的 Decode 批次用整图，Prefill 保持动态执行。</p>
            <p><code>FULL_AND_PIECEWISE</code>：根据批次形态，在整图与分段重放之间切换；符合条件的 Decode 用整图，混合或其他适配批次用分段。</p>
            <p>最终模式还受硬件、注意力后端与配置约束，必要时会回退。 <a href="https://docs.vllm.ai/projects/ascend/en/v0.23.0/user_guide/feature_guide/graph_mode.html" target="_blank" rel="noreferrer">图模式文档 ↗</a></p>
          </details>
        </section>
      </section>

      <section className="acl-guide-step acl-next-chapter" id="acl-step-4" aria-labelledby="acl-step-4-title">
        <StepHeading number="04" label="走向真实系统" title="当「静态图」撞上「动态大模型」" />
        <p>真实在线服务里，用户请求随时进出，提问长短不一，还需要多卡并行、多模态输入、投机解码（先猜几个词，再一起验证）与复杂的显存管理。静态图的三大前提不断受到挑战，由此引出工业界与学术界的 <strong>6 大核心痛点与前沿 Research Gap（尚待解决的研究空白）</strong>。</p>
        <div className="acl-collision-tags" aria-label="真实系统里的典型冲突"><span>动态批大小与变长</span><span>多图显存膨胀</span><span>多卡通信与算子兼容</span><span>动态特性冲突</span></div>
        <Link className="acl-analysis-cta" to="/topics/aclgraph?view=analysis">进入专题剖析：看 6 大核心痛点与 Research Gap<ArrowRight size={19} aria-hidden="true" /></Link>
      </section>
    </article>
  );
}

export default AclGraphGuide;
