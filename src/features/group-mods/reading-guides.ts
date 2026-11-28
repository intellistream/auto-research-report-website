import type { Mod, Relation, Source } from "./types";

// Short reading introductions, checked against the frozen official summaries.
// A changed source falls back to its own text instead of inheriting today's guide.
const modGuides: Record<string, {summarySha256:string;text:string}> = {
 "adm": {
  "summarySha256": "b5e88f09c12405ec25460c9b1651d33198a1fd93c9289681e19e2f6eb1fdff60",
  "text": "把各计算进程的调度元数据打包到一次 CPU 组通信，保留原有 token 向量和计算图模式的结果。"
 },
 "ascend-attention-boundary": {
  "summarySha256": "ed282d437b5139f670bd8fcf8f5acfd10939cad40e1231e65b1f5556bc3696bd",
  "text": "提供可开关的昇腾注意力边界组件，并记录不同并发下开启、关闭组件的对照结果。"
 },
 "ascend-quant-toolkit": {
  "summarySha256": "f4e8acb125a083523f92ad2de1f9089987696730656c2e1813a0e765f307f5d7",
  "text": "生成和校验混合精度量化产物，检查元数据及权重分片；运行时启用仍需宿主加载器和算子支持。"
 },
 "betterscale": {
  "summarySha256": "5384966fcaf83b750b05ddf1965933bc38acd0ed866cf1d6e8a2ff400e562f17",
  "text": "协调昇腾多卡推理中的异步执行与状态管理，具体配置随冻结的引擎版本交付。"
 },
 "bidkv": {
  "summarySha256": "ee6902d9eeb0fce7abd54d6cffa82c7900ade7e7a5a762292f4a969c5032a35b",
  "text": "在 KV 缓存受压时选择可抢占请求；策略无法安全决策时回退。"
 },
 "capacity-tuning": {
  "summarySha256": "50f7fd8491c14310b2f07e9f04a81b51ac4e9bd2b2ae2139a4cb6f813e122264",
  "text": "分别设置可同时执行的请求数量和可保留的请求状态数量。"
 },
 "core-attention-boundary": {
  "summarySha256": "ce93f50134cb0afaf42d2e4ea608b05f08496642fc6714e956e74215f7900add",
  "text": "提供可开关的注意力边界搜索组件，并记录启动激活与运行生效事件。"
 },
 "diffspec": {
  "summarySha256": "ce5e5c08b87b10f577dea0a781f86d464b3bf5e4de640a2da212519379d504e5",
  "text": "在推测解码中检索已提交的真实查询，管理草稿 KV 缓存，并排除填充项和被拒绝的草稿后缀。"
 },
 "dla": {
  "summarySha256": "e818f7db714bc5702114261ef9670cd5a295ca4192ec0f264a4beddb01079c89",
  "text": "根据已知的输出长度预算检查请求能否进入执行；已测版本尚未触发延后和抢占。"
 },
 "gdn-state-codec": {
  "summarySha256": "e80d9622daf85ddf44d1ce2a1e7b5cf0c3fd8d9bf0b44ace5bc276c8d5f16bca",
  "text": "提供可选的循环状态压缩与恢复插件，通过扩展管理器启用，默认关闭。"
 },
 "graph-coverage": {
  "summarySha256": "f16de9b608b8398ad5341be9fca1fa0718c3e20fdcf541795c9d4d87d0d54f51",
  "text": "在引擎启动前配置原生计算图捕获尺寸，使捕获范围覆盖实际的查询 token 批次。"
 },
 "guarded-progress-async": {
  "summarySha256": "fc0cd17b0a79dae119fd2d29c0368a841f800788332690a6fa5203e9663e81ed",
  "text": "在主机到设备的异步进度复制中，检查源状态的所有权和生命周期。"
 },
 "hust-joint-packed": {
  "summarySha256": "33e1f43ddead4fa889a32b8e9ebe76d9c5e0fd5f7deca270c4a59c375c133f3b",
  "text": "在每个计算进程 4 GiB 的主机状态预算内，按对象和数据类型合并锁页内存分配。"
 },
 "hust-m01-correction": {
  "summarySha256": "57b9ce34f504a943b36f39ce2a504937f18a610473930918fd84fc773d2078ed",
  "text": "通过引擎 worker 校正请求状态，并校验活动快照；随整套冻结引擎交付。"
 },
 "intern-s2": {
  "summarySha256": "bd9497a0f76725a7c424c1c08f70deed0443dd803247c73dd9934ebbcd732266",
  "text": "为 Intern-S2 接入专用 worker、词表检查和昇腾请求准入支持。"
 },
 "kv-materialization-arrival-control": {
  "summarySha256": "2557258efb2ca8e9bf839fb99495e5c171b1e818eca616ebd0aa889107295cff",
  "text": "在请求到达时，选择完整复用 KV、按块部分复用，或重新计算。"
 },
 "kv-transfer-observability-migration": {
  "summarySha256": "af55c8d3be0eb842fbd107875613416f2275716424536caa58eb7301ca1b8d5f",
  "text": "把 KV 传输、重新入队、准入和首次计算的回执按身份串联，检查恢复链的完整性与身份唯一性。"
 },
 "kvcompress-ascend": {
  "summarySha256": "39ec827008c9637d7e226ce0318c01c09fb4915e8aabceb0ed7ee52b6e95b400",
  "text": "为昇腾提供 KV 状态转换和压缩接口，并适配已测配置中的混合缓存、前缀复用和推测解码。"
 },
 "latchmoe": {
  "summarySha256": "f103462dceca4c6a4e245e474bb8e9f3b87552983cbce3d03ee070c5a0567476",
  "text": "卸载混合专家模型的专家权重；目前功能验证限于昇腾单卡的固定执行模式。"
 },
 "llm-serving-cost-pricing-model": {
  "summarySha256": "8c09fbced461826b9fe3ed029e3c0d34e434c032d2a9e4e4ac1d43870ca34d38",
  "text": "通过离线命令行工具估算推理服务的成本与定价，提供可检查的分析脚手架。"
 },
 "memory-tracker": {
  "summarySha256": "5c0d33b26b848de5eb23d94ec090ea6c37c58e839d931f3486be9eec7ff6dc10",
  "text": "记录昇腾计算图捕获期间的显存分配，并导出可在 Perfetto 中查看的时间线。"
 },
 "muxpd": {
  "summarySha256": "a5cf52a67707cac871611239e2ff88075cf64235fc71ce92bfbd4c149aac7247",
  "text": "让完整输入的预填充按模型层推进，同时由独立的解码执行器持续生成 token；属于默认关闭的实验性组件。"
 },
 "pegaflow-vllm-connectors": {
  "summarySha256": "c7b7753f829a2a07a310cdff37393a906c71f12dbe14783df3be5c0df5536ba8",
  "text": "把宿主接入外部 PegaFlow 服务，在昇腾上保存和加载 KV；外部服务不可用时拒绝继续执行。"
 },
 "pipeline-microbatch-migration": {
  "summarySha256": "b5e84aa548c2ceb2a89aba56e78fe6a7604bb51499b9fde37f1474614aecc465",
  "text": "提供流水并行微批次调度的研究组件，涉及调度器、执行器、通信、KV 和 worker。"
 },
 "prefill-admission": {
  "summarySha256": "f05d79fafdbc323c0860bde16d39066a53345a17470d58471f98697b9976e370",
  "text": "通过原生长输入预填充阈值，让短请求也能进入执行，同时保留每步总 token 预算。"
 },
 "prefix-router-migration": {
  "summarySha256": "62c89c679f756666c67dd302ae4da10dbac93546fca5260aa22fd146f3fb5fb1",
  "text": "结合请求前缀、缓存生命周期事件和后端负载选择服务端点，并提供转发与健康检查。"
 },
 "pyramidkv-ascend-migration": {
  "summarySha256": "0d40c4bbeb82973182e52b93671cd1bfc515361894e6d87dec58f600a7c6ccf6",
  "text": "根据查询窗口打分，在不同模型层保留不同数量的 KV，通过共享的昇腾压缩适配器启用。"
 },
 "quantized-kv-cache-migration": {
  "summarySha256": "a40787a23786f6a275b0c02ec18b9421b8d7ff505ce7d6729e3e69a445b39598",
  "text": "提供动态 INT8 KV 缓存量化插件；当前组件试验与完整模型启用的条件分别记录。"
 },
 "request-lifecycle-profiler": {
  "summarySha256": "25a8b4762ee9eeb47925f1a10120523f6d4e02561476be17c3fe1a1fd65f28bd",
  "text": "订阅真实的请求完成、抢占和 KV 回收事件，记录请求级生命周期及归因证据。"
 },
 "sealed-serving-warmup": {
  "summarySha256": "c00379a4241c0e8fc9f6f3fb6b659d46280f7e79de94482057cc57e33a08e98f",
  "text": "在服务就绪前预热规定形状，并拦截正式请求阶段未预热的 Torch 或 Triton 编译。"
 },
 "short-prefill-tail": {
  "summarySha256": "1f7870e7c88c1c1b0c2cfddd238cee4244c083d9502b20a5cd8bad3cfa8048da",
  "text": "优先执行满足资格条件、长度为 1–256 token 的预填充尾段。"
 },
 "simllm-migration": {
  "summarySha256": "9058b863f3ec93345a85221162f84a5b2deda58952c02a5a2ce419025d30bd50",
  "text": "按任务相似度匹配可复用的 KV 快照，在 worker 侧恢复 KV 及混合状态；默认关闭。"
 },
 "slicegpt-migration": {
  "summarySha256": "54f6b18f28719bfb659f3794575460f0af5e48aa5881d55dfbafbc8370e6a7f9",
  "text": "转换 SliceGPT 剪枝产物，并提供可选的运行时加载器、格式与兼容性检查。"
 },
 "state-page-copy": {
  "summarySha256": "c481c4049b40543354fde5ebecd82df2e87defa34a296c0353bb914d76b08473",
  "text": "为 Qwen 和 Intern-S2 的 worker 适配共用状态存储与状态页复制路径。"
 },
 "traceloom": {
  "summarySha256": "d8d96ebc878430e69c46c17b6a80f9b80d44d4c5255538f645f6b6adc914b5c3",
  "text": "把推理性能分析时间线中的事件关联到调度步骤，帮助查看执行过程。"
 },
 "unified-communication-migration": {
  "summarySha256": "4aabee8fd52611c211a13291eabe7a6ed9074883850feb9e4093f016f650079e",
  "text": "以统一接口调用不同设备的集合通信，复用宿主已有的通信器和进程组。"
 },
 "vllm-hust-extension-manager": {
  "summarySha256": "a48688d15a9c6aea9e9f6eb4178674e470f0b2c1e77d6dab16ec43eda7d6e1bc",
  "text": "统一发现、检查、配置和启用 MOD，并管理扩展的运行条件。"
 },
 "vllm-hust-opset": {
  "summarySha256": "16cb2a3bbc8403e3d4c54d10b6f6a12dd3c93e6d775e1f57ea318b168faac0df",
  "text": "提供可独立启用的算子优化，消除矩阵乘的冗余清零，并融合 Linear 与 SwiGLU。"
 }
};
const communityGuides: Record<string, {contentSha256:string;text:string}> = {
 "github:vllm-project/vllm-ascend#19708": {
  "contentSha256": "f08a9e79719cfa360e1022cb2f26b3ea1b14770133a1ba56794f1737083721df",
  "text": "根据会话和模型身份稳定选择预填充端点，让同一会话的后续请求尽量回到原端点。"
 },
 "github:vllm-project/vllm-ascend#19976": {
  "contentSha256": "3aa4cbcab80ee83da67a92c04f1dcc98d3d1fb0337e63adee86d51441016ca59",
  "text": "把算子需要的编译参数统一登记，在计算图捕获前集中预热，并支持并行编译。"
 },
 "github:vllm-project/vllm-ascend#21191": {
  "contentSha256": "615bc76cb2a83e0891307815b526b8bb75557076e24b13512dccddea5fd4f7fa",
  "text": "直接复用设备端已有的查询边界，省去重复的主机到设备复制。"
 },
 "github:vllm-project/vllm#54625": {
  "contentSha256": "887c26e337f469980fe024a267e5eeee10b43c946261f53f096a47ff11cde814",
  "text": "在有限的等待窗口中，优先安排能复用更多 GPU 前缀缓存的请求，并保留既有阻塞规则。"
 },
 "github:vllm-project/vllm#59774": {
  "contentSha256": "8087ef091c1d9d0c00b98772dc423cfb11e90ca1aa7a256d38ad51050f80fac1",
  "text": "为指定 AMD GPU 增加 3 位或 4 位 KV 缓存表示，并提供能够读取这种格式的注意力内核。"
 },
 "github:vllm-project/vllm#60130": {
  "contentSha256": "a3afec872b9d375ade17786fb38e0620453ce12609b71df5c1bdc2371c4d16b9",
  "text": "在每个计算进程内用一份主机内存映射组织多个 KV 张量，并统一处理页对齐、注册和释放。"
 },
 "github:vllm-project/vllm#61589": {
  "contentSha256": "9b670f8a287bb703c1fb51ef8021bfacc884309ac0067193bdc0f8d1cebf4fee",
  "text": "把缓存块依赖的后续 token 纳入匹配标识，减少本地前缀复用中可避免的重算；配置 KV 连接器时仍使用旧路径。"
 },
 "github:vllm-project/vllm#66052": {
  "contentSha256": "0c128dfc86d23982d4ee1f87c95b4effde153b454a5c3598b1d5081fb5e20339",
  "text": "每步准备独立的主机索引数据，并保留到异步复制完成，避免下一步覆盖尚未读完的内容。"
 },
 "github:vllm-project/vllm#66558": {
  "contentSha256": "8985081dc6beb26afb0e1d12d48f036fa8b0c41d778860f50c30bcbe990f4fe2",
  "text": "把单个 CPU 缓存层中的预计命中也纳入准入排序，查询本身不触发传输或修改缓存。"
 },
 "github:vllm-project/vllm#67489": {
  "contentSha256": "3c61c065c1d3da58efa6dc3cd34a570b02bb2334b4979308502bed06cde7359f",
  "text": "在指定 MLA 解码路径超出图捕获范围时，避免分配未使用的临时缓存；没有把请求拆小。"
 },
 "github:vllm-project/vllm#69401": {
  "contentSha256": "cd2c145bd6a0b887d812fc8fbd30271b99dcadff17d3f2aa10a99d899c6c4c04",
  "text": "只保存后续计算实际使用的 GDN 预填充检查点，跳过未使用状态的写入。"
 },
 "paper:arxiv:2402.02750": {
  "contentSha256": "3619073693a06959b42a36830f846c7b9325c71e7124ab19ceb83791e2be58c7",
  "text": "针对 Key 和 Value 采用不同的量化维度，并保留近期的全精度状态。"
 },
 "paper:arxiv:2502.04677": {
  "contentSha256": "4182f6a11c0db60fb2b2886f9d4bfd9f3c674542d1b1fe1e1918be80cdc41f02",
  "text": "在服务队列中交替选择最老请求和前缀优先请求，研究等待时间与前缀复用的取舍。"
 },
 "paper:arxiv:2604.25080": {
  "contentSha256": "e90ad9223c2e5953b322c08fc4ec0bec97112d4d6d77bb5fff02fcacb23cf21f",
  "text": "按 token 和模型层的缓存块组织恢复，并跨一批请求规划计算与数据读取。"
 }
};

