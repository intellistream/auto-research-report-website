# Speculative Decoding：候选生成、验证预算与合法状态的系统协同

研究稿 R1 · 材料截止 2026-11-17 · PR 状态复查 2026-11-18

## 摘要

推测解码以廉价候选换取目标模型的多位置验证，从而减少自回归推理中昂贵的串行前向。其性能上限同时取决于候选的条件质量、Target Verify 的长度相关成本，以及接受采样、KV/递归状态提交与运行时调度。本文以 vLLM、vLLM-Ascend、Speculators 的官方实现为工程主线，结合 Blockwise Decoding、EAGLE-3、DFlash、DSpark 和 HybridSpec 等算法工作，分析推测轮次的正确性合同、Draft 的串行与并行设计、动态验证预算及 GDN-MoE 混合模型的状态重构。社区归档的 105 条 PR 提供持续观察窗口，其中具有完整机制和条件描述的实现用于比较。综合发现，较高接受率并不保证更低 TPOT；只有把 Draft、Verify、Sampling、State 和 Host/Device 交互放在相同关键路径上，才能解释加速的成立条件。报告进一步提出动态验证、合法状态与图缓存协同等有明确验证方案的研究问题。

## 研究问题

1. 在保持 Target 采样分布与已接受前缀合法性的前提下，推测执行究竟替换了哪部分串行成本？
2. Lookup、EAGLE/MTP 与 DFlash/DSpark 在候选质量、生成深度和 KV 占用上的根本权衡是什么？
3. 验证长度如何随候选存活概率、Batch 规模和 MoE Router 工作量变化，何时应放弃额外候选？
4. GDN/Mamba/KDA 的 Verify 临时状态如何与 Accepted State 分离，并在 Graph、Prefix Cache 和 P/D 场景下正确提交？
5. 哪些 Runtime 优化已证明局部机制有效，如何通过统一的关键路径测量检验其真实 Serving 收益？

## 研究范围与方法

以推测轮次（Draft、Target Verify、Acceptance、State Commit）及其 Serving 执行边界为直接对象。论文范围包括早期分布保持与树验证、EAGLE 系、块并行 Drafter、动态验证以及 Hybrid GDN-MoE 推测执行。工程范围是 vLLM、vLLM-Ascend 与 Speculators 官方文档、主要源码接口和代表性实现 PR；SGLang 仅作运行时背景对照。网站既有 vLLM/vLLM-Ascend 专题索引来自 2026-10-22 至 2026-11-11 的 21 期日报，包含经社区分类的 105 条 PR（vLLM 68、Ascend 37）。研究增补核对原始论文和代表 PR 至 2026-11-17，不改变日报原标签与收录。

检索与阅读：按正确性→Drafter→Verify Budget→State→Serving 五个环节建立检索和阅读顺序。先读经典 Speculative Sampling、EAGLE-3、DFlash/DSpark、HybridSpec 的原始论文；再核查 vLLM、vLLM-Ascend 与 Speculators 官方文档/实现，重点追踪 Scheduler、Proposer、Sampler、Graph 与 Cache State 的职责；最后沿归档索引阅读原始 PR，检查机制、硬件环境、版本、运行形状及合入状态。论文用于解释算法合同，源码和 PR 用于解释工程可行性；不同日期的资料分别保留版本语境。

综合框架：以单轮合法输出和端到端关键路径为共同坐标，比较各方法减少的串行依赖、引入的验证/状态代价及软硬件前提。技术分类来自机制而非日报标签；代表 PR 的实验仅用于支撑对应局部结论。Research Gaps 从已知技术的交界条件提出可证伪问题，并用后续社区更新修正。

### 纳入条件
- 保留原专题全部 105 条社区分类 PR，作为方法演进与相邻系统依赖的工程线索。
- 技术综合优先采用有明确算法合同、执行路径或可归因实验条件的原始论文、官方实现及 PR。
- 技术路线同时记录适用形状、缓存/状态条件和运行时成本，不以方法名称替代机制。

### 判断边界
- 不从专题索引删除相关性较间接的 PR，但不把通用 Runtime 改造写成直接的推测算法创新。
- 不把跨模型、跨设备、跨版本的性能数字拼接为统一加速结论，也不把作者微基准解释为在线服务收益。
- 对开放中的实现、未报告的兼容组合及缺少原始对照的收益不作生产可用性推断。

详细材料：[105 条候选与参考来源账本](source-ledger.json) · [固定源码与能力矩阵](implementation-audit.md) · [10 条原始 PR 证据记录](evidence-ledger.json)

## 技术路线与关键权衡

