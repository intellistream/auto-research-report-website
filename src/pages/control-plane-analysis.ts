// Each question ties a mechanism to a boundary and a falsifiable experiment.
const reports = "https://github.com/vLLM-HUST/vllm-hust-benchmark/tree/ac1d5ed516112c019c1acb63481154aabb90409c/reports/";
export const analysis = {
  scheduling: [
    {
      title: "暂停之后，什么时候值得恢复一个 program？",
      mechanism: "多轮 agent 调工具时，推理请求已经结束，下一轮却仍要读之前的历史。一次性放回大量等待者，会让这些历史前缀竞争同一片 KV 空间。ThunderAgent 按 program 跟踪工作集并控制放行；恢复决策还需面对下一轮上下文增长和工具返回时刻的不确定性。",
      evidence: "35B 单实例、C48、首轮约 40k tokens 的三轮回放中，直连、默认限流、收紧预算的整批时间依次为 1514.55、1492.48、713.45 秒。收紧预算后，输入 token 缓存复用率从直连的 0% 升至 59.59%。另一次 600 秒窗口里仅 18/48 个 program 完成首轮：优先让部分 program 连续前进也会延长其余 program 的等待。",
      test: "固定放置、引擎和输入，比较原恢复阈值与按近期上下文增长预留空间的策略。按 program 对齐 resume 时刻、下一轮实算 prefill、首轮等待 P99、整批时间。若多留空间只让更多 program 等待，且重算和批时均未改善，就否定该策略。",
      sources: [["ThunderAgent · program 调度", "https://arxiv.org/html/2602.13692v1#S4"], ["35B 三臂回放与逐请求记录", reports + "controller-35b-c48-budget-20261126"]],
    }, {
      title: "缓存亲和与排队冲突时，下一轮去哪台实例？",
      mechanism: "固定回原实例能保留局部性；选择队列最短的实例能避开热点，但可能重算整段历史。Dynamo 同时利用前缀重叠与引擎负载。Llumnix 允许对执行中的请求重新调度，执行方还需移动内存状态。这是两个不同的决策时刻。",
      evidence: "双 devbox 各一个 TP2 的 35B 配对中，直连和默认控制器都完成 336 次请求，整批分别用时 654.91 和 678.96 秒。两臂前缀命中增量均为零，且未观察到业务 pause/resume。这组运行测到了整条转发路径的代价，尚未覆盖热前缀与排队竞争的条件。",
      test: "让 A 持有 P 的前缀、B 保持冷缓存，每次只改变 A 上已有的 decode 流数。将相同续轮分别定向到 A 和 B，核对实际 cached tokens，再比较工具返回到首 token 的时间，以及原有流的 P99 输出间隔。观察最佳位置是否随排队增长而反转。",
      sources: [["Dynamo · KV 感知路由", "https://docs.nvidia.com/dynamo/knowledge-base/concepts/system-architecture/kv-aware-routing"], ["Llumnix · 运行中重调度", "https://www.usenix.org/conference/osdi24/presentation/sun-biao"], ["双 devbox 配对原件", reports + "controller-35b-two-devbox-20261125"]],
    },
  ],
  kv: [
    {
      title: "请求和实例都固定，为什么还要重配置 KV？",
      mechanism: "OrbitFlow 观察到长上下文生成时，序列长度和批组成变化会使静态卸载计划失效。它在 GPU 显存约束下，用整数线性规划为每个请求选择层级 KV 驻留计划，再根据传输和计算时间的反馈调整，使预取尽量被计算掩盖。",
      evidence: "图 11 比较单节点 2 路和 4 路张量并行，多张卡共同执行一个模型实例。严重过载时，系统还可暂缓在途请求，通过缓冲的已生成 token 维持输出节奏。这里的 pause/resume 是引擎内的后备机制，与控制面在两轮之间决定是否放行处在不同位置。",
      test: "固定路由、请求集合和显存上限，对照静态与自适应驻留。记录每次重配置搬运的字节、未被计算掩盖的传输时间、TPOT 与 TBT 达标率。另测只剩少数解码步的情况，判断迁移能否收回成本。",
      sources: [["OrbitFlow · 机制与图 11", "https://arxiv.org/pdf/2601.10729v2"], ["作者实现", "https://github.com/omnia-postech/OrbitFlow"]],
    },
    {
      title: "长前缀留在远端，搬运和重算的分界在哪里？",
      mechanism: "路由确定后，目的实例要取得可用的 KV。DistServe 在 prefill 和 decode 资源池之间交接状态；Mooncake 将分散的存储资源组织成共享 KV 缓存。前者因计算分工产生交接，后者让多个实例有机会复用历史，两者都要支付数据到达目的地的成本。",
      evidence: "命中目录条目只是第一步。目的端还需能解释块布局、完成握手并分配接收空间。vLLM 的 NIXL 握手配置和远端断连后失效对端的工程记录，分别暴露了建立连接与失效恢复两个环节。只有目的端实际跳过的 prefill 才能计作计算节省。",
      test: "锁定目的实例、模型和续轮，逐档改变共享前缀长度，交替运行远程获取和本地重算。将元数据查询、等待、传输和剩余 prefill 分别计时，同时记录字节与首 token 延迟。若实际命中增加而首 token 仍更慢，检查传输是否位于关键路径。",
      sources: [["DistServe · 阶段交接", "https://www.usenix.org/conference/osdi24/presentation/zhong-yinmin"], ["Mooncake · 分布式 KV 缓存", "https://www.usenix.org/conference/fast25/presentation/qin"], ["vLLM · NIXL 握手配置", "https://github.com/vllm-project/vllm/pull/66514"], ["vLLM · 对端失效与重连", "https://github.com/vllm-project/vllm/pull/68047"]],
    }, {
      title: "等待工具时，哪些 program 的 KV 值得留在设备上？",
      mechanism: "工具等待产生了一段空窗。让 KV 常驻设备，续轮返回时可立即复用，但会挤占其他活跃流的容量。迁到主机内存可以腾出空间，同时引入写出和读回。MORI 利用 program 近期的工具等待行为做分层决策，并依赖引擎提供块级操作。",
      evidence: "一次短等待中，读写甚至可能比等待本身更长。实例 A 将块移到自己的主机内存，也不等于 B 已可直接读取。跨实例复用还要确认位置、所有者、传输通路与失效语义。单实例缓存命中和跨实例获取应分别计数。",
      test: "固定前缀、路由和并发，只改变工具等待时间，对照常驻、卸载后读回、丢弃后重算。联看其他流少重算了多少、本 program 多等了多久、实际读写量；用整批时间和 program P99 判断释放显存是否值得。",
      sources: [["MORI · 工具等待与分层缓存", "https://arxiv.org/html/2606.00866v2#S5"], ["Mooncake · 跨节点缓存组织", "https://www.usenix.org/conference/fast25/presentation/qin"]],
    },
  ],
  instances: [
    {
      title: "扩容什么时候才能让正在排队的用户受益？",
      mechanism: "负载上升到新增实例接流量之间，要经过容量决策、资源分配、加载模型、就绪和路由更新。Ray Serve 的自动扩缩围绕副本负载调节目标数量；ServerlessLLM 研究模型装载及其与放置的关系。即使权重已经在磁盘上，实例何时能完成第一个请求仍需单独验证。",
      evidence: "如果流量尖峰早于新副本就绪便已结束，扩容消耗了卡时，却没有分担尖峰。相反，保留热副本能够立即分流，但在低谷会产生空闲成本。判断服务容量应标出每个副本的首个成功请求，而不只统计部署系统回报的目标副本数。",
      test: "重放同一段突发到达轨迹，分别用常驻热副本和按需扩容接流量。对齐扩容决定、模型就绪、首个成功请求与积压消退四个时间点；同时比较请求 P99、超时数与设备卡时。权重位置、初始热副本数和每台卡数都写入回执。",
      sources: [["Ray Serve · 自动扩缩", "https://docs.ray.io/en/latest/serve/autoscaling-guide.html"], ["ServerlessLLM · 模型装载与放置", "https://www.usenix.org/conference/osdi24/presentation/fu"]],
    }, {
      title: "缩容时，等待排空和迁移在途请求各付出什么？",
      mechanism: "从路由表移除实例可以停止新请求，在途生成却还持有解码进度和 KV。自然排空保留原执行路径，释放设备的时间取决于最后一个长流。Llumnix 的在线迁移给出了另一条路径：复制状态、交接执行，再释放源实例。",
      evidence: "vLLM 的托管引擎关闭信号 PR 涉及在途请求排空，说明代理停止派发与引擎允许请求完成之间还需要关闭协议。对于已向客户端流出 token 的请求，直接重试还需核验输出连续性。计划排空与实例突然退出有不同的前提。",
      test: "固定长短流混合负载，在相同时间移除一个副本，对照自然排空与具备引擎支持的迁移。逐流核对完成、失败、重复输出与最长输出间隔，再比较最后一张卡的释放时间。若提前回收的卡时不足以抵消迁移干扰，就保留自然排空。",
      sources: [["Ray Serve · 实例生命周期", "https://docs.ray.io/en/latest/serve/architecture.html"], ["vLLM · 在途请求排空", "https://github.com/vllm-project/vllm/pull/67282"], ["Llumnix · 请求与状态迁移", "https://www.usenix.org/conference/osdi24/presentation/sun-biao"]],
    },
  ],
} as const;