export function modIntroduction(mod:Mod) {
 const guide=modGuides[mod.componentId];
 return guide&&guide.summarySha256===mod.fieldHashes.summary_zh?guide.text:mod.facts.summary;
}
export function communityIntroduction(source:Source,relation:Relation) {
 const guide=communityGuides[source.canonicalWorkId];
 return guide&&guide.contentSha256===source.contentSha256?guide.text:relation.communityApproach;
}
export function dailyReferences(source:Source) {
 const rows=(source.reportReferences||[]).filter(ref=>["daily_main","daily_reference"].includes(ref.role)&&/^\/reports\/\d{4}-\d{2}-\d{2}\?/.test(ref.href));
 return [...new Map(rows.map(ref=>[ref.href,ref])).values()].sort((a,b)=>Number(a.role==="daily_reference")-Number(b.role==="daily_reference"));
}
export function topicReferences(source:Source) {
 return [...new Map((source.reportReferences||[]).filter(ref=>ref.role==="topic"&&ref.href.startsWith("/topics/")).map(ref=>[ref.href,ref])).values()];
}
export function dailyReferenceLabel(ref:NonNullable<Source["reportReferences"]>[number]) {
 return "阅读日报解读 · "+(ref.day||ref.title.replace(/^日报\s*/,""))+(ref.entryNumber?" · "+ref.entryNumber:"")+(ref.role==="daily_reference"?"（正文附加引用）":"");
}