| 技术问题 | 路线 | 代价与边界 | 依据 |
|---|---|---|---|
| 候选生成的串行依赖与条件质量 | 历史 Lookup；独立小模型与 EAGLE/MTP 自回归草稿；DFlash/DSpark 块并行与半自回归草稿 | Lookup 开销低而依赖重复；AR 草稿改善条件信息却仍需多步执行；块并行降低深度但可能降低长前缀存活率。 | [P5](#ref-P5) · [P6](#ref-P6) · [P7](#ref-P7) · [P8](#ref-P8) · [D3](#ref-D3) |
| 验证位置选择与动态计算预算 | 固定 Spec Depth → 位置存活概率驱动的 Adaptive Verification → Router-aware 分阶段验证 | 较大的 K 会增加无效 Query Rows；成本同时由 Batch、Attention、MoE Expert 负载、图桶和预算选择器决定。 | [D4](#ref-D4) · [P8](#ref-P8) · [P9](#ref-P9) · [E2](#ref-E2) · [E3](#ref-E3) |
| 合法前缀与目标分布保持 | 逐位置 Acceptance、拒绝后的正残差重采样、全部接受后的 Bonus；树提案的祖先条件约束 | Greedy 一致、概率精确、近似验证必须分开；Token 正确还需保证 KV/State 读取合法。 | [P1](#ref-P1) · [P2](#ref-P2) · [P3](#ref-P3) · [P4](#ref-P4) |
| Hybrid Recurrent State 的正确提交 | 合法 Checkpoint、Accepted-State Reconstruction、RecoverSSM、Lookahead Hash 与延迟 Commit | 被拒绝分支、跨轮状态和 Prefix/P-D 生命周期互相制约；异步优化不能跨越状态所有权边界。 | [P9](#ref-P9) · [E5](#ref-E5) · [E7](#ref-E7) · [E11](#ref-E11) · [E12](#ref-E12) |
| Draft/Verify 的 Graph 与 Host 关键路径 | 多步 Draft Graph、可变长度 Verify Graph、ACLGraph Rejection Sampling 和 Metadata Fusion | 图覆盖、动态 Shape、Host Launch、Kernel Fusion 与 Graph 常驻资源需要联合评价；局部提速未必传递到 TPS。 | [E1](#ref-E1) · [E8](#ref-E8) · [E9](#ref-E9) · [E11](#ref-E11) · [E17](#ref-E17) |
| Drafter/Target KV 容量及跨实例状态恢复 | Draft Tail KV、Prefix Lookahead 身份、无用 Draft 跳过、Hybrid P/D Checkpoint 迁移 | Draft KV、Target KV、SSM State 与 Workspace 争用容量；容量和恢复 TTFT 不等价于单轮 Verify 加速。 | [E5](#ref-E5) · [E6](#ref-E6) · [E14](#ref-E14) · [E15](#ref-E15) |

## 机制与工程分析

### 1. K=3 推测轮次：候选、拒绝、修正与状态提交

给定已经确认的前缀 P，Drafter 提出 [A, B, C]。在 Greedy 路径下，Target 在同一合法上下文中一次计算多个位置，并依次得到最大概率 Token [A, B, D]：第 1、2 个候选匹配；第 3 个候选 C 被拒绝，并使用 Target Token D 修正。逻辑上本轮提交 P+[A,B,D]，下一轮必须沿此新前缀继续，不能读取为候选 C 生成的错误 KV/SSM。若 A、B、C 全部通过，且本次 Target 计算允许 Bonus，可额外提交目标分布中的第 4 枚 Token E；达到 EOS 或预算上限时应采用对应终止规则。

概率采样另有严格合同。一个位置若 Drafter 提议 y~q，经典 acceptance 为 min(1,p(y)/q(y))，拒绝后从正残差 r(x)∝max(0,p(x)−q(x)) 中采样。举例 q(A,B,C)=(0.5,0.3,0.2)，p=(0.4,0.4,0.2)，提议 A 的接受概率为 0.8；拒绝 A 后残差只落在 B。该数值仅为手工演算示例，不代表任何模型或 Benchmark。Greedy ID 一致、概率分布一致、近似校验允许的偏差是三种不同结论。

Token Output 被采样器确认不意味着全部 State 已物化。在一些 Runner 实现中，拒绝位置的 Target 正确 Token 以 Pending 形式进入下一轮，再由该轮计算对应的 KV/SSM；其他实现可能显式补算。必须区分“已确认 Token”与“已更新设备状态”，并检查二者在调度前的 happens-before 关系。

依据：[P1](#ref-P1) · [P2](#ref-P2) · [D6](#ref-D6) · [D7](#ref-D7) · [E7](#ref-E7)

### 2. 四类正确性不变量与单位输出成本模型

分布合同：经典精确 SpecDec 的每个输出位置与 Target 条件分布一致，拒绝后的正残差和全接受 Bonus 均必须正确；固定 Seed 的单次输出一致不等于分布相同。Token/前缀合同：Greedy 模式逐 Token 对齐 AR Oracle，Tree 验证要沿已选祖先路径裁决，不能把互斥分支同时提交。

状态合同：所有下一轮可见的 Attention KV、GDN/Mamba/KDA 递归状态、Draft KV 身份与合法 Accepted Prefix 对应，Rejected Candidate 的临时结果不能污染历史。时序与生命周期合同：Producer 完成→事件同步→消费者读取→所有消费完成后覆盖；Preemption、Prefix Hit、P/D、Graph Replay 与 Request Slot Reuse 都须满足相同的所有权和世代约束。

设第 i 个候选在前 i−1 枚均通过条件下的接受概率为 αᵢ，且轮次中无 EOS 截断，理想顺序方案每轮有效提交期望 E[N]=1+Σᵢ₌₁ᴷ∏ⱼ₌₁ⁱαⱼ（末项包含全通过后 Bonus 的贡献）。这里只是算法层计数：实际 Draft K、对每请求选择的 Verify Budget mᵣ、Target 实际 Query Rows Σᵣ(mᵣ+1) 及 Graph Padding 后的设备工作量并不相同。

单轮有效成本可写作 T_effective≈CriticalPath(Draft,Verify,Acceptance,State,Host)/E[N]；只在没有异步重叠时才可以把 T_draft+T_verify+T_sampling+T_commit+T_host 直接当作轮次墙钟。并发下目标改为给定负载的 TTFT、TPOT/ITL、Output TPS/Goodput、HBM 与错误率。高 Acceptance Length、低 Draft Microbenchmark 或高 Graph Hit Rate 均不单独决定这些结果。

依据：[P2](#ref-P2) · [P4](#ref-P4) · [D4](#ref-D4) · [D6](#ref-D6) · [D7](#ref-D7) · [E1](#ref-E1) · [E2](#ref-E2)

### 3. 固定源码路径：Scheduler、Proposer、Target、Sampler 与 Ascend State

固定基线为 vLLM v0.23.0 0fc695fc6d1d82e9a5ac6835ac8e4e1c83703665 与 vLLM-Ascend v0.23.0 5cb98caaadeff42b5b62b996e34bb2aaa29d20fd。Scheduler.schedule 依据 num_computed_tokens 与 num_tokens_with_spec 为请求分配 Token Budget；BaseSpeculator.propose 接收 InputBatch、Hidden States、num_sampled/num_rejected 与 RNG 参数；GPUModelRunner.sample 在存在 Draft 时调用 rejection_sampler(logits,input_batch,draft_logits)。这些分别对应请求状态生产、候选提案和 Target 采样接口，不能仅凭同名函数推定所有新 PR 已落到旧 Pair。

vLLM GPUModelRunner.postprocess_sampled 先由 post_update 修正输出计数和 Token 历史，随后调用 model_state.postprocess_state；Ascend v0.23.0 的扩展在 postprocess 之后将 num_computed_tokens 通过另一个 Stream D2H，_update_seq_lens_cpu 等待 Event 再消费。PR #21430 的优化针对后续 MRV2 版本中 Snapshot 被 State Commit 错误纳入等待集合这一具体次序，不能把该 PR Patch 当作原生 stable Pair 代码。

Fixed Pair 的关键源码路径、行号、数据读写者和新旧 PR overlay 已单独收录于 implementation-audit.md。后续 #63421/#65175/#19512 等依赖更高版本的功能不应由 v0.23.0 标签推断可用；跨 Pair 的能力矩阵只列原作者明确报告的模型/设备/Graph 组合。

依据：[D6](#ref-D6) · [D7](#ref-D7) · [E2](#ref-E2) · [E3](#ref-E3) · [E8](#ref-E8) · [E12](#ref-E12)

### 4. 从 Token 接受率到合法轮次的实际收益

自回归解码必须逐步确认 Target Token。SpecDec 允许 Drafter 提前产生多个候选，并使 Target 在一个 Forward 中计算各位置的条件概率；正确的拒绝采样与 Bonus 规则确保在经典概率方案下保持目标分布。因此一次轮次真正有用的是可提交的连续 Token，而非生成的候选总数。

若平均每轮提交更多 Token，但 Draft 与 Target 的附加工作增长更快，单位 Token 的 Critical Path 仍可能变长。动态批次下，Verify Query Rows、Attention KV 带宽、MoE Expert 工作量和 Host 图准备都随宽度变化。成本模型应从 T_round/E[committed_tokens] 出发，再用设备/Host Trace 修正异步重叠与调度空泡。

依据：[P1](#ref-P1) · [P2](#ref-P2) · [D1](#ref-D1) · [D4](#ref-D4)

### 5. Drafter：从历史检索与 EAGLE/MTP 到并行块生成

无额外模型的 Lookup 依赖历史重复；独立小模型与 EAGLE/MTP 将更多条件信息注入提案，同时保留 Draft Forward、权重和 KV 开销。EAGLE-3 使用直接 Token Prediction、多层 Target Feature Fusion 与 Training-Time Test，重点改善候选质量，而不自动消除多步 Draft 的序列依赖。

DFlash 在单次轻量块扩散 Forward 中并行提出多位置候选，减少了 Draft 侧顺序步数，但长块后部的候选可能因缺少块内依赖而难以被连续接受。DSpark 在并行 Backbone 上附加 Markov 与 Confidence Head，使候选之间恢复部分依赖，并向验证预算提供位置置信度。方法选择由候选质量、Draft 计算、Target 接受和现有 Runtime 兼容性共同决定。

Speculators 的模型训练、候选采样和 Target 运行时是不同接口层。不能由论文中的速度数字推断在任意 SoC 或 vLLM-Ascend 固定版本均具有相同收益。

依据：[P5](#ref-P5) · [P6](#ref-P6) · [P7](#ref-P7) · [P8](#ref-P8) · [D3](#ref-D3) · [E1](#ref-E1)

### 6. Verification Budget：位置存活概率与 Target 计算成本

固定验证宽度向所有请求分配相同 K，而实际候选存活概率沿序列下降。Adaptive Verification 根据各请求位置的累积接受概率分配全局预算，让高价值位置保留更多 Verify Rows；它把验证长度变成运行时资源分配问题，而不再是一个静态超参数。

代价模型必须包含预算估计本身。vLLM #65175 的 XPress Estimator 连接修复说明，缺失位置置信度可能让 Adaptive 策略错误裁剪；#63421 则把 Budget Selection 从动态编译替换为专门 Kernel，解决计算决策自身的 Host/JIT 成本。两项变更共同提示：算法分配、置信度校准与实现开销需要一起计量。

MoE Verify 的实际成本还与 Router 输出和 Expert 分布有关。HybridSpec 提出利用 Router 边界做两阶段验证，并将 GDN 合法状态恢复纳入路径；这是一条 Target-aware Budget 路线，需要与固定 K、普通 AV 及动态 Batch 一起比较。

依据：[D4](#ref-D4) · [P8](#ref-P8) · [P9](#ref-P9) · [E2](#ref-E2) · [E3](#ref-E3)

### 7. Hybrid Target：接受前缀与递归状态必须共同合法

Attention KV Cache 按位置保存历史，Recurrent 层则以 GDN/Mamba/KDA 状态总结此前序列。Verify 算过多个候选后，Sampling 可能只接受前 a 个位置；下一轮必须读取对应 Accepted Prefix 的状态，而不能继续使用最后一个已计算候选的中间状态。KV Page、Recurrent Checkpoint 与 Drafter Context 形成三套关联但不等同的生命周期。

Lookahead Hash 要处理 EAGLE/MTP 在块末还依赖下一个 Token 的 Draft KV；RecoverSSM 试图把 State Replay 与采样后提交解耦；Ascend 的 GDN Metadata Fusion 与 Host D2H/Commit Overlap 则分别降低准备和同步开销。它们都不代替逐层、逐位置的合法状态验证。

在 Preemption、Prefix Hit、P/D 迁移或 Graph Replay 后，状态身份还必须覆盖 Request Slot 世代、物理布局与事件顺序。这个问题不属于某个 Drafter 的单独优化，而是 Hybrid SpecDec 的可组合系统合同。

依据：[P9](#ref-P9) · [E5](#ref-E5) · [E7](#ref-E7) · [E11](#ref-E11) · [E12](#ref-E12) · [E15](#ref-E15) · [E18](#ref-E18)

### 8. Runtime：图回放、Sampling 与 KV Residency 的关键路径

多步 Draft 与 Rejection Sampling 可能由多个细粒度 Kernel 组成。ROCm AITER 的多步 Draft Graph、Ascend DFlash2 Full ACLGraph 和 Rejection Sampling Graph 分别试图将 Host 调度移出高频路径，但必须保证动态地址、元数据和图捕获模式相容。原始 PR 也说明局部 Draft 时间缩短不必然使 Serving TPS 可辨地增加。

Fixed-width Spec 在请求进入/退出时会出现变长 Query Shape，可能触发图回退。Verifer 的多 Token Attention、Sampling Full Vocabulary Sort 和额外 Draft KV 又把问题扩展到 HBM、峰值 Workspace 与 Batch Planning。高并发下一个修复 OOM 的 PR 和另一个优化 Graph Coverage 的 PR，解释的是不同瓶颈，不能累计为统一 Speedup。

Prefill-only 或临近终止的请求可能根本不消费本轮草稿，跳过无用 Draft 可避免无意义计算但必须维护必要的 Draft Context。Draft Tail KV 与跨 TP Hybrid History Reuse 则把容量和恢复能力纳入服务策略。

依据：[E1](#ref-E1) · [E4](#ref-E4) · [E6](#ref-E6) · [E8](#ref-E8) · [E9](#ref-E9) · [E10](#ref-E10) · [E14](#ref-E14) · [E15](#ref-E15) · [E17](#ref-E17)

### 9. 三条技术演进：已知机制、证据、反例与综合判断

Candidate Generation：Lookup 通过重复前缀缩减 Drafter Cost；EAGLE/MTP 提供更强位置条件依赖；DFlash/DSpark 减少草稿的串行深度并引入块内关系。已知机制来自 P5–P8，工程侧 #63096 验证了减少 Draft Host Metadata 空泡能降低 Draft Loop K3 B1 571→463μs。然而作者 C32 Serving 27,741→27,572 tok/s，未观察到可稳定归因的加速。因此能成立的是“减少候选生成成本”，而不是“更快 Draft 必然提高 Serving TPS”；这个区分要求同时监控 Target、Sampling 与不同负载档位。

Target Verification：固定 K 会对低存活概率的位置浪费计算。DSpark/Adaptive Verification 使用 Confidence 与 Profiled Cost 来选择位置；#65175 证明 XPress 缺失 Estimator 数据时会错误地把接受长度压至约1，修复后 C32 AV TPS 从 2,227→5,389，但 C1 开启 AV 仍从 408 降到375。#63421 进一步证明预算选择器本身的编译和 Host Launch 可吞掉收益。同一策略在不同 Concurrency 上盈亏翻转，所以有意义的趋势是从固定 K 向“随概率与设备成本改变的 Verify Budget”转移，而非 AV 总是优于 Fixed Width。

State & Serving：经典 Acceptance 约束输出分布，Hybrid Target 还要保证 KV/SSM Accepted State 与跨轮生命周期一致。#61589 的 Lookahead Hash 让本地 Prefix Cache 覆盖更长合法块，却增加 Hash CPU 成本（32K/B16 text +12.6%）；#19954 把 GDN Metadata C32 从 2.289→0.952ms，但服务 TPS 仅 2,876.00→2,881.35（+0.19%）。#21430 指向更下游的 D2H/Commit 并行空泡，尚未提供充分统计对照。综合判断：状态和缓存优化必须明确谁生产/消费合法历史，并证明消除的确是 Serving Critical Path；内存容量、局部 Kernel 与 Host 同步各自是不同瓶颈。

上述三个结论并非“PR 数量证明趋势”。它们只在所引论文和 PR 的机制、模型、硬件及固定版本范围内成立；若关键 PR 的对照不稳定或源头状态改变，相关综合判断也须降级。证据附录保留了十条作者对照及负面结果，105 条候选索引是检索窗口而非 105 次独立核验。

依据：[P5](#ref-P5) · [P6](#ref-P6) · [P7](#ref-P7) · [P8](#ref-P8) · [E1](#ref-E1) · [E2](#ref-E2) · [E3](#ref-E3) · [E5](#ref-E5) · [E11](#ref-E11) · [E12](#ref-E12)

### 10. 下一阶段：Hybrid MoE/GDN 与 Adaptive Serving 的共同边界

更强的 Drafter 并没有消除 Target 的验证成本。低并发 Memory-bound 的优化空间与高并发 Compute/Expert-bound 的优化空间可能不同；混合模型还增加了 State Reconstruction 和跨步生命周期，故统一速度排名意义有限。合理的研究路径应先建立正确性、主机/设备关键路径和真实请求形状三个可观测量，再探索新的决策策略。

当前最有价值的交叉问题集中在：在设备成本随请求与路由变化时怎样自适应选择验证宽度；如何将合法状态提交与 Preemption/Prefix Cache/Graph Replay 统一；如何让 Draft/Target KV、图桶和 Scheduler 共享容量预算。它们都有既有论文和工程基础，可通过清晰的配对实验缩小剩余不确定性。

依据：[P8](#ref-P8) · [P9](#ref-P9) · [D4](#ref-D4) · [E5](#ref-E5) · [E7](#ref-E7) · [E14](#ref-E14) · [E17](#ref-E17)

### 11. 实现能力与归因边界：固定 Pair、后续 PR、设备条件

vLLM v0.23.0 (0fc695fc6d1d) / Ascend v0.23.0 (5cb98caaadef) 的 Scheduler、Speculator、Rejection Sampler 与 Ascend D2H 路径已经按固定文件定位；这仅证明静态实现存在。实际 910B2、CANN9.1.0、具体 Drafter、TP/DP 与 Model Runner 组合的可运行性，还需要对应软件和模型的真实 Compatibility Gate。

已合入的 PR #63421 报告 H200 Qwen3-4B DSpark K7 的 Budget Kernel；#63096 报告 ROCm MI355X EAGLE3 的 Draft Graph；Ascend #19512 报告 4×910B4 TP4 DFlash2 Full ACLGraph，#19954 报告 Ascend950DT GLM/GDN Metadata Fusion。这些是各自环境下的原始记录，不构成旧稳定 Pair 的统一功能集合。

Ascend #20254 Rejection Graph、#21430 GDN D2H Overlap 与 vLLM #66595 RecoverSSM Deferred Commit 截至 2026-11-18 仍为开放 PR；vLLM #64915 的 Varlen Graph 方案已关闭未合入，使用 Synthetic Acceptance/Dummy KV 的 Rubin 测试，且部分基线预热不稳定。不能把这类候选标成官方稳定支持。完整的源码行号与组合能力矩阵可在 implementation-audit.md 查阅。

依据：[D6](#ref-D6) · [D7](#ref-D7) · [E1](#ref-E1) · [E2](#ref-E2) · [E7](#ref-E7) · [E8](#ref-E8) · [E9](#ref-E9) · [E11](#ref-E11) · [E12](#ref-E12) · [E17](#ref-E17)

## 核心 PR 证据与反例

### Adaptive Verification Budget Selector

**机制：**将运行期 torch.compile Budget Selection 改为 warmup 单次 JIT 的 Triton Budget Kernel。

| 项目 | 原始 PR 记录 |
|---|---|
| 性质 | Merged; PR 作者实验与代码变更路径 |
| 环境 | H200 ×1；Qwen3-4B + DSpark block7；GSM8K |
| 版本 | vLLM #63421；作者注明同 build d561af5df 的交错 E2E |
| Workload | 128 prompts、K7、并发16、每臂3次；CPU/GPU microbench 各不同 |
| 结果 | AV main 4,783→Triton 6,803 output tok/s（median）；#62539 6,756；Host budget 76–90→约15 μs。 |
| 反例/失败 | 动态编译首轮 1.8–4.7 秒/进程（作者记录），但 warmup 能消除这部分。 |
| 因果边界 | 主因是中途编译与 Kernel Launch，而非 AV 算法本身变好；对照 #62539 已接近本 PR。 |
| 本轮核验 | 阅读 PR 描述、原始对照表、4 个改动文件；未执行 H200 复现。 |
| PR Head | `d28c23065300ee5b45dc9504f28a12be222d36bf` |
| 代码入口 | `vllm/v1/worker/gpu/spec_decode/adaptive_verification.py` |

[E2](#ref-E2)

### XPress Acceptance Estimator

**机制：**XPress 将最后一次 Jacobi Refinement 的 Draft Logits 交给在线 Acceptance Estimator；修正未初始化 Confidence Buffer 引发的误裁剪。

| 项目 | 原始 PR 记录 |
|---|---|
| 性质 | Merged; PR 作者真实 Workload 与测试 |
| 环境 | H100 ×1；Qwen3-8B + XPress b16；K15；Greedy |
| 版本 | vLLM #65175；作者列明 baseline f9db1756e9 |
| Workload | SPEED-Bench throughput_1K；并发1/8/32/64/128；30秒×3 trials；Prefix Cache off |
| 结果 | 并发32: AV off 4,468，旧 AV 2,227，修复 AV 5,389 tok/s；并发1: AV off 408、修复 AV 375，仍有 8% 左右损失。 |
| 反例/失败 | 旧实现 Acceptance Length≈1；主线测试 1 failed，PR 新测试 2 passed（作者报告）。 |
| 因果边界 | 修的是 Estimator 输入连接；修复后并非所有并发都优于 AV off，不能外推到其他 Drafter。 |
| 本轮核验 | 阅读 PR 说明、性能表及 6 个改动文件；未运行 H100。 |
| PR Head | `9132bccd77919c7ee3ac9f3bd4d709767797464e` |
| 代码入口 | `vllm/v1/worker/gpu/spec_decode/xpress/speculator.py` |

[E3](#ref-E3)

### Lookahead Block Hash 与 Prefix Cache

**机制：**EAGLE/EAGLE3/MTP 块末 Draft KV 依赖后一 Token；Hash 纳入 Lookahead Token，避免 Local Prefix Cache 命中时强制丢弃尾块。

| 项目 | 原始 PR 记录 |
|---|---|
| 性质 | Merged; PR 作者 Unit、Hash Microbench；E2E 部分继承此前联合 PR |
| 环境 | GB200 node；Hybrid Mamba/GDN、EAGLE/MTP；本地 Prefix Cache |
| 版本 | vLLM #61589；叠加相关 #50897 的旧轮次数据 |
| Workload | Hash CPU 基准随机 32K/128K tokens、B16/128/1024、15轮交错；PR 特定 E2E 本次未重跑 |
| 结果 | B16、32K text Hash 3.166→3.566ms（+12.6% CPU）；B128 +5.0%；联合旧 PR Qwen3.6-27B prefix hit 72.7→85.0%，但不是本拆分 PR 重跑。 |
| 反例/失败 | PR 明确排除一组 CLI e2e test；历史合并数据不能当成分拆 PR 独立证明。 |
| 因果边界 | 命中长度改善有 CPU Hash 代价，且 KV Connector 路径维持旧 Hash；跨进程 Cache 协议需协同升级。 |
| 本轮核验 | 阅读 PR 说明和 27 项改动路径；未确认拆分后独立 E2E 复现。 |
| PR Head | `9cc08bfe366e8ad3ac9fe7d53a64dd3847041a38` |
| 代码入口 | `vllm/v1/core/block_pool.py` |

[E5](#ref-E5)

### RecoverSSM Deferred Replay

**机制：**将已接受 Token 的 KDA State Replay 延后至下一次 Verify；Sampling 后记录 Pending Count，请求离开 Runner 时 Fold。

| 项目 | 原始 PR 记录 |
|---|---|
| 性质 | Open, not merged; PR 作者 Unit + 指定环境测量 |
| 环境 | GB200 node；GLM-5.3-Flash；TP4、MTP5、FP32 KDA State、Prefix Cache |
| 版本 | vLLM #66595；作者以相同树关闭 Deferral 为基线 |
| Workload | 随机输入/输出 1024/1024、Synthetic AL3.61；并发16/128；每行1次 |
| 结果 | 并发128 9,275→9,780 output tok/s（+5.4%）；并发16 3,158→3,183（+0.8%）；KDA batch1 0.371→0.383ms（局部退化）。 |
| 反例/失败 | PR 记载主线同样存在 56 个 specialized 测试失败；Streaming Session 第二轮状态历史与新请求不完全一致。 |
| 因果边界 | 仅单次对照；另有 GLM stock RecoverSSM 本地接线；并非直接已合入功能或跨模型收益。 |
| 本轮核验 | 阅读 PR 概述、单元测试/基准/限制；文件路径已检查；无 GB200 独立运行。 |
| PR Head | `cdced7fb9741c8eca9661c56883ea9828b90fcd3` |
| 代码入口 | `vllm/v1/worker/gpu/model_states/recoverssm.py` |

[E7](#ref-E7)

### ROCm Multi-step Draft Graph

**机制：**ROCm AITER Unified Attention Metadata 使用持久 Buffer 视图，启用 Fused Multi-step Draft Decode，避免每个 Draft Step 重新构建 Host Metadata。

| 项目 | 原始 PR 记录 |
|---|---|
| 性质 | Merged; PR 作者分层 Microbench 与 Serving A/B |
| 环境 | MI355X ROCm/AITER；Llama-3.1-8B EAGLE3；k3/7 |
| 版本 | vLLM #63096；作者注明 main 124501da 等多轮基线 |
| Workload | K3 Batch1/8/32：1151 calls×4轮（首轮舍弃）；服务并发1/8/32，3轮中位；Synthetic Acceptance |
| 结果 | K3 Draft Loop B1 571→463μs；服务 C32 27,741→27,572 tok/s（−0.6%），作者归为服务器间波动；C1 +0.1%。 |
| 反例/失败 | gpt-oss-20b 另一路在 k≥5 的 Greedy 偏差是既有基线问题；作者没有宣称 E2E 提速。 |
| 因果边界 | 后端限定 ROCM_AITER_UNIFIED_ATTN；被减少的是 Draft Loop Host 空泡，不意味着 Target LM Head 与 Serving Critical Path 同步变短。 |
| 本轮核验 | 阅读 PR 的机制、独立 Draft 与 Serving 对照和2文件 patch；无 MI355X 独立测试。 |
| PR Head | `11090e9315ca1c74d962feb90f3d4fd0e00e9cd8` |
| 代码入口 | `vllm/v1/attention/backends/rocm_aiter_unified_attn.py` |

[E1](#ref-E1)

### Ascend DFlash2 Full ACLGraph

**机制：**将 DFlash2 Backbone、Candidate Selector、Proposal Cache Update 纳入 MRV2 Full ACLGraph，同时修复非因果 SWA 的 FIA Band Mask。

| 项目 | 原始 PR 记录 |
|---|---|
| 性质 | Merged; PR 作者跨日 Eager / Graph 对照 |
| 环境 | 4×Ascend 910B4；Qwen3.8-27B-W8A8；TP4；K7；vLLM 0.32.0 + Ascend dev3176 |
| 版本 | Ascend #19512；eager 2026-10-30，graph 2026-10-31 |
| Workload | 五类场景，两轮/部署，累计 384 请求；temperature0、seed42，warmup 排除 |
| 结果 | 8K→8K C8，TPOT 21.739→10.838ms、输出 351.62→705.38 tok/s；Acceptance 49.39%→94.04%。 |
| 反例/失败 | GSM8K 类场景 Acceptance 75.50→72.03%，并非所有工作量都改善接受率。 |
| 因果边界 | 对照含 PR 代码、FIA 行为及两日部署差异；接受率本身大幅变化，不能将整个 TPS 提升归因图回放；不代表 910B2 兼容。 |
| 本轮核验 | 阅读 PR 完整实验表及 speculator/FIA 相关变更路径；未复现 910B4。 |
| PR Head | `2d4a2e00348ad29650da959f6603a20e90934479` |
| 代码入口 | `vllm_ascend/worker/v2/spec_decode/dflash2/speculator.py` |

[E8](#ref-E8)

### Rejection Sampling ACLGraph

**机制：**用单次 ACLGraph Replay 运行四个 Rejection Kernel，编译期固定 Launch Shape，复用输入 Buffer；不支持的 Sampling Mode 回退 Eager。

| 项目 | 原始 PR 记录 |
|---|---|
| 性质 | Open, not merged; PR 作者 Host Profiler + 一次 Serving 对照 |
| 环境 | Ascend 910B；DSpark K5、TP8；设备端 110–170μs |
| 版本 | Ascend #20254；仅提交中的 Patch 路线 |
| Workload | 150 请求、7.5M 输入/52.5K 输出 Token、并发6；工作量一致、但 RNG 接受轨迹变化 |
| 结果 | Sampler Host 1.98→0.53ms/轮；E2E Output TPS 174.95→181.60（+3.8%），Verify Rounds 26,795→26,095；每轮 11.20→11.08ms。 |
| 反例/失败 | Median TPOT 26.78→26.95ms 基本未改善；P99 TTFT 变化不能由这个 PR 单独归因。 |
| 因果边界 | 更高 Acceptance Length 1.96→2.01 改变了 Verify 次数；E2E 的 3.8% 不全由 Kernel Graph 导致；部分模式仍 Eager。 |
| 本轮核验 | 阅读 PR 的 Kernel/Graph 改动、Profiler 和 Serving 表；无独立 NPU 实测。 |
| PR Head | `fe58a4cf1c89190bffe5f43b8d7220bfb875d31a` |
| 代码入口 | `vllm_ascend/worker/v2/spec_decode/rejection_sampler_utils.py` |

[E9](#ref-E9)

### RecoverSSM D2H 与 Commit Overlap

**机制：**将 num_computed_tokens D2H Snapshot 提前至 Postprocess State Commit，缩小 CPU Sequence Length 更新的等待集合。

| 项目 | 原始 PR 记录 |
|---|---|
| 性质 | Open, not merged; PR 作者 A5 单环境报告 |
| 环境 | Ascend A5；Qwen3.x GDN Hybrid + MTP；MRV2 |
| 版本 | Ascend #21430；基线描述在 PR，缺独立试验矩阵 |
| Workload | 并发72；主要观察 Decode 稳态、Draft 后空泡和 GPQA；重复次数未披露 |
| 结果 | 作者报告每步约 40ms Idle Gap 消失，Decode TPS 约24→30；GPQA 88.89（缺配对细节）。 |
| 反例/失败 | 未披露样本方差和完整对照环境；PR 尚在开放，不是已稳定部署功能。 |
| 因果边界 | 必须证明 Scheduled Cached Reqs 与新加入 Slot 的写集互不覆盖；原 PR 的因果归因依赖此生命周期约束。 |
| 本轮核验 | 阅读 PR 的 D2H 时序解释及 model_runner 改动文件；无实际 A5 trace 或独立复验。 |
| PR Head | `a0c28fd17a3bda74d3d2d5e431be28245b068ddf` |
| 代码入口 | `vllm_ascend/worker/v2/model_runner.py` |

[E12](#ref-E12)

### GDN Mixed-batch Metadata Fusion

**机制：**合并 GDN Host Metadata 的索引、分区、填充和共享 Conv Output 清理，单次 Triton Launch；Metadata 仍在 Graph 外。

| 项目 | 原始 PR 记录 |
|---|---|
| 性质 | Merged; PR 作者 Accuracy + Metadata/Serving 分层对照 |
| 环境 | Ascend950DT；GLM-5.3-Flash；TP8+EP、MTP3、FULL_DECODE_ONLY |
| 版本 | Ascend #19954；固定 vLLM 关联提交见原文 |
| Workload | Meta 16请求单卡合成场景；另 x8 实测并发10/32/64，每指标三轮；26/26 Exact Metadata 对照 |
| 结果 | C32 Metadata 2.289→0.952ms（−58.42%）；对应无 Profile Decode TPS 2,876.00→2,881.35（+0.19%）；26/26 元数据精确一致。 |
| 反例/失败 | 异步重叠/其他开销稀释局部节省；部分 Cache/Layout/Capture 回退原实现。 |
| 因果边界 | Metadata 阶段不等于完整 Step 关键路径；C32/C64 的 TPS 变化极小且作者明确不宣称统计显著性。 |
| 本轮核验 | 阅读 PR 的 Layout、Kernel 文件、精确性与对照表；无独立 950DT 运行。 |
| PR Head | `d40d2a64c656f7d86a996b23793ceaeb0f9ab3b0` |
| 代码入口 | `vllm_ascend/ops/gdn_attn_builder.py` |

[E11](#ref-E11)

### Fixed-width Spec Varlen Graph

**机制：**使 Fixed-width Spec 在 Mixed Query Length 下复用 Varlen Decode Graph；cached 1-token extension 不再误判为 Prefill。

| 项目 | 原始 PR 记录 |
|---|---|
| 性质 | Closed, not merged; PR 作者合成吞吐与 Graph Profile |
| 环境 | 4×Rubin；DeepSeek-V4.1-Flash；DP/EP4，DSpark K5；ISL131072/OSL1024 |
| 版本 | vLLM #64915；作者区分 Published PR 与本地未 Push 后续 Patch |
| Workload | 并发256；7min warmup+5min benchmark；Synthetic AL3.51，Dummy KV；无真实 Token 正确性测试 |
| 结果 | DeepGEMM output 20,862→39,943 tok/s；FlashInfer 14,910→39,567，但旧 FlashInfer Warmup 不稳；Graph Coverage 改善。 |
| 反例/失败 | FlashInfer baseline 未达到 5% Warmup Stability；真实 KV 的 Capacity Guard 未在该 PR 完整验证。 |
| 因果边界 | 利用 Synthetic Acceptance 和 Dummy KV，无法支持真实输出质量；且 PR 关闭未合入，不属于 main 已发布支持矩阵。 |
| 本轮核验 | 阅读 PR Graph 机制、实验表与未发布补丁说明；无 Rubin 独立复现。 |
| PR Head | `6f1891fb42992181a413bc6c4276889f4d3008f8` |
| 代码入口 | `vllm/v1/worker/gpu/model_runner.py` |

[E17](#ref-E17)

## Research Gaps 与可证伪的实验

### G1 · 验证预算与实际 Target 成本的联合校准

**观察：**Adaptive Verification 已利用候选存活概率和设备 Profile；GDN/MoE Target 的 Router/Expert 执行成本还与 Token 分布和并发相关。

**问题：**在已有 AV/HybridSpec 强基线之上，能否以低额外开销更准确地选择每请求的 Verify Length？

**强基线：**AV 与 Router-aware HybridSpec；AR、Fixed-K、现有 AV 与 HybridSpec 的同 Target/Drafter 强基线

**精确假设：**动态批次中的 Router/Expert Cost 变化会使只基于固定 Profile 的预算错误排序，而额外的 Router 信息带来的实际收益大于其成本。

**控制变量：**固定提交、权重、精度、Drafter、负载、K 可行范围、设备 Backend；仅变更预算政策

**观测指标：**Selector Host/Device 成本、预测误差、Verify Rows、Per-step TPOT、Goodput、Expert 负载

**验证方案：**冻结 Target、Drafter 与请求序列，比较 Fixed K、AV 与 Router-aware 策略，记录位置存活率、实际 Query Rows、Router/Expert 负载和 TPOT/Goodput，核算预算选择器的全部成本。

**证伪条件：**若在留出负载下不能稳定降低总 Critical Path，或收益不足以抵消 Selector 额外工作，则假设不成立。

来源：[D4](#ref-D4) · [P8](#ref-P8) · [P9](#ref-P9) · [E2](#ref-E2) · [E3](#ref-E3)

### G2 · Hybrid Accepted-State 跨生命周期正确性

**观察：**RecoverSSM、Lookahead Hash 和 GDN Metadata 优化分别处理不同阶段；Preemption、Prefix Hit 和 P/D 恢复会重新组合这些约束。

**问题：**能否用明确的 Checkpoint/Commit 契约统一验证被拒绝分支不会污染后续轮次？

**强基线：**AR Oracle + 已有 RecoverSSM/Lookahead 实现；AR Oracle、最新合法状态实现、逐层 KV/SSM Debug Oracle

**精确假设：**显式 Request 世代和 Accepted-State Commit 合同可以覆盖单 PR 未统一覆盖的 Reject/Bonus/Preemption/Prefix/P-D/Graph 组合。

**控制变量：**固定 Token 前缀、请求到达、Block Layout 与并行度；控制同步 instrumentation 对时序的干扰

**观测指标：**Token 一致、逐层状态差值、Event 依赖、Cache/Checkpoint Identity、错误率

**验证方案：**在同一模型前态下逐层比较 AR 与 Spec 的 KV/SSM State，覆盖 0/部分/全部接受、Bonus、请求复用、Preemption、Prefix Hit、跨实例 Restore 与 Graph Replay。

**证伪条件：**若任意组合出现错误状态读写，或安全性依赖无法保证的隐式同步，则合同不成立。

来源：[E5](#ref-E5) · [E7](#ref-E7) · [E11](#ref-E11) · [E15](#ref-E15) · [E18](#ref-E18)

### G3 · 动态 Verify Shape 与 Graph Bucket 的联合决策

**观察：**Draft、Verify 和 Sampling 各有独立 Graph 路径；动态长度与填充可能增加捕获图数量及常驻 Workspace。

**问题：**什么时候应该调整 Verify Budget 以匹配可复用的图形状，什么时候应走 Eager 回退？

**强基线：**已合入的 Draft Graph + Fixed/Adaptive Verify 图路径；Eager、固定 Bucket、现有 AV+Graph 与 PR #19512 等合法设备基线

**精确假设：**联合选择 K 与 Graph Bucket 能在同等内存预算下降低 Padding/Host Launch 损失。

**控制变量：**固定模型、量化、Backend/Graph 编译模式、Batch/Context 分布、捕获内存预算

**观测指标：**Graph Coverage、Fallback、Padding、HBM、Host Time、Verify Rows、TPOT

**验证方案：**相同内存预算下扫描 K、Batch 和 Bucket，分别采集 Host Dispatch、Graph Replay、Padding、峰值显存和 TPOT，明确兼容性回退与图覆盖比例。

**证伪条件：**若 Graph Bucket 增加的缓存和 Padding 成本抵消或超过减少的 Host Launch，假设被证伪。

来源：[E1](#ref-E1) · [E8](#ref-E8) · [E9](#ref-E9) · [E17](#ref-E17)

### G4 · Draft/Target KV 共存与状态恢复的容量收益

**观察：**Draft Tail KV、Lookahead Prefix Hash 和 Cross-TP Hybrid History 具有不同的缓存身份与生命周期。

**问题：**减少 Draft KV 占用能否稳定转化为更高并发和更少 Preemption，同时维持 Accepted Prefix 正确？

**强基线：**Target Prefix Cache + Lookahead Hash + Draft Tail KV；相同 Target/Drafter 下普通 KV、Lookahead Hash、Draft KV Tail 控制对照

**精确假设：**Draft KV 压缩或重分配能够提高 Admission 并减少 Preemption，而不会破坏 Cache Identity。

**控制变量：**固定上下文/输出长度、Prefix Hit、Block Size、Memory Utilization 与 Request Arrival

**观测指标：**HBM 分量、Cache Hit、Preemption、Admission、Restore TTFT、Goodput

**验证方案：**固定请求到达与 Prefix Hit 条件，比较 Draft/Target KV、SSM State 与 Graph Workspace 的峰值；测量 Admission、Eviction、Restore TTFT 和 Goodput。

**证伪条件：**若节省的 Draft KV 被图 Workspace/SSM State 抵消，或服务收益在重复负载下消失，则假设不成立。

来源：[E5](#ref-E5) · [E6](#ref-E6) · [E14](#ref-E14) · [E15](#ref-E15)

### G5 · 局部执行优化到真实 Serving 收益的因果传递

**观察：**多步 Draft Graph 的局部收益并不一定体现在服务 TPS，部分变长 Verify Graph 方案仍未合入。

**问题：**如何从 Draft、Verify、Sampler、State 与 Host Trace 解释不同 Concurrency 下 SpecDec 的盈亏转折点？

**强基线：**AR / Fixed-K / AV / Graph On-Off 分层测量；同设备的 AR、Fixed-K、AV 强基线；明确未合入 PR 不做生产基线

**精确假设：**存在可由 Draft/Verify/Sampler/State/Host 占比预测的 SpecDec 收益转折点。

**控制变量：**固定提交/权重/采样策略，交错 A/B 多轮；扫描 Concurrency、ISL/OSL、Prompt Hit

**观测指标：**每轮 Critical Path、AL、TTFT、TPOT/ITL P50/P95、Output TPS、Goodput、内存/错误率

**验证方案：**在固定提交和模型下交错执行 AR、Fixed K、AV，对相同请求轨迹测量 TTFT、TPOT/ITL 分布、TPS/Goodput、有效轮次与错误率，保留波动和失败样本。

**证伪条件：**若关键路径占比不能预测留出负载的收益方向，或重复试验差异区间包含零，则不能宣称稳定转折预测。

来源：[E1](#ref-E1) · [E2](#ref-E2) · [E12](#ref-E12) · [E17](#ref-E17)

## 有效性威胁与局限

- 内在有效性：原始 PR 作者实验可能同时改变 Backend、模型配置或接受轨迹；如 Ascend #19512 的跨日 Graph 对照与 Acceptance 大幅变化、#20254 同负载但随机种子未固定。它们只能支持对应场景的作者观察，不能单独鉴定 Graph 的净贡献。
- 统计可信度：vLLM #63096 的服务 TPS 与基线波动相当；#19954 的高并发 Meta Stage 显著降低但 Output TPS 仅 +0.19% 左右；#21430 未披露重复次数。微基准、Host Trace 与 Serving Client Metric 必须分层，缺乏显著性的差值不包装为确定性提升。
- 结构正确性：Hybrid State 的 Token、KV、Recurrent Checkpoint 和事件次序是不同验证对象；公开 Unit 测试和模拟 Acceptance 未覆盖全部 Prefix/Preemption/P-D/Graph 组合。未验证的能力不等于不存在或明确不支持。
- 外部有效性：H200、MI355X、GB200、Rubin、910B、910B4、Ascend950DT/A5、不同 Model Runner 与软件版本的结果不能直接迁移。特别是当前固定 v0.23.0 Pair 与后续 MRV2 PR 之间存在版本间隙。
- 检索与证据覆盖：105 条是社区已分类候选，10 条已针对原始 PR 描述与文件列表形成详细证据卡，其余候选尚未逐条阅读；不是穷尽系统综述、全源码 Diff 审计或独立硬件性能复现。论文与官方文档的适用版本需持续核对。
- 持续性：当前首次 R1 的内容可继续修订，后续新增 PR、测量条件、失败记录应按 Source Ledger 更新；未知保持未知，不能把预期实验填写为已完成。

## 参考文献与工程来源

- <a id="ref-D1"></a> **D1** [vLLM Speculative Decoding Guide](https://docs.vllm.ai/en/latest/features/speculative_decoding/) · 官方文档或源码（版本相关） · 运行方法的实际平台支持按版本和配置核验。
- <a id="ref-D2"></a> **D2** [vLLM Ascend Speculative Decoding Guide](https://docs.vllm.ai/projects/ascend/en/main/user_guide/feature_guide/speculative_decoding.html) · 官方文档或源码（版本相关） · 注意 MRV2/SoC/CANN 兼容边界。
- <a id="ref-D3"></a> **D3** [Speculators Algorithm Decision Guide](https://docs.vllm.ai/projects/speculators/en/latest/user_guide/algorithms/decision_guide/) · 官方文档或源码（版本相关） · Draft 架构和训练适配不是 Runtime 兼容矩阵。
- <a id="ref-D4"></a> **D4** [vLLM Adaptive Verification Guide](https://docs.vllm.ai/en/latest/features/speculative_decoding/adaptive_verification/) · 官方文档或源码（版本相关） · 采用存活概率和实测 Shape Cost 的预算。
- <a id="ref-D5"></a> **D5** [SGLang Speculative Decoding](https://docs.sglang.io/docs/advanced_features/speculative_decoding) · 官方文档或源码（版本相关） · 跨引擎机制对照，不迁移其性能数字。
- <a id="ref-D6"></a> **D6** [vLLM SpecDec Runtime Source](https://github.com/vllm-project/vllm/tree/0fc695fc6d1d82e9a5ac6835ac8e4e1c83703665/vllm/v1/worker/gpu/spec_decode) · vLLM v0.23.0 固定源码 0fc695fc6d1d82e9a5ac6835ac8e4e1c83703665 · Scheduler/Proposer/Acceptance/Commit 需结合各自文件核对；不是后续 PR head。
- <a id="ref-D7"></a> **D7** [vLLM Ascend MRV2 SpecDec Source](https://github.com/vllm-project/vllm-ascend/tree/5cb98caaadeff42b5b62b996e34bb2aaa29d20fd/vllm_ascend/worker/v2/spec_decode) · Ascend v0.23.0 固定源码 5cb98caaadeff42b5b62b996e34bb2aaa29d20fd · 后端 Speculator 目录；D2H/Postprocess 在独立 model_runner.py。
- <a id="ref-P1"></a> **P1** [Blockwise Parallel Decoding](https://papers.nips.cc/paper/8212-blockwise-parallel-decoding-for-deep-autoregressive-models) · 原始论文（作者报告） · 早期多 Token 提案与确认。
- <a id="ref-P2"></a> **P2** [Speculative Decoding — Leviathan et al.](https://proceedings.mlr.press/v202/leviathan23a.html) · 原始论文（作者报告） · 概率接受与残差分布的正确性基线。
- <a id="ref-P3"></a> **P3** [Medusa](https://proceedings.mlr.press/v235/cai24b.html) · 原始论文（作者报告） · 多头草稿及候选树。
- <a id="ref-P4"></a> **P4** [SpecInfer](https://doi.org/10.1145/3620666.3651335) · 原始论文（作者报告） · 树型 Target Verify。
- <a id="ref-P5"></a> **P5** [EAGLE](https://proceedings.mlr.press/v235/li24bt.html) · 原始论文（作者报告） · 基于 Target Feature 的 AR Draft。
- <a id="ref-P6"></a> **P6** [EAGLE-3](https://proceedings.nips.cc/paper_files/paper/2025/hash/c7b5a35ea98b62512a869c19ea7b03cb-Abstract-Conference.html) · 原始论文（作者报告） · 直接 Token Prediction，Training-Time Test。
- <a id="ref-P7"></a> **P7** [DFlash](https://proceedings.mlr.press/v306/chen26bv.html) · 原始论文（作者报告） · 并行块式扩散 Drafter。
- <a id="ref-P8"></a> **P8** [DSpark](https://arxiv.org/abs/2607.05147) · 原始论文（作者报告） · 半自回归 Draft 与置信度调度。
- <a id="ref-P9"></a> **P9** [HybridSpec](https://arxiv.org/abs/2611.04055) · 原始论文（作者报告） · GDN-MoE Target-aware Budget 与状态回放；2026-11 预印本。
- <a id="ref-P10"></a> **P10** [DFLare](https://aclanthology.org/2026.emnlp-main.1503/) · 原始论文（作者报告） · 增强块式 Draft 层间条件表达。
- <a id="ref-E1"></a> **E1** [ROCm AITER Multi-step Draft Graph](https://github.com/vllm-project/vllm/pull/63096) · 原始 PR（截至 2026-11-17 已合入） · 作者隔离 Draft Loop 有收益，但 E2E 变化接近噪声。
- <a id="ref-E2"></a> **E2** [Adaptive Budget Triton Kernel](https://github.com/vllm-project/vllm/pull/63421) · 原始 PR（截至 2026-11-17 已合入） · 预算计算本身的 JIT 与 Host Launch 是执行成本。
- <a id="ref-E3"></a> **E3** [XPress Acceptance Estimator](https://github.com/vllm-project/vllm/pull/65175) · 原始 PR（截至 2026-11-17 已合入） · 修正置信度未传递造成的 AV 错误裁剪。
- <a id="ref-E4"></a> **E4** [HiSparse Multi-token Verification Prefetch](https://github.com/vllm-project/vllm/pull/63801) · 原始 PR（截至 2026-11-17 已合入） · 多 Token Verify 的 KV Staging。
- <a id="ref-E5"></a> **E5** [Lookahead Block Hash for EAGLE/MTP](https://github.com/vllm-project/vllm/pull/61589) · 原始 PR（截至 2026-11-17 已合入） · Prefix KV 依赖后一 Token 的身份。
- <a id="ref-E6"></a> **E6** [Skip Unused Drafts](https://github.com/vllm-project/vllm/pull/62784) · 原始 PR（截至 2026-11-17 已合入） · Prefill-only 和已结束请求不做无用 Draft。
- <a id="ref-E7"></a> **E7** [RecoverSSM Deferred Commit](https://github.com/vllm-project/vllm/pull/66595) · 原始 PR（截至 2026-11-17 未合入） · KDA Accepted State Replay 与生命周期。
- <a id="ref-E8"></a> **E8** [DFlash2 MRV2 Full ACLGraph](https://github.com/vllm-project/vllm-ascend/pull/19512) · 原始 PR（截至 2026-11-17 已合入） · 4×910B4 作者对照；不证明 910B2 可用。
- <a id="ref-E9"></a> **E9** [Rejection Sampling ACLGraph](https://github.com/vllm-project/vllm-ascend/pull/20254) · 原始 PR（截至 2026-11-17 未合入） · Host Launch 关键路径的候选修正。
- <a id="ref-E10"></a> **E10** [Chunk Top-k/Top-p to Avoid Sampling OOM](https://github.com/vllm-project/vllm-ascend/pull/20006) · 原始 PR（截至 2026-11-17 未合入） · Spec Verify 高并发峰值排序内存。
- <a id="ref-E11"></a> **E11** [GDN Mixed Batch Metadata Fusion](https://github.com/vllm-project/vllm-ascend/pull/19954) · 原始 PR（截至 2026-11-17 已合入） · 兼容可变 Spec 与混合 Batch。
- <a id="ref-E12"></a> **E12** [RecoverSSM Commit D2H Overlap](https://github.com/vllm-project/vllm-ascend/pull/21430) · 原始 PR（截至 2026-11-17 未合入） · D2H snapshot 与 commit 排序的 Host 空泡。
- <a id="ref-E13"></a> **E13** [DFlash2 ACL Graph Mode Selection](https://github.com/vllm-project/vllm-ascend/pull/20279) · 原始 PR（截至 2026-11-17 未合入） · 与 #19512 相关但独立审查状态。
- <a id="ref-E14"></a> **E14** [DFlash/DSpark Draft Tail KV](https://github.com/vllm-project/vllm/pull/64109) · 原始 PR（截至 2026-11-17 未合入） · 草稿的尾部 KV 容量约束。
- <a id="ref-E15"></a> **E15** [Cross-TP Hybrid Decode History Reuse](https://github.com/vllm-project/vllm-ascend/pull/20755) · 原始 PR（截至 2026-11-17 未合入） · State/KV 迁移与 MTP Lookahead 的周边机制。
- <a id="ref-E16"></a> **E16** [GLM Specialized Uniform MTP Verify](https://github.com/vllm-project/vllm/pull/63102) · 原始 PR（截至 2026-11-17 已合入） · GB300 TP4 专用多 Token Verify。
- <a id="ref-E17"></a> **E17** [Varlen Graph for Fixed Speculation](https://github.com/vllm-project/vllm/pull/64915) · 原始 PR（截至 2026-11-17 关闭未合入） · 作者大幅性能数字含不稳定基线，不能视为已发布特性。
- <a id="ref-E18"></a> **E18** [Hybrid Cache Group Metadata Reuse](https://github.com/vllm-project/vllm-ascend/pull/20345) · 原始 PR（截至 2026-11-17 未合入） · GDN 组间元数据、图捕获分支一致性。
- <a id="ref-M1"></a> **M1** [TACL Survey Papers Guidance](https://transacl.org/index.php/tacl/about/submissions) · 综述组织方法
- <a id="ref-M2"></a> **M2** [PRISMA Living Systematic Reviews](https://www.prisma-statement.org/lsr) · 更新透明度的方法参考；非完成的系统综述

## 首版研究记录

- 2026-11-17 初始 R1：构建 Draft、Verify、State 与 Serving 技术组织。
- 2026-11-18 同一初始研究稿内补齐 K3 推测演算、固定 v0.23.0 源码定位、10 条 PR 证据卡、105 条候选账本、能力矩阵和可证伪的 G1–G5；未改变 revision 与 version。
