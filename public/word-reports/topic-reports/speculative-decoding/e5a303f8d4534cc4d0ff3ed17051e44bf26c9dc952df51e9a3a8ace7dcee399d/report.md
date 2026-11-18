# Speculative Decoding：候选生成、验证预算与合法状态的系统协同

资料截至 2026-11-17 · 修订 1

## 摘要

推测解码以廉价候选换取目标模型的多位置验证，从而减少自回归推理中昂贵的串行前向。其性能上限同时取决于候选的条件质量、Target Verify 的长度相关成本，以及接受采样、KV/递归状态提交与运行时调度。本文以 vLLM、vLLM-Ascend、Speculators 的官方实现为工程主线，结合 Blockwise Decoding、EAGLE-3、DFlash、DSpark 和 HybridSpec 等算法工作，分析推测轮次的正确性合同、Draft 的串行与并行设计、动态验证预算及 GDN-MoE 混合模型的状态重构。社区归档的 105 条 PR 提供持续观察窗口，其中具有完整机制和条件描述的实现用于比较。综合发现，较高接受率并不保证更低 TPOT；只有把 Draft、Verify、Sampling、State 和 Host/Device 交互放在相同关键路径上，才能解释加速的成立条件。报告进一步提出动态验证、合法状态与图缓存协同等有明确验证方案的研究问题。

## 研究问题

1. 在保持 Target 采样分布与已接受前缀合法性的前提下，推测执行究竟替换了哪部分串行成本？
2. Lookup、EAGLE/MTP 与 DFlash/DSpark 在候选质量、生成深度和 KV 占用上的根本权衡是什么？
3. 验证长度如何随候选存活概率、Batch 规模和 MoE Router 工作量变化，何时应放弃额外候选？
4. GDN/Mamba/KDA 的 Verify 临时状态如何与 Accepted State 分离，并在 Graph、Prefix Cache 和 P/D 场景下正确提交？
5. 哪些 Runtime 优化已证明局部机制有效，如何通过统一的关键路径测量检验其真实 Serving 收益？

## 研究范围与方法

**问题驱动的持续演进技术综述**

以推测轮次（Draft、Target Verify、Acceptance、State Commit）及其 Serving 执行边界为直接对象。论文范围包括早期分布保持与树验证、EAGLE 系、块并行 Drafter、动态验证以及 Hybrid GDN-MoE 推测执行。工程范围是 vLLM、vLLM-Ascend 与 Speculators 官方文档、主要源码接口和代表性实现 PR；SGLang 仅作运行时背景对照。网站既有 vLLM/vLLM-Ascend 专题索引来自 2026-10-22 至 2026-11-11 的 21 期日报，包含经社区分类的 105 条 PR（vLLM 68、Ascend 37）。研究增补核对原始论文和代表 PR 至 2026-11-17，不改变日报原标签与收录。

按正确性→Drafter→Verify Budget→State→Serving 五个环节建立检索和阅读顺序。先读经典 Speculative Sampling、EAGLE-3、DFlash/DSpark、HybridSpec 的原始论文；再核查 vLLM、vLLM-Ascend 与 Speculators 官方文档/实现，重点追踪 Scheduler、Proposer、Sampler、Graph 与 Cache State 的职责；最后沿归档索引阅读原始 PR，检查机制、硬件环境、版本、运行形状及合入状态。论文用于解释算法合同，源码和 PR 用于解释工程可行性；不同日期的资料分别保留版本语境。

以单轮合法输出和端到端关键路径为共同坐标，比较各方法减少的串行依赖、引入的验证/状态代价及软硬件前提。技术分类来自机制而非日报标签；代表 PR 的实验仅用于支撑对应局部结论。Research Gaps 从已知技术的交界条件提出可证伪问题，并用后续社区更新修正。

### 资料纳入

- 保留原专题全部 105 条社区分类 PR，作为方法演进与相邻系统依赖的工程线索。
- 技术综合优先采用有明确算法合同、执行路径或可归因实验条件的原始论文、官方实现及 PR。
- 技术路线同时记录适用形状、缓存/状态条件和运行时成本，不以方法名称替代机制。

