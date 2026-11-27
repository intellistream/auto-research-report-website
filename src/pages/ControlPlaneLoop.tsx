import { useState } from "react";
import { Activity, Network } from "lucide-react";
import "./aclgraph-guide.css";

const spec = "https://github.com/vLLM-HUST/ride/blob/071976ebcaa0fa9ae3553adb512693f1326ce24d/docs/reference/FRAMEWORK_SPEC.md";
const loop = "https://github.com/vLLM-HUST/request-throttling-controller/blob/f2ba1bb17562a5036c4a1986e1d8b2805f247085/src/thunderagent_controller_mod/_runtime/controller/controller_loop.py";

// One decision per 60-second window. A slot can complete multiple steps in a window.
const windows = [
  { a: 8, b: 6, completed: 9 },
  { a: 4, b: 8, completed: 12 },
  { a: 9, b: 8, completed: 10 },
];

function simulate() {
  const rate = { A: 1, B: 1 };
  return windows.map(({ a, b, completed }) => {
    const estimates = { A: a * rate.A, B: b * rate.B };
    const target = estimates.A >= estimates.B ? "A" : "B";
    const slots = target === "A" ? a : b;
    const before = rate[target];
    rate[target] = (before + completed / slots) / 2;
    return { a, b, estimates, target, before, after: rate[target], slots, completed };
  });
}
const history = simulate();

export default function ControlPlaneLoop() {
  const [index, setIndex] = useState(0);
  const row = history[index];
  const fmt = (v: number) => Number(v.toFixed(2));
  return <section className="acl-guide cp-loop" aria-label="RIDE 控制器决策闭环"><div className="acl-guide-overview">
    <div className="acl-interaction-heading"><div><p className="acl-mini-label">RIDE 控制面 · 双实例决策闭环</p>
      <h2>两台引擎同时有余量，下一组请求交给谁？</h2></div><Network aria-hidden size={24}/></div>
    <p>一个逻辑控制器通过适配器连接 A、B。引擎上报状态，模型估计候选动作的结果，策略按目标选择可执行动作，引擎回报执行结果。控制器在下一窗口用到这次反馈。</p>
    <div className="cp-objective"><strong>优化目标 · maximize throughput</strong><p>固定设备预算与工作负载，以两台引擎每分钟成功完成的 program steps 之和衡量吞吐，同时检查 program 等待 P99 与失败率。图中假设两个候选均满足约束，原有流量的完成量相同，只比较新请求带来的增量。</p></div>
    <div className="acl-guide-toggle" role="group" aria-label="选择决策窗口">{history.map((_, i) =>
      <button type="button" key={i} aria-pressed={i === index} onClick={() => setIndex(i)}>第 {i + 1} 分钟</button>)}</div>
    <div className="cp-loop-stages" aria-live="polite">
      <div><small>Observe · 引擎 → 控制器</small><h3>读取两台引擎</h3><p>A 有 {row.a} 个空闲并发槽，B 有 {row.b} 个。两台运行同一模型，等待队列中有足够多的同规格请求。</p></div>
      <div><small>Predict / Decide · 模型与策略</small><h3>比较两个候选动作</h3><p>预计新增完成量 = 空闲槽 × 每槽每分钟完成步数。送 A 预计 {fmt(row.estimates.A)} 步，送 B 预计 {fmt(row.estimates.B)} 步。策略选预计吞吐较高者。</p></div>
      <div><small>Actuate · 控制器 → 执行端</small><h3>放行至实例 {row.target}</h3><p>请求适配器把这一组工作送至 {row.target}，按 {row.slots} 个槽限制在途量。引擎继续调度本地批次。</p></div>
      <div><small>Verify / Reconcile · 反馈</small><h3>回读成功完成量</h3><p>{row.target} 本窗口新增完成 {row.completed} 步。用观测速率与原估计等权平均，每槽完成率从 {fmt(row.before)} 更新到 {fmt(row.after)}。另一台保留原估计。</p></div>
    </div>
    {index === 2 && <p className="acl-experiment-takeaway">第三分钟 A 有 9 个空闲槽，B 只有 8 个。若沿用初始模型会选 A；前两分钟的完成回执提高了对 B 的每槽完成率估计，校准后的策略选择 B。</p>}
    <p className="acl-experiment-note">教学回放。三个窗口使用同一选择策略，负载变化会改变动作，预测误差会改变模型参数。数字为示例，均非硬件回执。</p>
    <div className="cp-objective"><h3><Activity size={17} aria-hidden/> 从自适应到策略演进</h3><p>窗口内用最新状态选动作，窗口间用反馈校准模型。更长周期内，可用历史决策轨迹提出候选策略，再用同输入、同资源的配对回放比较吞吐、等待与失败；通过后切换策略版本，退化时回退。线上自动策略演进属于设计目标。</p></div>
    <p>同一闭环有三种执行接口：请求控制器向路由层提交放行与目标实例；KV 控制器向引擎提交驻留与搬运计划；实例控制器向部署层提交扩缩或排空。每种动作都需要可核对的执行回执。</p>
    <nav className="acl-source-links"><a href={spec}>RIDE 控制器协议 ↗</a><a href={loop}>请求控制器实现 ↗</a></nav>
  </div></section>;
}
