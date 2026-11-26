import { useState } from "react";
import "./aclgraph-guide.css";

function TimeBlock({ start, end, label, waiting = false }: {
  start: number; end: number; label: string; waiting?: boolean;
}) {
  return <span className={waiting ? "acl-time-block acl-time-wait" : "acl-time-block"}
    style={{ gridColumn: `${start + 1} / ${end + 1}` }}>{label}</span>;
}

function ExecutionDiagram({ replay = false, longAdd }: { replay?: boolean; longAdd: boolean }) {
  // Relative times for the single-stream illustration. Both paths use the same device durations.
  const addStart = 3;
  const multiplyQueued = 9;
  const addEnd = addStart + (longAdd ? 7 : 3);
  const multiplyStart = replay ? addEnd : Math.max(addEnd, multiplyQueued);
  return (
    <section className={replay ? "acl-execution acl-execution-replay" : "acl-execution"}>
      <h3>{replay ? "图重放 · 一次提交，按序执行" : "直接提交 · 逐个下发算子"}</h3>
      <div className="acl-execution-row">
        <span className="acl-device-label">CPU 提交</span>
        <div className="acl-time-track acl-host-track">
          {replay ? <TimeBlock start={0} end={addStart} label="重放" /> : <>
            <TimeBlock start={0} end={addStart} label="加法" />
            <TimeBlock start={addStart} end={multiplyQueued} label="乘法" />
          </>}
        </div>
      </div>
      <div className="acl-execution-row">
        <span className="acl-device-label">NPU 执行</span>
        <div className="acl-time-track acl-device-track">
          <TimeBlock start={addStart} end={addEnd} label="加法" />
          {addEnd < multiplyStart && <TimeBlock start={addEnd} end={multiplyStart} label="等下发" waiting />}
          <TimeBlock start={multiplyStart} end={multiplyStart + 4} label="乘法" />
        </div>
      </div>
    </section>
  );
}

const attentionSteps = [
  { name: "QKV 投影", graph: 1 },
  { name: "注意力", graph: null },
  { name: "输出投影", graph: 2 },
] as const;

const forwardModeNames = {
  NONE: "直接执行（无图重放）",
  PIECEWISE: "分段重放",
  FULL: "整图重放",
} as const;

function ForwardDiagram({ mode }: { mode: keyof typeof forwardModeNames }) {
  return (
    <figure className="acl-forward-diagram">
      <figcaption>
        <strong>{forwardModeNames[mode]}</strong>
        <code>{mode}</code>
      </figcaption>
      <div className={mode === "FULL" ? "acl-forward-whole" : "acl-forward-per-step"}>
        {mode === "FULL" && <span className="acl-forward-action">重放整图</span>}
        <ol className="acl-forward-steps">
          {attentionSteps.map(({ name, graph }) => {
            const outside = mode === "NONE" || (mode === "PIECEWISE" && graph === null);
            return (
              <li key={name} className={outside ? "acl-forward-outside" : undefined}>
                {mode !== "FULL" && <span className="acl-forward-action">{outside ? "图外执行" : `重放图 ${graph}`}</span>}
                <strong>{name}</strong>
              </li>
            );
          })}
        </ol>
      </div>
    </figure>
  );
}

export default function AclGraphGuide() {
  const [longAdd, setLongAdd] = useState(false);
  return (
    <article className="acl-guide">
      <section className="acl-guide-overview" aria-labelledby="acl-step-title">
        <h2 id="acl-step-title">图重放省去了哪部分工作？</h2>
        <p className="acl-guide-lead">
          先算 <strong>s = a + b</strong>，再算 <strong>y = s × c</strong>。
          <br /><strong>直接提交时</strong>，CPU 提交完加法就能提交乘法。NPU 要等 s 就绪且乘法已入队，才能做乘法。
          <br /><strong>图重放时</strong>，CPU 只需启动一次已捕获的图。NPU 算出 s 就能接着做乘法，无需再等 CPU 单独下发。
        </p>
        <div className="acl-timeline-controls">
          <div role="group" aria-label="比较加法执行耗时">
            <button type="button" aria-pressed={!longAdd} onClick={() => setLongAdd(false)}>加法耗时短</button>
            <button type="button" aria-pressed={longAdd} onClick={() => setLongAdd(true)}>加法耗时长</button>
          </div>
          <span>示意时长 · 时间向右 →</span>
        </div>
        <div className="acl-execution-grid">
          <ExecutionDiagram longAdd={longAdd} />
          <ExecutionDiagram replay longAdd={longAdd} />
        </div>
        <p className="acl-guide-footnote">
          <span aria-live="polite">{longAdd
            ? "加法算完时，乘法已经入队。两图中的乘法同时开始，重放省去一次 CPU 提交。"
            : "斜线段里，加法已算完，设备流还在等 CPU 下发乘法。重放时两个算子已在图中，乘法拿到加法结果就能接着算。"}</span>
          {" "}<a href="https://www.hiascend.com/doc_center/source/zh/canncommercial/900/programug/acldevg/runtime_doc_dev_0011.html" target="_blank" rel="noreferrer">单流顺序 ↗</a>
          {" · "}<a href="https://www.hiascend.com/doc_center/source/zh/CANNCommunityEdition/910/API/runtimeapi/aclcppdevg_03_1782.html" target="_blank" rel="noreferrer">CANN 图捕获 ↗</a>
          {" · "}<a href="https://github.com/vllm-project/vllm-ascend/blob/fef7a9886cf1365ae951ff01fb1599802ca5cc6a/vllm_ascend/compilation/acl_graph.py#L255-L297" target="_blank" rel="noreferrer">vLLM Ascend 重放源码 ↗</a>
        </p>
      </section>

      <section className="acl-guide-modes" aria-labelledby="acl-forward-title">
        <h2 id="acl-forward-title">同一段前向的三种执行方式</h2>
        <p>以注意力层为例，NPU 都按相同顺序执行这三步。CPU 可以直接下发算子、分段重放，也可以一次重放整个前向。</p>
        <ForwardDiagram mode="NONE" />
        <ForwardDiagram mode="PIECEWISE" />
        <ForwardDiagram mode="FULL" />
        <p className="acl-forward-note">整段前向可以复用时，整图重放能减少 CPU 重复下发的开销。若注意力需要在图外执行，仍可分段重放前后的投影。当前批次没有可用图，或需要调试算子时，可以直接执行。{" "}
          <a href="https://docs.vllm.ai/projects/ascend/en/v0.23.0/developer_guide/Design_Documents/ACL_Graph.html#full-vs-piecewise-on-ascend" target="_blank" rel="noreferrer">实现说明 ↗</a>
        </p>
        <details>
          <summary>如何按批次选择重放方式？</summary>
          <p><code>FULL_DECODE_ONLY</code> 只对符合条件的解码批次使用整图。<code>FULL_AND_PIECEWISE</code> 可按批次选择整图或分段重放。{" "}
            <a href="https://docs.vllm.ai/projects/ascend/en/v0.23.0/user_guide/feature_guide/graph_mode.html" target="_blank" rel="noreferrer">图模式文档 ↗</a>
          </p>
        </details>
      </section>
    </article>
  );
}