### 结论使用边界

- 不从专题索引删除相关性较间接的 PR，但不把通用 Runtime 改造写成直接的推测算法创新。
- 不把跨模型、跨设备、跨版本的性能数字拼接为统一加速结论，也不把作者微基准解释为在线服务收益。
- 对开放中的实现、未报告的兼容组合及缺少原始对照的收益不作生产可用性推断。

## 技术路线与关键权衡

| 技术问题 | 主要路线 | 机制代价 | 来源 |
|---|---|---|---|
| 候选生成的串行依赖与条件质量 | 历史 Lookup；独立小模型与 EAGLE/MTP 自回归草稿；DFlash/DSpark 块并行与半自回归草稿 | Lookup 开销低而依赖重复；AR 草稿改善条件信息却仍需多步执行；块并行降低深度但可能降低长前缀存活率。 | [P5](#ref-P5) · [P6](#ref-P6) · [P7](#ref-P7) · [P8](#ref-P8) · [D3](#ref-D3) |
| 验证位置选择与动态计算预算 | 固定 Spec Depth → 位置存活概率驱动的 Adaptive Verification → Router-aware 分阶段验证 | 较大的 K 会增加无效 Query Rows；成本同时由 Batch、Attention、MoE Expert 负载、图桶和预算选择器决定。 | [D4](#ref-D4) · [P8](#ref-P8) · [P9](#ref-P9) · [E2](#ref-E2) · [E3](#ref-E3) |
| 合法前缀与目标分布保持 | 逐位置 Acceptance、拒绝后的正残差重采样、全部接受后的 Bonus；树提案的祖先条件约束 | Greedy 一致、概率精确、近似验证必须分开；Token 正确还需保证 KV/State 读取合法。 | [P1](#ref-P1) · [P2](#ref-P2) · [P3](#ref-P3) · [P4](#ref-P4) |
| Hybrid Recurrent State 的正确提交 | 合法 Checkpoint、Accepted-State Reconstruction、RecoverSSM、Lookahead Hash 与延迟 Commit | 被拒绝分支、跨轮状态和 Prefix/P-D 生命周期互相制约；异步优化不能跨越状态所有权边界。 | [P9](#ref-P9) · [E5](#ref-E5) · [E7](#ref-E7) · [E11](#ref-E11) · [E12](#ref-E12) |
| Draft/Verify 的 Graph 与 Host 关键路径 | 多步 Draft Graph、可变长度 Verify Graph、ACLGraph Rejection Sampling 和 Metadata Fusion | 图覆盖、动态 Shape、Host Launch、Kernel Fusion 与 Graph 常驻资源需要联合评价；局部提速未必传递到 TPS。 | [E1](#ref-E1) · [E8](#ref-E8) · [E9](#ref-E9) · [E11](#ref-E11) · [E17](#ref-E17) |
| Drafter/Target KV 容量及跨实例状态恢复 | Draft Tail KV、Prefix Lookahead 身份、无用 Draft 跳过、Hybrid P/D Checkpoint 迁移 | Draft KV、Target KV、SSM State 与 Workspace 争用容量；容量和恢复 TTFT 不等价于单轮 Verify 加速。 | [E5](#ref-E5) · [E6](#ref-E6) · [E14](#ref-E14) · [E15](#ref-E15) |

## 机制分析

### 从 Token 接受率到合法轮次的实际收益

自回归解码必须逐步确认 Target Token。SpecDec 允许 Drafter 提前产生多个候选，并使 Target 在一个 Forward 中计算各位置的条件概率；正确的拒绝采样与 Bonus 规则确保在经典概率方案下保持目标分布。因此一次轮次真正有用的是可提交的连续 Token，而非生成的候选总数。

若平均每轮提交更多 Token，但 Draft 与 Target 的附加工作增长更快，单位 Token 的 Critical Path 仍可能变长。动态批次下，Verify Query Rows、Attention KV 带宽、MoE Expert 工作量和 Host 图准备都随宽度变化。成本模型应从 T_round/E[committed_tokens] 出发，再用设备/Host Trace 修正异步重叠与调度空泡。

相关来源：[P1](#ref-P1) · [P2](#ref-P2) · [D1](#ref-D1) · [D4](#ref-D4)

### Drafter：从历史检索与 EAGLE/MTP 到并行块生成

无额外模型的 Lookup 依赖历史重复；独立小模型与 EAGLE/MTP 将更多条件信息注入提案，同时保留 Draft Forward、权重和 KV 开销。EAGLE-3 使用直接 Token Prediction、多层 Target Feature Fusion 与 Training-Time Test，重点改善候选质量，而不自动消除多步 Draft 的序列依赖。

DFlash 在单次轻量块扩散 Forward 中并行提出多位置候选，减少了 Draft 侧顺序步数，但长块后部的候选可能因缺少块内依赖而难以被连续接受。DSpark 在并行 Backbone 上附加 Markov 与 Confidence Head，使候选之间恢复部分依赖，并向验证预算提供位置置信度。方法选择由候选质量、Draft 计算、Target 接受和现有 Runtime 兼容性共同决定。

Speculators 的模型训练、候选采样和 Target 运行时是不同接口层。不能由论文中的速度数字推断在任意 SoC 或 vLLM-Ascend 固定版本均具有相同收益。

相关来源：[P5](#ref-P5) · [P6](#ref-P6) · [P7](#ref-P7) · [P8](#ref-P8) · [D3](#ref-D3) · [E1](#ref-E1)

### Verification Budget：位置存活概率与 Target 计算成本

固定验证宽度向所有请求分配相同 K，而实际候选存活概率沿序列下降。Adaptive Verification 根据各请求位置的累积接受概率分配全局预算，让高价值位置保留更多 Verify Rows；它把验证长度变成运行时资源分配问题，而不再是一个静态超参数。

代价模型必须包含预算估计本身。vLLM #65175 的 XPress Estimator 连接修复说明，缺失位置置信度可能让 Adaptive 策略错误裁剪；#63421 则把 Budget Selection 从动态编译替换为专门 Kernel，解决计算决策自身的 Host/JIT 成本。两项变更共同提示：算法分配、置信度校准与实现开销需要一起计量。

MoE Verify 的实际成本还与 Router 输出和 Expert 分布有关。HybridSpec 提出利用 Router 边界做两阶段验证，并将 GDN 合法状态恢复纳入路径；这是一条 Target-aware Budget 路线，需要与固定 K、普通 AV 及动态 Batch 一起比较。

相关来源：[D4](#ref-D4) · [P8](#ref-P8) · [P9](#ref-P9) · [E2](#ref-E2) · [E3](#ref-E3)

### Hybrid Target：接受前缀与递归状态必须共同合法

Attention KV Cache 按位置保存历史，Recurrent 层则以 GDN/Mamba/KDA 状态总结此前序列。Verify 算过多个候选后，Sampling 可能只接受前 a 个位置；下一轮必须读取对应 Accepted Prefix 的状态，而不能继续使用最后一个已计算候选的中间状态。KV Page、Recurrent Checkpoint 与 Drafter Context 形成三套关联但不等同的生命周期。

Lookahead Hash 要处理 EAGLE/MTP 在块末还依赖下一个 Token 的 Draft KV；RecoverSSM 试图把 State Replay 与采样后提交解耦；Ascend 的 GDN Metadata Fusion 与 Host D2H/Commit Overlap 则分别降低准备和同步开销。它们都不代替逐层、逐位置的合法状态验证。

在 Preemption、Prefix Hit、P/D 迁移或 Graph Replay 后，状态身份还必须覆盖 Request Slot 世代、物理布局与事件顺序。这个问题不属于某个 Drafter 的单独优化，而是 Hybrid SpecDec 的可组合系统合同。

相关来源：[P9](#ref-P9) · [E5](#ref-E5) · [E7](#ref-E7) · [E11](#ref-E11) · [E12](#ref-E12) · [E15](#ref-E15) · [E18](#ref-E18)

### Runtime：图回放、Sampling 与 KV Residency 的关键路径

多步 Draft 与 Rejection Sampling 可能由多个细粒度 Kernel 组成。ROCm AITER 的多步 Draft Graph、Ascend DFlash2 Full ACLGraph 和 Rejection Sampling Graph 分别试图将 Host 调度移出高频路径，但必须保证动态地址、元数据和图捕获模式相容。原始 PR 也说明局部 Draft 时间缩短不必然使 Serving TPS 可辨地增加。

Fixed-width Spec 在请求进入/退出时会出现变长 Query Shape，可能触发图回退。Verifer 的多 Token Attention、Sampling Full Vocabulary Sort 和额外 Draft KV 又把问题扩展到 HBM、峰值 Workspace 与 Batch Planning。高并发下一个修复 OOM 的 PR 和另一个优化 Graph Coverage 的 PR，解释的是不同瓶颈，不能累计为统一 Speedup。

Prefill-only 或临近终止的请求可能根本不消费本轮草稿，跳过无用 Draft 可避免无意义计算但必须维护必要的 Draft Context。Draft Tail KV 与跨 TP Hybrid History Reuse 则把容量和恢复能力纳入服务策略。

相关来源：[E1](#ref-E1) · [E4](#ref-E4) · [E6](#ref-E6) · [E8](#ref-E8) · [E9](#ref-E9) · [E10](#ref-E10) · [E14](#ref-E14) · [E15](#ref-E15) · [E17](#ref-E17)

### 工程演进：从候选优化到完整轮次的成本控制

社区实现呈现三个互相增强的方向：提案端缩短 Draft 顺序执行并提高候选条件信息；Target 侧按存活概率及实际执行形状分配 Verify Budget；Runtime 侧将图调度、Sampling、KV/SSM State 与缓存复用纳入关键路径。这样的路线划分来自算子与状态职责，并不以社区 PR 标签代替技术类别。

局部证据可进一步说明不同层级的因果范围。#63096 报告 Draft Loop Microbenchmark 改善，而 Serving TPS 在测试档位内接近波动；#63421 同时测得 Budget Kernel Host 开销变化和特定 DSpark Serving 结果；#21430 把 Ascend GDN/MTP 的等待定位到 D2H Snapshot 与 RecoverSSM Commit 的次序。三者不是可直接相加的性能收益，却揭示优化应沿哪段关键路径追踪。

当前归档保留 vLLM 与 Ascend 已分类的 105 条相关 PR，包含直接方法、运行时验证路径及邻接优化。它们用于持续发现、溯源与追踪社区进展；具体结论仍依据对应 PR 的源码职责、设备和负载条件确定。

相关来源：[D1](#ref-D1) · [D2](#ref-D2) · [D3](#ref-D3) · [E1](#ref-E1) · [E2](#ref-E2) · [E8](#ref-E8) · [E9](#ref-E9) · [E12](#ref-E12)

### 下一阶段：Hybrid MoE/GDN 与 Adaptive Serving 的共同边界

更强的 Drafter 并没有消除 Target 的验证成本。低并发 Memory-bound 的优化空间与高并发 Compute/Expert-bound 的优化空间可能不同；混合模型还增加了 State Reconstruction 和跨步生命周期，故统一速度排名意义有限。合理的研究路径应先建立正确性、主机/设备关键路径和真实请求形状三个可观测量，再探索新的决策策略。

当前最有价值的交叉问题集中在：在设备成本随请求与路由变化时怎样自适应选择验证宽度；如何将合法状态提交与 Preemption/Prefix Cache/Graph Replay 统一；如何让 Draft/Target KV、图桶和 Scheduler 共享容量预算。它们都有既有论文和工程基础，可通过清晰的配对实验缩小剩余不确定性。

相关来源：[P8](#ref-P8) · [P9](#ref-P9) · [D4](#ref-D4) · [E5](#ref-E5) · [E7](#ref-E7) · [E14](#ref-E14) · [E17](#ref-E17)

## Research Gaps：问题与验证路径

### G1 验证预算与实际 Target 成本的联合校准

**已知条件：** Adaptive Verification 已利用候选存活概率和设备 Profile；GDN/MoE Target 的 Router/Expert 执行成本还与 Token 分布和并发相关。

**研究问题：** 在已有 AV/HybridSpec 强基线之上，能否以低额外开销更准确地选择每请求的 Verify Length？

**验证设计：** 冻结 Target、Drafter 与请求序列，比较 Fixed K、AV 与 Router-aware 策略，记录位置存活率、实际 Query Rows、Router/Expert 负载和 TPOT/Goodput，核算预算选择器的全部成本。

[D4](#ref-D4) · [P8](#ref-P8) · [P9](#ref-P9) · [E2](#ref-E2) · [E3](#ref-E3)

### G2 Hybrid Accepted-State 跨生命周期正确性

**已知条件：** RecoverSSM、Lookahead Hash 和 GDN Metadata 优化分别处理不同阶段；Preemption、Prefix Hit 和 P/D 恢复会重新组合这些约束。

**研究问题：** 能否用明确的 Checkpoint/Commit 契约统一验证被拒绝分支不会污染后续轮次？

**验证设计：** 在同一模型前态下逐层比较 AR 与 Spec 的 KV/SSM State，覆盖 0/部分/全部接受、Bonus、请求复用、Preemption、Prefix Hit、跨实例 Restore 与 Graph Replay。

[E5](#ref-E5) · [E7](#ref-E7) · [E11](#ref-E11) · [E15](#ref-E15) · [E18](#ref-E18)

### G3 动态 Verify Shape 与 Graph Bucket 的联合决策

**已知条件：** Draft、Verify 和 Sampling 各有独立 Graph 路径；动态长度与填充可能增加捕获图数量及常驻 Workspace。

**研究问题：** 什么时候应该调整 Verify Budget 以匹配可复用的图形状，什么时候应走 Eager 回退？

**验证设计：** 相同内存预算下扫描 K、Batch 和 Bucket，分别采集 Host Dispatch、Graph Replay、Padding、峰值显存和 TPOT，明确兼容性回退与图覆盖比例。

[E1](#ref-E1) · [E8](#ref-E8) · [E9](#ref-E9) · [E17](#ref-E17)

### G4 Draft/Target KV 共存与状态恢复的容量收益

**已知条件：** Draft Tail KV、Lookahead Prefix Hash 和 Cross-TP Hybrid History 具有不同的缓存身份与生命周期。

**研究问题：** 减少 Draft KV 占用能否稳定转化为更高并发和更少 Preemption，同时维持 Accepted Prefix 正确？

**验证设计：** 固定请求到达与 Prefix Hit 条件，比较 Draft/Target KV、SSM State 与 Graph Workspace 的峰值；测量 Admission、Eviction、Restore TTFT 和 Goodput。

[E5](#ref-E5) · [E6](#ref-E6) · [E14](#ref-E14) · [E15](#ref-E15)

### G5 局部执行优化到真实 Serving 收益的因果传递

**已知条件：** 多步 Draft Graph 的局部收益并不一定体现在服务 TPS，部分变长 Verify Graph 方案仍未合入。

**研究问题：** 如何从 Draft、Verify、Sampler、State 与 Host Trace 解释不同 Concurrency 下 SpecDec 的盈亏转折点？

**验证设计：** 在固定提交和模型下交错执行 AR、Fixed K、AV，对相同请求轨迹测量 TTFT、TPOT/ITL 分布、TPS/Goodput、有效轮次与错误率，保留波动和失败样本。

[E1](#ref-E1) · [E2](#ref-E2) · [E12](#ref-E12) · [E17](#ref-E17)

## 局限与适用范围

- 本文属于问题驱动的选择性技术综述。工程 PR 和论文样本用于机制归纳，未将候选索引视为穷尽文献检索或独立验证的性能数据库。
- 研究结论与兼容性判断受具体模型、设备、Runtime 与提交版本约束；原始 PR 中的实验数字保留其原有测试条件，跨条件不作加速倍数推断。
- 开放中的工程方案与已合入主线的能力分开列出。研究缺口表示当前技术交界仍需验证的问题，不等于领域中此前没有相关工作。

## 参考来源

- <a id="ref-D1"></a> **D1** [vLLM Speculative Decoding Guide](https://docs.vllm.ai/en/latest/features/speculative_decoding/) · 官方文档或源码（版本相关）
- <a id="ref-D2"></a> **D2** [vLLM Ascend Speculative Decoding Guide](https://docs.vllm.ai/projects/ascend/en/main/user_guide/feature_guide/speculative_decoding.html) · 官方文档或源码（版本相关）
- <a id="ref-D3"></a> **D3** [Speculators Algorithm Decision Guide](https://docs.vllm.ai/projects/speculators/en/latest/user_guide/algorithms/decision_guide/) · 官方文档或源码（版本相关）
- <a id="ref-D4"></a> **D4** [vLLM Adaptive Verification Guide](https://docs.vllm.ai/en/latest/features/speculative_decoding/adaptive_verification/) · 官方文档或源码（版本相关）
- <a id="ref-D5"></a> **D5** [SGLang Speculative Decoding](https://docs.sglang.io/docs/advanced_features/speculative_decoding) · 官方文档或源码（版本相关）
- <a id="ref-D6"></a> **D6** [vLLM SpecDec Runtime Source](https://github.com/vllm-project/vllm/tree/main/vllm/v1/spec_decode) · 官方文档或源码（版本相关）
- <a id="ref-D7"></a> **D7** [vLLM Ascend MRV2 SpecDec Source](https://github.com/vllm-project/vllm-ascend/tree/main/vllm_ascend/worker/v2/spec_decode) · 官方文档或源码（版本相关）
- <a id="ref-P1"></a> **P1** [Blockwise Parallel Decoding](https://papers.nips.cc/paper/8212-blockwise-parallel-decoding-for-deep-autoregressive-models) · 原始论文（作者报告）
- <a id="ref-P2"></a> **P2** [Speculative Decoding — Leviathan et al.](https://proceedings.mlr.press/v202/leviathan23a.html) · 原始论文（作者报告）
- <a id="ref-P3"></a> **P3** [Medusa](https://proceedings.mlr.press/v235/cai24b.html) · 原始论文（作者报告）
- <a id="ref-P4"></a> **P4** [SpecInfer](https://doi.org/10.1145/3620666.3651335) · 原始论文（作者报告）
- <a id="ref-P5"></a> **P5** [EAGLE](https://proceedings.mlr.press/v235/li24bt.html) · 原始论文（作者报告）
- <a id="ref-P6"></a> **P6** [EAGLE-3](https://proceedings.nips.cc/paper_files/paper/2025/hash/c7b5a35ea98b62512a869c19ea7b03cb-Abstract-Conference.html) · 原始论文（作者报告）
- <a id="ref-P7"></a> **P7** [DFlash](https://proceedings.mlr.press/v306/chen26bv.html) · 原始论文（作者报告）
- <a id="ref-P8"></a> **P8** [DSpark](https://arxiv.org/abs/2607.05147) · 原始论文（作者报告）
- <a id="ref-P9"></a> **P9** [HybridSpec](https://arxiv.org/abs/2611.04055) · 原始论文（作者报告）
- <a id="ref-P10"></a> **P10** [DFLare](https://aclanthology.org/2026.emnlp-main.1503/) · 原始论文（作者报告）
- <a id="ref-E1"></a> **E1** [ROCm AITER Multi-step Draft Graph](https://github.com/vllm-project/vllm/pull/63096) · 原始 PR（截至 2026-11-17 已合入）
- <a id="ref-E2"></a> **E2** [Adaptive Budget Triton Kernel](https://github.com/vllm-project/vllm/pull/63421) · 原始 PR（截至 2026-11-17 已合入）
- <a id="ref-E3"></a> **E3** [XPress Acceptance Estimator](https://github.com/vllm-project/vllm/pull/65175) · 原始 PR（截至 2026-11-17 已合入）
- <a id="ref-E4"></a> **E4** [HiSparse Multi-token Verification Prefetch](https://github.com/vllm-project/vllm/pull/63801) · 原始 PR（截至 2026-11-17 已合入）
- <a id="ref-E5"></a> **E5** [Lookahead Block Hash for EAGLE/MTP](https://github.com/vllm-project/vllm/pull/61589) · 原始 PR（截至 2026-11-17 已合入）
- <a id="ref-E6"></a> **E6** [Skip Unused Drafts](https://github.com/vllm-project/vllm/pull/62784) · 原始 PR（截至 2026-11-17 已合入）
- <a id="ref-E7"></a> **E7** [RecoverSSM Deferred Commit](https://github.com/vllm-project/vllm/pull/66595) · 原始 PR（截至 2026-11-17 未合入）
- <a id="ref-E8"></a> **E8** [DFlash2 MRV2 Full ACLGraph](https://github.com/vllm-project/vllm-ascend/pull/19512) · 原始 PR（截至 2026-11-17 已合入）
- <a id="ref-E9"></a> **E9** [Rejection Sampling ACLGraph](https://github.com/vllm-project/vllm-ascend/pull/20254) · 原始 PR（截至 2026-11-17 未合入）
- <a id="ref-E10"></a> **E10** [Chunk Top-k/Top-p to Avoid Sampling OOM](https://github.com/vllm-project/vllm-ascend/pull/20006) · 原始 PR（截至 2026-11-17 未合入）
- <a id="ref-E11"></a> **E11** [GDN Mixed Batch Metadata Fusion](https://github.com/vllm-project/vllm-ascend/pull/19954) · 原始 PR（截至 2026-11-17 已合入）
- <a id="ref-E12"></a> **E12** [RecoverSSM Commit D2H Overlap](https://github.com/vllm-project/vllm-ascend/pull/21430) · 原始 PR（截至 2026-11-17 未合入）
- <a id="ref-E13"></a> **E13** [DFlash2 ACL Graph Mode Selection](https://github.com/vllm-project/vllm-ascend/pull/20279) · 原始 PR（截至 2026-11-17 未合入）
- <a id="ref-E14"></a> **E14** [DFlash/DSpark Draft Tail KV](https://github.com/vllm-project/vllm/pull/64109) · 原始 PR（截至 2026-11-17 未合入）
- <a id="ref-E15"></a> **E15** [Cross-TP Hybrid Decode History Reuse](https://github.com/vllm-project/vllm-ascend/pull/20755) · 原始 PR（截至 2026-11-17 未合入）
- <a id="ref-E16"></a> **E16** [GLM Specialized Uniform MTP Verify](https://github.com/vllm-project/vllm/pull/63102) · 原始 PR（截至 2026-11-17 已合入）
- <a id="ref-E17"></a> **E17** [Varlen Graph for Fixed Speculation](https://github.com/vllm-project/vllm/pull/64915) · 原始 PR（截至 2026-11-17 关闭未合入）
- <a id="ref-E18"></a> **E18** [Hybrid Cache Group Metadata Reuse](https://github.com/vllm-project/vllm-ascend/pull/20345) · 原始 PR（截至 2026-11-17 未合入）
- <a id="ref-M1"></a> **M1** [TACL Survey Papers Guidance](https://transacl.org/index.php/tacl/about/submissions) · 综述组织方法
- <a id="ref-M2"></a> **M2** [PRISMA Living Systematic Reviews](https://www.prisma-statement.org/lsr) · 更新透明度的方法参考；非完成的系统综述

## 研究记录

- 2026-11-17：首次研究稿：按 Draft、Verify、Acceptance、State 与 Serving 重建技术路线，保留 105 条社区工程线索与 5 项研究议题。