// Pair-specific boundaries are tied to the source and the reviewed relationship.
const boundaryGuides: Record<string,{binding:string;mod:string;community:string}> = {
 "rel-core-boundary-21191": {
  "binding": "[\"615bc76cb2a83e0891307815b526b8bb75557076e24b13512dccddea5fd4f7fa\",\"candidate\",{\"state\":\"unknown\",\"checks\":[{\"dimension\":\"同一调用点\",\"mod\":\"未从公开摘要证明\",\"community\":\"PR说明提供路径\",\"result\":\"unknown\",\"dimensionId\":\"interface_contract\"}]},[\"MOD 计算 decode/extend/prefill 的 CPU 切分，PR 去掉设备元数据的重复 H2D，控制对象不同。\",\"MOD 固定在 vLLM 0.23.x，PR 的固定调用栈与缓冲生命周期尚未证明可直接组合。\",\"正式窗口的分支生效证据是 MOD 自身待办，不能由该 PR 推导为共同研究问题。\"]]",
  "mod": "正式测试窗口的分支生效证据仍待补齐。",
  "community": "移除的是设备元数据拷贝，尚未确认与 MOD 的 CPU 切分可以组合。"
 },
 "rel-diffspec-61589": {
  "binding": "[\"9b670f8a287bb703c1fb51ef8021bfacc884309ac0067193bdc0f8d1cebf4fee\",\"supported\",{\"state\":\"incompatible\",\"checks\":[{\"dimension\":\"prefix caching\",\"mod\":\"disabled in qualified profile\",\"community\":\"enabled for affected path\",\"result\":\"incompatible\",\"dimensionId\":\"APC\"},{\"dimension\":\"KV connector\",\"mod\":\"本轮未确定组合\",\"community\":\"configured时保留legacy hashes\",\"result\":\"unknown\",\"dimensionId\":\"connector\"}]},[\"一个当前配置禁用APC，另一个修改APC命中身份。\",\"历史合并PR的端到端结果不等于拆分PR当前提交的复测结果。\"]]",
  "mod": "当前通过功能回归的配置关闭了前缀缓存与异步调度。",
  "community": "只覆盖适用方法的本地前缀缓存；配置 KV 连接器时保留旧路径。"
 },
 "rel-gdn-69401": {
  "binding": "[\"cd2c145bd6a0b887d812fc8fbd30271b99dcadff17d3f2aa10a99d899c6c4c04\",\"supported\",{\"state\":\"partially_comparable\",\"checks\":[{\"dimension\":\"处理对象\",\"mod\":\"GDN 循环状态表示\",\"community\":\"GDN prefill 检查点写入计划\",\"result\":\"different\"},{\"dimension\":\"宿主后端\",\"mod\":\"Ascend 编解码器\",\"community\":\"CUDA/FlashInfer slots\",\"result\":\"incompatible\"},{\"dimension\":\"正确性结果\",\"mod\":\"精确输出尚未验收\",\"community\":\"作者报告使用状态bitwise相等\",\"result\":\"different\"}]},[\"PR 优化 prefill 检查点写入数量，MOD 改变循环状态表示。\",\"硬件、模型、后端和阶段不同，34%内核降时不能作为 MOD 成绩。\",\"MOD 当前资格失败，不能把未来组合写成已可部署能力。\"]]",
  "mod": "当前版本尚未通过性能资格验收，精确输出与并发回退仍需验证。",
  "community": "减少检查点写入数量，没有改变状态表示；CUDA 后端结果需单独看待。"
 },
 "rel-graph-67489": {
  "binding": "[\"3c61c065c1d3da58efa6dc3cd34a570b02bb2334b4979308502bed06cde7359f\",\"unsupported\",{\"state\":\"unknown\",\"checks\":[{\"dimension\":\"同一调用点\",\"mod\":\"没有 FA3 MLA 证据\",\"community\":\"FlashAttnMLAMetadataBuilder._build_decode\",\"result\":\"unknown\"}]},[\"平台和实现位置不同。\",\"扩大捕获范围不等于该 PR 的范围外缓冲策略。\"]]",
  "mod": "扩大捕获规格会增加图内存与启动成本。",
  "community": "作用于 CUDA MLA 的范围外缓冲分支，本轮已否定与此 MOD 的方法关联。"
 },
 "rel-guarded-66052": {
  "binding": "[\"0c128dfc86d23982d4ee1f87c95b4effde153b454a5c3598b1d5081fb5e20339\",\"supported\",{\"state\":\"partially_comparable\",\"checks\":[{\"dimension\":\"安全契约\",\"mod\":\"确认有源所有权/生命周期检查；内容不变契约尚未从公开摘要证明\",\"community\":\"跨步源内容不变且暂存存活至完成\",\"result\":\"unknown\"},{\"dimension\":\"执行对象\",\"mod\":\"引擎进度状态\",\"community\":\"DSA ShardQ 索引元数据\",\"result\":\"different\"},{\"dimension\":\"性能归因\",\"mod\":\"r8 组合\",\"community\":\"特定 AMD 竞态复现\",\"result\":\"unknown\"}]},[\"MOD 复制进度状态，PR 复制 DSA 索引与 query ranges。\",\"存活不等于内容不变，公开 MOD 摘要不足以证明已经覆盖后一契约。\",\"AMD 复现不能证明 Ascend 或 CUDA 的故障与修复效果。\"]]",
  "mod": "检查源状态的所有权与生命周期；公开摘要尚未证明同时保证跨步内容不变。",
  "community": "处理的是索引和查询范围；AMD 上的修复结果尚未在昇腾宿主复现。"
 },
 "rel-kvm-54625": {
  "binding": "[\"887c26e337f469980fe024a267e5eeee10b43c946261f53f096a47ff11cde814\",\"supported\",{\"state\":\"partially_comparable\",\"checks\":[{\"dimension\":\"控制位置\",\"mod\":\"逐请求物化选择\",\"community\":\"准入前等待队列重排\",\"result\":\"different\"},{\"dimension\":\"宿主与硬件\",\"mod\":\"Ascend/Qwen3.5 与独立 Qwen2.5 研究\",\"community\":\"ROCm/MI355X/Kimi-K3\",\"result\":\"incompatible\"}]},[\"排序与恢复选择属于不同控制量。\",\"GPU 驻留命中与外部 CPU 命中要分开；命中计数不是传输耗时。\",\"PR 文字阈值 0.0 与固定代码 0.5 不一致，实验必须显式固定阈值。\"]]",
  "mod": "控制逐请求的复用或重算选择，尚未证明实现该 PR 的排队次序。",
  "community": "排序依赖驻留 GPU 前缀；窗口、缓存压力及公平性会影响结果。"
 },
 "rel-kvm-66558": {
  "binding": "[\"8985081dc6beb26afb0e1d12d48f036fa8b0c41d778860f50c30bcbe990f4fe2\",\"supported\",{\"state\":\"partially_comparable\",\"checks\":[{\"dimension\":\"控制位置\",\"mod\":\"scheduler中的恢复决策\",\"community\":\"准入窗口排序\",\"result\":\"different\",\"dimensionId\":\"control_layer\"},{\"dimension\":\"模型与硬件\",\"mod\":\"Qwen3.5 Ascend TP2等分立设定\",\"community\":\"CPU测试及模拟，未完成GPU实测\",\"result\":\"incompatible\",\"dimensionId\":\"hardware_backend\",\"resultOriginal\":\"incompatible_for_performance\"}]},[\"MOD处理恢复选择，PR处理等待队列次序。\",\"命中估计可包含在途状态，不能直接当作加载完成。\"]]",
  "mod": "逐请求选择完整复用、部分复用或重算；不同模型的观察分别记录。",
  "community": "当前为草稿，限单个 CPU 缓存层；预计命中不等于加载已完成。"
 },
 "rel-kvm-cacheflow": {
  "binding": "[\"e90ad9223c2e5953b322c08fc4ec0bec97112d4d6d77bb5fff02fcacb23cf21f\",\"supported\",{\"state\":\"unknown\",\"checks\":[{\"dimension\":\"接口可表达性\",\"mod\":\"本轮未核查层级计划接口\",\"community\":\"需要层块及边界状态\",\"result\":\"unknown\",\"dimensionId\":\"interface_contract\"}]},[\"恢复粒度不同；是否能迁移必须核对宿主能暴露的状态和层边界。\"]]",
  "mod": "公开资料确认逐请求恢复选择，更细的规划粒度尚未核实。",
  "community": "采用固定论文版本的方法作为参照，尚未在该 MOD 中复现。"
 },
 "rel-packed-60130": {
  "binding": "[\"a3afec872b9d375ade17786fb38e0620453ce12609b71df5c1bdc2371c4d16b9\",\"supported\",{\"state\":\"partially_comparable\",\"checks\":[{\"dimension\":\"数据对象\",\"mod\":\"引擎状态\",\"community\":\"CPU KV缓存\",\"result\":\"different\",\"dimensionId\":\"precision_representation\"},{\"dimension\":\"独立归因\",\"mod\":\"只有整套引擎范围\",\"community\":\"PR分版本验证\",\"result\":\"unknown\",\"dimensionId\":\"attribution_scope\"}]},[\"MOD是引擎组合中的状态分配，PR是KV卸载连接器。\",\"MOD仅登记组合验证，缺单项消融。\"]]",
  "mod": "每个计算进程预算 4 GiB，现有验证覆盖整套引擎，缺少单项消融。",
  "community": "适用于 CUDA 的 KV 卸载路径，不能直接替换昇腾的锁页注册接口。"
 },
 "rel-quant-kivi": {
  "binding": "[\"3619073693a06959b42a36830f846c7b9325c71e7124ab19ceb83791e2be58c7\",\"supported\",{\"state\":\"incompatible\",\"checks\":[{\"dimension\":\"算法已实现关系\",\"mod\":\"目录明确KIVI在后续迁移范围\",\"community\":\"论文方法\",\"result\":\"incompatible\",\"dimensionId\":\"implementation_status\",\"resultOriginal\":\"not_implemented_equivalence\"}]},[\"位宽、表示格式和算子路径不同。\"]]",
  "mod": "当前是动态 INT8 组件，尚未实现 KIVI；整模接入条件仍需核对。",
  "community": "论文采用不同的低位表示与近期全精度区域，论文结果不能作为 MOD 成绩。"
 },
 "rel-quant-octave": {
  "binding": "[\"8087ef091c1d9d0c00b98772dc423cfb11e90ca1aa7a256d38ad51050f80fac1\",\"supported\",{\"state\":\"incompatible\",\"checks\":[{\"dimension\":\"设备与实现\",\"mod\":\"Ascend/INT8\",\"community\":\"AMD HIP/3–4 bit\",\"result\":\"incompatible\",\"dimensionId\":\"hardware_backend\"},{\"dimension\":\"评测口径\",\"mod\":\"功能与组件证据分立\",\"community\":\"多种容量、质量与服务测量\",\"result\":\"different\",\"dimensionId\":\"baseline\",\"resultOriginal\":\"not_same_protocol\"}]},[\"硬件后端、位宽和内核均不同。\",\"MOD的Qwen2.5服务验证与R10组件试验也不是同一设定。\"]]",
  "mod": "当前为昇腾 INT8 路径，组件试验与服务验证属于不同配置。",
  "community": "仅覆盖指定 AMD 架构和低位内核；容量、质量与速度收益需要分别比较。"
 },
 "rel-router-19708": {
  "binding": "[\"f08a9e79719cfa360e1022cb2f26b3ea1b14770133a1ba56794f1737083721df\",\"supported\",{\"state\":\"partially_comparable\",\"checks\":[{\"dimension\":\"部署位置\",\"mod\":\"独立Router\",\"community\":\"load-balance proxy\",\"result\":\"different\",\"dimensionId\":\"deployment_position\",\"resultOriginal\":\"related\"},{\"dimension\":\"对照指标\",\"mod\":\"历史条件下有配对观察\",\"community\":\"未宣称受控吞吐或命中率收益\",\"result\":\"unknown\",\"dimensionId\":\"metrics_quality\",\"resultOriginal\":\"insufficient_for_performance\"}]},[\"前者依赖缓存事件与运行时契约，后者依赖稳定会话身份。\",\"会话亲和不能保证淘汰或重启后的缓存命中；MOD新R10档缺真实事件，不继承历史配对。\"]]",
  "mod": "依赖可靠的 KV 缓存事件；冻结 R10 版本仍缺所需实际事件。",
  "community": "同一会话不保证缓存仍在，淘汰和后端重启都可能使亲和失效。"
 },
 "rel-router-klpm": {
  "binding": "[\"4182f6a11c0db60fb2b2886f9d4bfd9f3c674542d1b1fe1e1918be80cdc41f02\",\"candidate\",{\"state\":\"unknown\",\"checks\":[{\"dimension\":\"可迁移位置\",\"mod\":\"后端选择\",\"community\":\"请求处理顺序\",\"result\":\"unknown\",\"dimensionId\":\"control_layer\"}]},[\"控制变量和调度层不同。\"]]",
  "mod": "控制多后端路由，尚未确认能控制后端服务队列。",
  "community": "控制的是队列次序，本轮只作为待核查的公平性线索。"
 },
 "rel-warmup-19976": {
  "binding": "[\"3aa4cbcab80ee83da67a92c04f1dcc98d3d1fb0337e63adee86d51441016ca59\",\"supported\",{\"state\":\"unknown\",\"checks\":[{\"dimension\":\"运行时版本\",\"mod\":\"B1 r8组合\",\"community\":\"Ascend PR head已固定\",\"result\":\"different\",\"dimensionId\":\"runtime_revision\",\"resultOriginal\":\"not_same_profile\"},{\"dimension\":\"形状覆盖契约\",\"mod\":\"需核对冻结形状\",\"community\":\"需核对声明注册范围\",\"result\":\"unknown\",\"dimensionId\":\"interface_contract\"}]},[\"预热准备和正式阶段拒绝未覆盖编译是不同职责。\",\"MOD公开证据是B1 r8组合验证，单项成本未知。\",\"PR说明给出42-key编译及固定DSV4-Flash配置的验证；这些作者报告不能替代B1 r8中该MOD的独立计时或形状覆盖验收。\"]]",
  "mod": "正式请求阶段会拦截未预热编译；目前只有冻结引擎的组合验证。",
  "community": "统一登记和准备编译键，没有提供覆盖所有正式请求的编译封锁。"
 }
};
export function comparisonBoundaries(relation:Relation,source:Source|undefined) {
 const guide=boundaryGuides[relation.id];
 const binding=JSON.stringify([source?.contentSha256,relation.reviewStatus,relation.applicability,relation.differences]);
 if(guide&&guide.binding===binding)return {mod:guide.mod,community:guide.community};
 return undefined;
}
