import { Link } from "react-router-dom";
import type { Topic } from "./TopicPages";
import "./aclgraph-guide.css";

const operators = ["A", "B", "C"];

function ExecutionDiagram({ replay }: { replay?: boolean }) {
  return (
    <div className={replay ? "acl-execution acl-execution-replay" : "acl-execution"}>
      <h3>{replay ? "整图回放" : "普通执行"}</h3>
      <div className="acl-execution-row">
        <span className="acl-device-label">CPU</span>
        {replay ? (
          <span className="acl-command acl-command-wide">回放一次</span>
        ) : (
          operators.map((operator) => <span key={operator} className="acl-command">下发 {operator}</span>)
        )}
      </div>
      <div className="acl-execution-row acl-execution-arrows" aria-hidden="true">
        <span />
        {replay ? (
          <span className="acl-command-wide">↓</span>
        ) : (
          operators.map((operator) => <span key={operator}>↓</span>)
        )}
      </div>
      <div className="acl-execution-row">
        <span className="acl-device-label">NPU</span>
        <div className={replay ? "acl-operators acl-captured" : "acl-operators"}>
          {operators.map((operator) => <span key={operator}>算子 {operator}</span>)}
        </div>
      </div>
    </div>
  );
}

const batches = [
  { label: "批次 A", history: 128 },
  { label: "批次 B", history: 512 },
] as const;

export default function AclGraphGuide({ topic }: { topic: Topic }) {
  return (
    <article className="acl-guide">
      <section className="acl-guide-overview" aria-labelledby="acl-step-title">
        <h2 id="acl-step-title">一次前向怎样用上 ACLGraph？</h2>
        <p className="acl-guide-lead">先捕获一段 NPU 任务。遇到满足复用条件的批次，CPU 一次提交整段任务。</p>
        <div className="acl-execution-grid">
          <ExecutionDiagram />
          <ExecutionDiagram replay />
        </div>
        <p className="acl-guide-footnote">
          回放前仍需准备本轮输入和状态。
          {" "}<a href="https://github.com/vllm-project/vllm-ascend/blob/main/docs/source/developer_guide/Design_Documents/ACL_Graph.md" target="_blank" rel="noreferrer">实现设计 ↗</a>
        </p>
      </section>

      <section className="acl-guide-reuse" aria-labelledby="acl-state-title">
        <div>
          <h2 id="acl-state-title">同样是 64 个新 token，能复用吗？</h2>
          <p>两批输入落在同一个桶里。历史变长时，还要检查 KV 索引、工作区和任务依赖。</p>
        </div>
        <figure className="acl-history">
          <figcaption>两批输入的示意</figcaption>
          {batches.map(({ label, history }) => (
            <div key={label} className="acl-history-row">
              <div className="acl-history-caption">
                <strong>{label}</strong><span>历史 {history}</span><span>本轮 +64</span>
              </div>
              <div className="acl-history-track" aria-hidden="true">
                <span className={history === 128 ? "acl-history-short" : "acl-history-long"} />
                <span className="acl-history-new" />
              </div>
            </div>
          ))}
        </figure>
      </section>

      <details className="acl-guide-modes">
        <summary>三种执行模式</summary>
        <dl>
          <div><dt><code>FULL</code></dt><dd>整段前向回放</dd></div>
          <div><dt><code>PIECEWISE</code></dt><dd>回放稳定片段，切分处在图外执行</dd></div>
          <div><dt><code>NONE</code></dt><dd>逐个下发算子</dd></div>
        </dl>
        <a href="https://docs.vllm.ai/projects/ascend/en/main/user_guide/feature_guide/graph_mode.html" target="_blank" rel="noreferrer">vLLM Ascend 图模式文档 ↗</a>
      </details>

      {topic.report && <section className="acl-guide-research" aria-labelledby="acl-research-title">
        <h2 id="acl-research-title">待验证的问题</h2>
        <p>工具调用返回后，图回放前的状态准备会拖慢 Agent 的下一次动作吗？</p>
        <Link to={{ search: "view=report&part=survey-gaps" }}>查看研究问题与验证方案 →</Link>
      </section>}
    </article>
  );
}
