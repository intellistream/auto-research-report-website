export type CellState = "pending" | "ready" | "active" | "accepted" | "rejected" | "released" | "moved";
export type DemoCell = { id: string; text: string; state: CellState };
export type DemoRow = { status: string; cells: DemoCell[] };
export type DemoStep = { title: string; explanation: string; rows: [DemoRow, DemoRow, DemoRow]; duration: number };
export type DemoStage = "startup" | "scheduling" | "prefill" | "pd_transfer" | "decode" | "speculative" | "output_return" | "resource_reclaim";
export type DemoScenario = {
  context: string; purpose: string; lanes: [string, string, string];
  steps: DemoStep[]; note: string; result: string;
  next: { stage: DemoStage; label: string; action?: string }; reference: { label: string; url: string };
};

const cell = (text: string, state: CellState = "ready", id = text): DemoCell => ({ id, text, state });
const row = (status: string, ...cells: DemoCell[]): DemoRow => ({ status, cells });
const prompt = (state: CellState = "ready") => ["P₁", "P₂", "P₃", "P₄"].map(t => cell(t, state));
const kv = (state: CellState = "ready") => ["KV₁", "KV₂", "KV₃", "KV₄"].map(t => cell(t, state));
const step = (title: string, explanation: string, rows: DemoStep["rows"], duration = 1500): DemoStep => ({ title, explanation, rows, duration });
const optimization = { label: "vLLM · 调度与分块 Prefill", url: "https://docs.vllm.ai/en/stable/configuration/optimization/#chunked-prefill" };
const prefix = { label: "vLLM · KV 块释放与淘汰", url: "https://docs.vllm.ai/en/stable/design/prefix_caching/#free" };

