import { useState } from "react";
import { ArrowRight, Timer } from "lucide-react";
import TimeBlock from "./TimeBlock";
import "./aclgraph-guide.css";

type Block = [start: number, end: number, label: string, waiting?: boolean];
type Lane = [label: string, blocks: Block[]];
type Panel = { title: string; end: number; lanes: Lane[] };
type Example = { panels: [Panel, Panel]; takeaway: string };
type Direction = "scheduling" | "kv";

const topics = {
  scheduling: { question: "续轮回到热实例，还是发往空闲实例？", choices: ["原实例短队列", "原实例长队列"], note: "固定请求、缓存位置及两个实例的计算速度，比较从工具返回到首 token 的时间。" },
  kv: { question: "请求留在同一实例，何时值得重配 KV？", choices: ["剩余 1 步", "剩余 4 步", "剩余 6 步"], note: "固定请求、实例和显存上限。示意模型假设重配置花 4 格，每步暴露在关键路径上的预取等待从 2 格降为 1 格，计算仍占 2 格。格数为教学假设。" },
};

function example(direction: Direction, choice: number): Example {
  const alternate = choice === 1;
  if (direction === "scheduling") {
    const queue = alternate ? 12 : 4;
    return { panels: [
      { title: "回到 A · 命中前缀", end: queue + 4, lanes: [["排队", [[0, queue, "等 A", true]]], ["推理", [[queue, queue + 4, "续算"]]]] },
      { title: "发往 B · 冷缓存", end: 12, lanes: [["排队", []], ["推理", [[0, 8, "重算历史"], [8, 12, "续算"]]]] },
    ], takeaway: alternate ? "A 要排队 12 格，超过 B 重算历史的 8 格。这时把续轮发给 B，首 token 早 4 格到达。" : "A 只等 4 格就能续算，B 却要用 8 格重算历史。回到 A，首 token 早 4 格到达。" };
  }
  const steps = [1, 4, 6][choice];
  function plan(change: boolean): Panel {
    const copies: Block[] = change ? [[0, 4, "重配"]] : [];
    const compute: Block[] = [];
    let time = change ? 4 : 0;
    for (let step = 0; step < steps; step++) {
      const ready = time + (change ? 1 : 2);
      copies.push([time, ready, "取"]);
      compute.push([ready, ready + 2, "算"]);
      time = ready + 2;
    }
    return { title: change ? "更新驻留计划" : "沿用驻留计划", end: time, lanes: [["搬运", copies], ["计算", compute]] };
  }
  return { panels: [plan(false), plan(true)], takeaway: steps === 6 ? "六步合计少等 6 格，扣除重配的 4 格，净省 2 格：沿用耗时 24 格，更新耗时 22 格。" : alternate ? "四步各少等 1 格，刚好抵消重配花费的 4 格。两条路径同时结束；继续沿用新计划才有净收益。" : "只剩一步时，搬动 KV 花了 4 格，只少等 1 格。新计划晚 3 格结束。" };
}

export default function ControlPlaneTimeline({ direction }: { direction: Direction }) {
  const [choice, setChoice] = useState(0);
  const topic = topics[direction];
  const { panels, takeaway } = example(direction, choice);
  return <figure className="acl-guide cp-timeline"><div className="acl-guide-overview">
    <div className="acl-interaction-heading"><div><p className="acl-mini-label">动手看懂 · 双路径时间线</p><h3>{topic.question}</h3></div><Timer aria-hidden size={24}/></div>
    <div className="acl-guide-toggle" role="group" aria-label={topic.question}>{topic.choices.map((label, i) =>
      <button key={label} type="button" aria-pressed={i === choice} onClick={() => setChoice(i)}>{label}</button>)}</div>
    <p className="acl-timeline-scale">教学示意 · 两图同一刻度，时间向右 <ArrowRight size={14} aria-hidden/><span>1 格为 1 个相对时间单位</span></p>
    <div className="acl-execution-grid">{panels.map(({ title, end, lanes }, i) =>
      <div key={title} className={"acl-execution" + (i ? " acl-execution-replay" : "")}>
        <div className="cp-panel-title"><strong>{title}</strong><small>{direction === "kv" ? "解码结束" : "首 token"} · {end} 格</small></div>
        {lanes.map(([label, blocks]) => <div key={label} className="acl-execution-row"><span className="acl-device-label">{label}</span><div className="acl-time-track acl-device-track">{blocks.map(([start, stop, text, waiting]) =>
          <TimeBlock key={start} start={start} end={stop} waiting={waiting} label={text + " · 第 " + start + " 至 " + stop + " 格"}>{text}</TimeBlock>)}</div></div>)}
      </div>)}</div>
    <div className="acl-experiment-takeaway" aria-live="polite"><strong>{takeaway}</strong></div>
    <p className="acl-experiment-note">{topic.note} 数值用于说明机制。</p>
  </div></figure>;
}
