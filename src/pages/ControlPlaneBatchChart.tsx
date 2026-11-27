const rows = [["vLLM 直连", 1514.55], ["请求限流", 713.45]] as const;

export default function ControlPlaneBatchChart() {
  return <figure className="cp-batch-chart">
    <figcaption><strong>同一批多轮请求，整批加速 2.12×</strong><span>完成时间 · 秒</span></figcaption>
    <div className="cp-batch-group">
      {rows.map(([label, seconds], i) => <div className="cp-batch-row" key={label}>
        <span>{label}</span><div className="cp-batch-track" aria-hidden="true"><i style={{width: (seconds / 1600 * 100) + "%"}} className={i === 0 ? "baseline" : undefined}/></div>
        <b>{seconds.toFixed(2)}</b>
      </div>)}
    </div>
    <small>35B 单实例 TP2，48 个 program，首轮约 40k tokens，三轮回放。限流组调度预算为 327,680 tokens；两组使用相同引擎物理 KV 容量。</small>
  </figure>;
}