// These are conceptual snapshots, not runtime traces or benchmark timings.
export const inferenceDemos: Record<DemoStage, DemoScenario> = {
  startup: {
    context: "服务启动 · 单个 GPU 示意", purpose: "先让模型和执行环境就绪，后续请求共享这份服务。",
    lanes: ["模型文件", "GPU / 执行环境", "服务状态"],
    steps: [
      step("加载模型", "读取模型配置和权重，并按部署方式装入设备。此时还不能直接开始接收推理任务。", [row("读取", cell("配置"), cell("模型权重", "active")), row("装载", cell("权重", "active")), row("未就绪", cell("等待初始化", "pending"))]),
      step("准备执行环境", "初始化执行所需的资源、KV 缓存池并完成必要的预热。权重会留在设备中供后续请求使用。", [row("已读取", cell("配置"), cell("模型权重")), row("初始化", cell("权重"), cell("KV 池", "active"), cell("预热", "active")), row("未就绪", cell("等待初始化", "pending"))]),
      step("开始接收请求", "初始化完成后，服务才进入就绪状态。新请求进入调度，不需要每次重新加载模型。", [row("已读取", cell("配置"), cell("模型权重")), row("已就绪", cell("权重"), cell("KV 池"), cell("预热完成")), row("可服务", cell("接收请求 A", "accepted"))]),
    ],
    note: "示意省略分布式通信与具体编译策略；实际初始化依配置而异。", result: "模型常驻，接下来为请求分配计算与缓存资源。",
    next: { stage: "scheduling", label: "请求调度" }, reference: { label: "vLLM · 引擎架构", url: "https://docs.vllm.ai/en/stable/design/arch_overview/" },
  },
  scheduling: {
    context: "请求 A、B、C · 连续批处理示意", purpose: "每轮重新分配 token 预算和 KV 空间，让请求持续向前推进。",
    lanes: ["等待队列", "本轮 GPU 工作", "执行结果"],
    steps: [
      step("查看本轮预算", "A、B、C 等待处理。本例中本轮预算只容纳 A、B 的工作，C 暂留队列。", [row("等待调度", cell("A", "active"), cell("B", "active"), cell("C")), row("尚未分配", cell("A", "pending"), cell("B", "pending")), row("等待执行", cell("尚无结果", "pending"))]),
      step("推进一轮计算", "A、B 获得本轮的 token 预算与缓存空间。这里只推进一轮工作，不代表整条请求一次完成。", [row("C 继续等待", cell("A", "moved"), cell("B", "moved"), cell("C")), row("执行中", cell("A", "active"), cell("B", "active")), row("计算中", cell("尚无结果", "pending"))]),
      step("重新组成下一轮", "本例中 A 已结束，B 还要继续生成。空出的预算可接纳 C；调度器会在下一轮重新决定工作量。", [row("C 获准进入", cell("A", "released"), cell("B", "moved"), cell("C", "active")), row("下一轮示意", cell("B", "active"), cell("C", "active")), row("A 已结束", cell("A 完成", "accepted"), cell("B 继续"))]),
    ],
    note: "实际调度可混合 Decode 与分块 Prefill；本例仅解释预算与请求的进出。", result: "新请求处理输入，未完成的请求继续生成；每轮都会再调度。",
    next: { stage: "prefill", label: "输入处理" }, reference: optimization,
  },
  prefill: {
    context: "请求 A ·「写一首诗」", purpose: "理解输入，建立上下文缓存，并得到第一个输出 token。",
    lanes: ["输入 token", "上下文 KV", "输出 token"],
    steps: [
      step("输入就绪", "文本已由 tokenizer 转成输入序列 P₁–P₄。这里假设没有前缀缓存命中，需要计算这段输入。", [row("等待前向计算", ...prompt()), row("尚未建立", ...kv("pending")), row("尚未采样", cell("春", "pending"))]),
      step("计算输入并写入 KV", "同一段输入中的多个位置一起参与前向计算；对应的 K、V 在计算过程中写入缓存，供后续复用。", [row("本段并行计算", ...prompt("active")), row("随计算写入", ...kv("active")), row("等待计算完成", cell("春", "pending"))]),
      step("采样首个输出", "输入处理完成后，从最后位置的输出分布采样出「春」。已有输入 KV 留存，后续 Decode 从这个首 token 继续。", [row("本段已处理", ...prompt()), row("可供复用", ...kv()), row("首 token", cell("春", "accepted"))]),
    ],
    note: "P₁–P₄ 与示例汉字仅代表 token；实际分词不一定一字一 token。长输入可分块处理。", result: "交给 Decode 的是已有 KV 和首个输出 token「春」。",
    next: { stage: "decode", label: "循环生成" }, reference: optimization,
  },
  pd_transfer: {
    context: "请求 A · 可选的 P/D 分离部署", purpose: "将已算好的上下文交给另一实例，避免重新计算同一段输入。",
    lanes: ["Prefill 实例", "KV 连接器", "Decode 实例"],
    steps: [
      step("生产缓存", "Prefill 实例已计算输入 KV。Decode 实例需要取得匹配请求的缓存，才能接着处理。", [row("KV 已就绪", ...kv()), row("等待传输", cell("请求 A", "pending")), row("等待 KV", ...kv("pending"))]),
      step("传输与定位", "连接器协调请求标识、缓存位置和 KV 数据的传输。接收端尚未就绪时，不把缓存画成已可使用。", [row("提供缓存", ...kv()), row("传输中", cell("请求 A", "active"), cell("KV 数据", "active")), row("接收中", ...kv("pending"))]),
      step("接收后继续生成", "Decode 实例确认所需 KV 可用，再结合请求的生成状态继续推理。示意中的缓存内容与发送端保持对应。", [row("已提供缓存", ...kv()), row("交接完成", cell("请求 A", "accepted"), cell("KV 数据")), row("KV 可用", ...kv("accepted"))]),
    ],
    note: "只适用于 P/D 分离。不同连接器可按层或块传输；首 token 与元数据的交接依实现而异。", result: "Decode 复用接收的 KV，继续生成输出。",
    next: { stage: "decode", label: "循环生成" }, reference: { label: "vLLM · 分离式 Prefill", url: "https://docs.vllm.ai/en/stable/features/disagg_prefill/" },
  },
  decode: {
    context: "请求 A · 接着首 token「春」生成", purpose: "每轮用上一个 token 和已有 KV，得到下一个 token。",
    lanes: ["本轮输入", "累计 KV", "已生成输出"],
    steps: [
      step("从首 token 接续", "Prefill 已产生「春」，缓存中保存着输入 P₁–P₄ 的 KV。下一轮把「春」送入模型。", [row("将送入模型", cell("春", "active")), row("输入的历史缓存", cell("输入 KV")), row("首 token 已有", cell("春"))]),
      step("用「春」得到「风」", "模型读取历史 KV，计算「春」并追加它的 KV，再采样出「风」。已有的输入 KV 无需重算。", [row("本轮计算", cell("春", "active")), row("追加当前输入", cell("输入 KV"), cell("KV·春", "active")), row("新增一个 token", cell("春"), cell("风", "accepted"))]),
      step("用「风」继续生成", "下一轮输入换成「风」，追加 KV·风后得到「入」。这一过程反复进行，直到结束符或其他停止条件。", [row("下一轮计算", cell("风", "active")), row("继续增长", cell("输入 KV"), cell("KV·春"), cell("KV·风", "active")), row("继续追加", cell("春"), cell("风"), cell("入", "accepted"))]),
    ],
    note: "示例采用普通自回归生成；每轮由调度器安排，输出可同时流式返回。", result: "新 token 追加到输出；生成仍可继续，客户端不必等整句完成。",
    next: { stage: "output_return", label: "输出返回", action: "回看同时发生的" }, reference: optimization,
  },
  speculative: {
    context: "请求 A · 可选的推测解码 · 贪心示例", purpose: "先提出多个候选，再由目标模型验证，减少逐 token 执行的轮数。",
    lanes: ["候选序列", "目标模型验证", "正式输出"],
    steps: [
      step("提出候选", "草稿机制提出「春、风、海、月」。这些只是候选，尚不能作为已确认的输出发送。", [row("等待验证", cell("春", "active"), cell("风", "active"), cell("海", "active"), cell("月", "active")), row("尚未验证", cell("春", "pending"), cell("风", "pending"), cell("海", "pending"), cell("月", "pending")), row("尚未提交", cell("春", "pending"), cell("风", "pending"), cell("入", "pending"))]),
      step("接受连续前缀", "本例接受「春、风」，在「海」处首次不匹配。之后的「月」也作废，不能跳过错误位置单独保留。", [row("本轮候选", cell("春"), cell("风"), cell("海"), cell("月")), row("前两项通过", cell("春", "accepted"), cell("风", "accepted"), cell("海", "rejected"), cell("月", "rejected")), row("等待提交", cell("春", "pending"), cell("风", "pending"), cell("入", "pending"))]),
      step("补正并提交", "目标模型在拒绝位置给出「入」，于是本轮提交「春、风、入」。下一轮从这个已确认的前缀重新提出候选。", [row("旧候选已用完", cell("春"), cell("风"), cell("海", "rejected"), cell("月", "rejected")), row("拒绝处补正", cell("入", "accepted")), row("可正式返回", cell("春", "accepted"), cell("风", "accepted"), cell("入", "accepted"))]),
    ],
    note: "此处以贪心验证说明逻辑；随机采样使用接受概率及修正分布。草稿机制不一定是独立模型。", result: "只提交验证与补正后的序列，未接受的候选不会进入正式输出。",
    next: { stage: "output_return", label: "输出返回" }, reference: { label: "vLLM · 推测解码", url: "https://docs.vllm.ai/en/stable/features/speculative_decoding/" },
  },
  output_return: {
    context: "请求 A · 回看生成期间的流式返回", purpose: "有可返回的文本就逐段发送，让客户端与生成过程同步推进。",
    lanes: ["服务端已生成", "本次发送", "客户端已显示"],
    steps: [
      step("先返回第一段", "服务端得到「春」后，先发送可输出的文本。客户端开始显示时，后续内容还没有全部生成。", [row("已生成一项", cell("春")), row("文本增量", cell("春", "active")), row("开始显示", cell("春", "accepted"))]),
      step("生成与返回交替", "随后生成「风」，只发送新增的文本。客户端保留已显示的「春」，追加为「春风」。", [row("继续生成", cell("春"), cell("风", "active")), row("仅发送增量", cell("风", "active")), row("保留并追加", cell("春"), cell("风", "accepted"))]),
      step("最后一段与结束信号", "后续「入梦」作为一段发送。本例在停止条件满足后附带结束信息，客户端再将这次响应标记为完成。", [row("本例生成结束", cell("春"), cell("风"), cell("入"), cell("梦")), row("最后一段", cell("入梦", "active"), cell("结束信号", "accepted")), row("响应完整", cell("春"), cell("风"), cell("入", "accepted"), cell("梦", "accepted"))]),
    ],
    note: "传输块不一定对应一个 token；解码、缓冲与输出策略会影响分段。非流式请求则汇总后返回。", result: "响应完成后释放请求资源；模型服务继续处理其他请求。",
    next: { stage: "resource_reclaim", label: "资源回收" }, reference: { label: "vLLM · 流式生成示例", url: "https://docs.vllm.ai/en/stable/examples/deployment/async_llm_streaming/" },
  },
  resource_reclaim: {
    context: "请求 A 已结束 · 启用前缀缓存的示例", purpose: "释放请求对资源的占用，同时允许合适的缓存块在被淘汰前复用。",
    lanes: ["请求 A", "KV 块池", "后续请求 B"],
    steps: [
      step("结束请求", "请求 A 已停止生成。先结束它的调度与资源引用；模型权重仍然留在服务中。", [row("不再生成", cell("A 结束", "accepted")), row("仍有引用", cell("完整前缀块"), cell("其他 KV 块")), row("尚未到来", cell("等待新请求", "pending"))]),
      step("释放块引用", "没有其他请求引用的块回到可分配队列。可复用的缓存内容可以暂留，但并不因此永久占用或永久保留。", [row("引用已释放", cell("A 结束", "released")), row("可重新分配", cell("完整前缀块", "active"), cell("其他 KV 块", "released")), row("尚未到来", cell("等待新请求", "pending"))]),
      step("命中则复用", "如果 B 的前缀匹配且缓存块尚未被淘汰，就复用这些块。若已被覆盖或不匹配，B 仍需正常计算输入。", [row("已清理", cell("A 结束", "released")), row("本例命中", cell("完整前缀块", "accepted"), cell("其他 KV 块", "released")), row("跳过命中部分", cell("B 复用前缀", "accepted"), cell("其余输入需计算"))]),
    ],
    note: "块是否可释放取决于引用计数；能否命中还取决于缓存策略与块内容是否仍然有效。", result: "释放的是请求占用；缓存复用有条件，下一条请求仍要经过调度。",
    next: { stage: "scheduling", label: "请求调度" }, reference: prefix,
  },
};
