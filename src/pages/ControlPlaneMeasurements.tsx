const repo = "https://github.com/vLLM-HUST/vllm-hust-benchmark/blob/";
const pool = repo + "f60e4b15eb8224fbbe26c93bca9faee1dba524d7/reports/instance-controller-scaling-20261120/README.md";
const routing = repo + "e0f197a285a0b30bbcf413ecd6ed302004ef0fdf/reports/kv-controller-routing-20261119/README.md";

function Pair({labels, values, max}: {labels: [string,string]; values: [number,number]; max: number}) {
  return <div className="cp-batch-group">{values.map((v,i)=><div className="cp-batch-row" key={labels[i]}>
    <span>{labels[i]}</span><div className="cp-batch-track" aria-hidden="true"><i className={i===0?"baseline":undefined} style={{width:(100*v/max)+"%"}}/></div><b>{v.toFixed(2)}</b>
  </div>)}</div>;
}

export function KvMeasurements() {
  return <aside className="cp-measured"><h4>真机实测 · 把主机 KV 取回后，续轮能提前多久输出？</h4>
    <div className="cp-batch-chart"><strong>同一 8,192-token 输入，第二次请求的首 token 延迟（ms）</strong>
    <Pair labels={["本地重算","主机 KV 回载"]} values={[370.70,254.37]} max={400}/>
    <small>Ascend 910B2 · Qwen3-0.6B · 两组均关闭设备前缀缓存 · 每臂一次重复请求，均生成相同的 8 个 token。</small></div>
    <p>从客户端发送到收到首个生成 token，耗时下降 31.38%。引擎日志记录 5 ms 回载 8,192 tokens，外部前缀命中计数增加 8,191。5 ms 是引擎搬运时间，254.37 ms 覆盖完整首 token 路径。这组数据验证了主机 KV 回载；动态逐层重配置的 TPOT 和 TBT 收益仍待配对测量。 <a href={import.meta.env.BASE_URL+"evidence/control-plane/kv-reload.json"}>配对时间戳、输入摘要与回执 ↗</a></p>
    <details><summary>什么时候搬运更贵？跨节点按需拉取的 24 对测量</summary>
      <p>两台 RTX A6000、Qwen2.5-0.5B BF16 TP1，固定目标副本和输入，比较远端 KV 按需读取与目标本地重算。512、2,048、8,192、16,384 tokens 各测 6 对。24/24 次拉取都命中完整前缀，首 token 均慢于重算；8,192 tokens 档中位数为 1,001.5 ms 对 189.5 ms。两端拓扑和模型均与上面的 Ascend 测量不同。24 对中有 1 对输出 token 存在差异。 <a href={import.meta.env.BASE_URL+"evidence/control-plane/kv-fetch-vs-recompute.json"}>四档逐对回执 ↗</a></p>
    </details>
    <details><summary>同项目的多实例 KV 感知路由结果</summary><p>两张 RTX A6000，Qwen2.5-0.5B，每个副本固定 512 MiB 设备 KV 和 1 GiB 主机 KV。48 个 SWE-smith program 的三对回放中，只改变副本选择策略，整批中位缩短 14.71%，吞吐中位提高 17.25%；24-program 组整批中位缩短 4.35%。两组衡量的是选址收益。 <a href={routing}>逐对结果与冻结配置 ↗</a></p></details>
  </aside>;
}

export function PoolMeasurements() {
  return <aside className="cp-measured"><h4>真机实测 · 第三个副本赶上了哪个波峰？</h4>
    <div className="cp-batch-chart"><strong>全批请求端到端 P95（秒）</strong>
      <h4>单峰 · 每臂 6,870 条</h4><Pair labels={["固定 2","动态 1–3"]} values={[449.89,344.56]} max={500}/>
      <h4>双峰 · 每臂 10,050 条</h4><Pair labels={["固定 2","动态 1–4"]} values={[398.55,399.78]} max={500}/>
      <small>4 × RTX A6000 · Qwen2.5-7B-Instruct · Azure Code 同轨迹顺序配对 · 包含窗外完成的请求。</small></div>
    <p>单峰中，第三个副本在 674.8 s 启动，957.8 s 首次接单，间隔 283.0 s，赶上了 840–1,020 s 的高峰。全批 P95 降低 23.4%。双峰中，第三个副本在两峰之间首次接单，两次高峰均只有两个副本承接流量，全批 P95 上升 0.3%。</p>
    <p>单峰、双峰动态组的窗口内平均模型预约分别为 2.085 和 2.060 个副本，都超过预设上限 2，因此两次均未通过延迟与预约的联合门槛。两臂的平台资源均为四张卡，配对失败和缺失均为零。 <a href={pool}>查看峰内接单、资源账与配对报告 ↗</a></p>
    <details><summary>Ascend 四卡 · 提前接单能否同时降低延迟和模型卡时？</summary>
      <p>同一节点运行 Qwen2.5-7B，比对固定 2 副本与动态 1–4 副本（观测峰值 3）。两个新增副本在第 499、500 秒首次接单。第 540–740 秒到达率升至每秒 8 条，这期间到达的 1,600 条请求平均延迟从 3.275 降到 2.667 秒。全窗 850 秒内，两组均完成 2,820 条，吞吐同为 3.318 请求/秒。模型平均预约从 2.000 降至 1.853 张 NPU，集群均预留四卡。</p>
      <p>这是调整峰前过渡负载后的一次固定顺序配对。此前 200 秒和 400 秒周期的正弦负载中，新副本都在峰后接单，平均延迟均上升。 <a href={import.meta.env.BASE_URL+"evidence/control-plane/ascend-scaling.json"}>8 请求/秒配对回执与接单时刻 ↗</a></p>
    </details>
  </aside>;
}
