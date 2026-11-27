const cases = [
  { label: "单实例 · 48 个 program · 首轮约 40k tokens", rows: [
    ["直连", 1514.55], ["默认限流", 1492.48], ["收紧预算", 713.45],
  ] },
  { label: "双 devbox · 112 个 program · 每台一个 TP2", rows: [
    ["直连", 654.91], ["默认限流", 678.96],
  ] },
] as const;

export default function ControlPlaneBatchChart() {
  return <figure className="cp-batch-chart">
    <figcaption><strong>35B 多轮回放：整批完成时间</strong><span>单位：秒 · 越短越好</span></figcaption>
    {cases.map(group => <div className="cp-batch-group" key={group.label}>
      <h4>{group.label}</h4>
      {group.rows.map(([label, seconds]) => <div className="cp-batch-row" key={label}>
        <span>{label}</span><div className="cp-batch-track" aria-hidden="true"><i style={{ width: (seconds / 1600 * 100) + "%" }} className={label === "直连" ? "baseline" : undefined}/></div>
        <b>{seconds.toFixed(2)}</b>
      </div>)}
    </div>)}
    <small>共用 0–1600 秒刻度。只在同一组内比较；每种配置运行一次。</small>
  </figure>;
}
