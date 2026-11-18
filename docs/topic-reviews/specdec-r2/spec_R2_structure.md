# SpecDec R2 结构稿：原文已归位（尚未论证重写）

> 结构冻结后的中间稿。以下段落原封不动迁自 R1，尚保留术语与重复；此文件用于逐段验收迁移而不是直接发布。完整原始证据在 frozen R1 commit `83330844d152de19bc1d880a0814a153551080f8`。

## 摘要与中心研究命题

主命题：在 Target 分布与 Accepted State 合法的前提下，Candidate、Verification 与 Serving 如何共同降低单位有效 Token 成本？

子问题：RQ1 分布/状态，RQ2 Candidate，RQ3 Verify，RQ4 Serving。

## 技术全景：分类与瓶颈迁移

分类：Candidate / Verification & Acceptance / State / Serving。演进由并存路线的瓶颈转移构成，并非技术先进性排序。

## 1. 推测执行的基本机制与正确性合同

### R1 来源：`worked-round`（K=3 推测轮次：候选、拒绝、修正与状态提交）

给定已经确认的前缀 P，Drafter 提出 [A, B, C]。在 Greedy 路径下，Target 在同一合法上下文中一次计算多个位置，并依次得到最大概率 Token [A, B, D]：第 1、2 个候选匹配；第 3 个候选 C 被拒绝，并使用 Target Token D 修正。逻辑上本轮提交 P+[A,B,D]，下一轮必须沿此新前缀继续，不能读取为候选 C 生成的错误 KV/SSM。若 A、B、C 全部通过，且本次 Target 计算允许 Bonus，可额外提交目标分布中的第 4 枚 Token E；达到 EOS 或预算上限时应采用对应终止规则。

概率采样另有严格合同。一个位置若 Drafter 提议 y~q，经典 acceptance 为 min(1,p(y)/q(y))，拒绝后从正残差 r(x)∝max(0,p(x)−q(x)) 中采样。举例 q(A,B,C)=(0.5,0.3,0.2)，p=(0.4,0.4,0.2)，提议 A 的接受概率为 0.8；拒绝 A 后残差只落在 B。该数值仅为手工演算示例，不代表任何模型或 Benchmark。Greedy ID 一致、概率分布一致、近似校验允许的偏差是三种不同结论。

Token Output 被采样器确认不意味着全部 State 已物化。在一些 Runner 实现中，拒绝位置的 Target 正确 Token 以 Pending 形式进入下一轮，再由该轮计算对应的 KV/SSM；其他实现可能显式补算。必须区分“已确认 Token”与“已更新设备状态”，并检查二者在调度前的 happens-before 关系。

*原文依据：P1, P2, D6, D7, E7*

### R1 来源：`correctness-and-cost`（四类正确性不变量与单位输出成本模型）

分布合同：经典精确 SpecDec 的每个输出位置与 Target 条件分布一致，拒绝后的正残差和全接受 Bonus 均必须正确；固定 Seed 的单次输出一致不等于分布相同。Token/前缀合同：Greedy 模式逐 Token 对齐 AR Oracle，Tree 验证要沿已选祖先路径裁决，不能把互斥分支同时提交。

状态合同：所有下一轮可见的 Attention KV、GDN/Mamba/KDA 递归状态、Draft KV 身份与合法 Accepted Prefix 对应，Rejected Candidate 的临时结果不能污染历史。时序与生命周期合同：Producer 完成→事件同步→消费者读取→所有消费完成后覆盖；Preemption、Prefix Hit、P/D、Graph Replay 与 Request Slot Reuse 都须满足相同的所有权和世代约束。

设第 i 个候选在前 i−1 枚均通过条件下的接受概率为 αᵢ，且轮次中无 EOS 截断，理想顺序方案每轮有效提交期望 E[N]=1+Σᵢ₌₁ᴷ∏ⱼ₌₁ⁱαⱼ（末项包含全通过后 Bonus 的贡献）。这里只是算法层计数：实际 Draft K、对每请求选择的 Verify Budget mᵣ、Target 实际 Query Rows Σᵣ(mᵣ+1) 及 Graph Padding 后的设备工作量并不相同。

单轮有效成本可写作 T_effective≈CriticalPath(Draft,Verify,Acceptance,State,Host)/E[N]；只在没有异步重叠时才可以把 T_draft+T_verify+T_sampling+T_commit+T_host 直接当作轮次墙钟。并发下目标改为给定负载的 TTFT、TPOT/ITL、Output TPS/Goodput、HBM 与错误率。高 Acceptance Length、低 Draft Microbenchmark 或高 Graph Hit Rate 均不单独决定这些结果。

*原文依据：P2, P4, D4, D6, D7, E1, E2*

## 2. 单位有效输出 Token 的统一成本模型

### R1 来源：`execution-contract`（从 Token 接受率到合法轮次的实际收益）

自回归解码必须逐步确认 Target Token。SpecDec 允许 Drafter 提前产生多个候选，并使 Target 在一个 Forward 中计算各位置的条件概率；正确的拒绝采样与 Bonus 规则确保在经典概率方案下保持目标分布。因此一次轮次真正有用的是可提交的连续 Token，而非生成的候选总数。

若平均每轮提交更多 Token，但 Draft 与 Target 的附加工作增长更快，单位 Token 的 Critical Path 仍可能变长。动态批次下，Verify Query Rows、Attention KV 带宽、MoE Expert 工作量和 Host 图准备都随宽度变化。成本模型应从 T_round/E[committed_tokens] 出发，再用设备/Host Trace 修正异步重叠与调度空泡。

*原文依据：P1, P2, D1, D4*

## 3. Candidate Generation：并存分支与依赖重构

### R1 来源：`draft-techniques`（Drafter：从历史检索与 EAGLE/MTP 到并行块生成）

无额外模型的 Lookup 依赖历史重复；独立小模型与 EAGLE/MTP 将更多条件信息注入提案，同时保留 Draft Forward、权重和 KV 开销。EAGLE-3 使用直接 Token Prediction、多层 Target Feature Fusion 与 Training-Time Test，重点改善候选质量，而不自动消除多步 Draft 的序列依赖。

DFlash 在单次轻量块扩散 Forward 中并行提出多位置候选，减少了 Draft 侧顺序步数，但长块后部的候选可能因缺少块内依赖而难以被连续接受。DSpark 在并行 Backbone 上附加 Markov 与 Confidence Head，使候选之间恢复部分依赖，并向验证预算提供位置置信度。方法选择由候选质量、Draft 计算、Target 接受和现有 Runtime 兼容性共同决定。

Speculators 的模型训练、候选采样和 Target 运行时是不同接口层。不能由论文中的速度数字推断在任意 SoC 或 vLLM-Ascend 固定版本均具有相同收益。

*原文依据：P5, P6, P7, P8, D3, E1*

## 4. Target Verification：概率估计、预算与执行成本

### R1 来源：`verification-budget`（Verification Budget：位置存活概率与 Target 计算成本）

固定验证宽度向所有请求分配相同 K，而实际候选存活概率沿序列下降。Adaptive Verification 根据各请求位置的累积接受概率分配全局预算，让高价值位置保留更多 Verify Rows；它把验证长度变成运行时资源分配问题，而不再是一个静态超参数。

代价模型必须包含预算估计本身。vLLM #65175 的 XPress Estimator 连接修复说明，缺失位置置信度可能让 Adaptive 策略错误裁剪；#63421 则把 Budget Selection 从动态编译替换为专门 Kernel，解决计算决策自身的 Host/JIT 成本。两项变更共同提示：算法分配、置信度校准与实现开销需要一起计量。

MoE Verify 的实际成本还与 Router 输出和 Expert 分布有关。HybridSpec 提出利用 Router 边界做两阶段验证，并将 GDN 合法状态恢复纳入路径；这是一条 Target-aware Budget 路线，需要与固定 K、普通 AV 及动态 Batch 一起比较。

*原文依据：D4, P8, P9, E2, E3*

## 5. Hybrid Target：Accepted-State 与生命周期

### R1 来源：`state-correctness`（Hybrid Target：接受前缀与递归状态必须共同合法）

Attention KV Cache 按位置保存历史，Recurrent 层则以 GDN/Mamba/KDA 状态总结此前序列。Verify 算过多个候选后，Sampling 可能只接受前 a 个位置；下一轮必须读取对应 Accepted Prefix 的状态，而不能继续使用最后一个已计算候选的中间状态。KV Page、Recurrent Checkpoint 与 Drafter Context 形成三套关联但不等同的生命周期。

Lookahead Hash 要处理 EAGLE/MTP 在块末还依赖下一个 Token 的 Draft KV；RecoverSSM 试图把 State Replay 与采样后提交解耦；Ascend 的 GDN Metadata Fusion 与 Host D2H/Commit Overlap 则分别降低准备和同步开销。它们都不代替逐层、逐位置的合法状态验证。

在 Preemption、Prefix Hit、P/D 迁移或 Graph Replay 后，状态身份还必须覆盖 Request Slot 世代、物理布局与事件顺序。这个问题不属于某个 Drafter 的单独优化，而是 Hybrid SpecDec 的可组合系统合同。

*原文依据：P9, E5, E7, E11, E12, E15, E18*

## 6. Serving Runtime：固定实现、Graph 与容量

### R1 来源：`fixed-source-contract`（固定源码路径：Scheduler、Proposer、Target、Sampler 与 Ascend State）

固定基线为 vLLM v0.23.0 0fc695fc6d1d82e9a5ac6835ac8e4e1c83703665 与 vLLM-Ascend v0.23.0 5cb98caaadeff42b5b62b996e34bb2aaa29d20fd。Scheduler.schedule 依据 num_computed_tokens 与 num_tokens_with_spec 为请求分配 Token Budget；BaseSpeculator.propose 接收 InputBatch、Hidden States、num_sampled/num_rejected 与 RNG 参数；GPUModelRunner.sample 在存在 Draft 时调用 rejection_sampler(logits,input_batch,draft_logits)。这些分别对应请求状态生产、候选提案和 Target 采样接口，不能仅凭同名函数推定所有新 PR 已落到旧 Pair。

vLLM GPUModelRunner.postprocess_sampled 先由 post_update 修正输出计数和 Token 历史，随后调用 model_state.postprocess_state；Ascend v0.23.0 的扩展在 postprocess 之后将 num_computed_tokens 通过另一个 Stream D2H，_update_seq_lens_cpu 等待 Event 再消费。PR #21430 的优化针对后续 MRV2 版本中 Snapshot 被 State Commit 错误纳入等待集合这一具体次序，不能把该 PR Patch 当作原生 stable Pair 代码。

Fixed Pair 的关键源码路径、行号、数据读写者和新旧 PR overlay 已单独收录于 implementation-audit.md。后续 #63421/#65175/#19512 等依赖更高版本的功能不应由 v0.23.0 标签推断可用；跨 Pair 的能力矩阵只列原作者明确报告的模型/设备/Graph 组合。

*原文依据：D6, D7, E2, E3, E8, E12*

### R1 来源：`runtime-cost`（Runtime：图回放、Sampling 与 KV Residency 的关键路径）

多步 Draft 与 Rejection Sampling 可能由多个细粒度 Kernel 组成。ROCm AITER 的多步 Draft Graph、Ascend DFlash2 Full ACLGraph 和 Rejection Sampling Graph 分别试图将 Host 调度移出高频路径，但必须保证动态地址、元数据和图捕获模式相容。原始 PR 也说明局部 Draft 时间缩短不必然使 Serving TPS 可辨地增加。

Fixed-width Spec 在请求进入/退出时会出现变长 Query Shape，可能触发图回退。Verifer 的多 Token Attention、Sampling Full Vocabulary Sort 和额外 Draft KV 又把问题扩展到 HBM、峰值 Workspace 与 Batch Planning。高并发下一个修复 OOM 的 PR 和另一个优化 Graph Coverage 的 PR，解释的是不同瓶颈，不能累计为统一 Speedup。

Prefill-only 或临近终止的请求可能根本不消费本轮草稿，跳过无用 Draft 可避免无意义计算但必须维护必要的 Draft Context。Draft Tail KV 与跨 TP Hybrid History Reuse 则把容量和恢复能力纳入服务策略。

*原文依据：E1, E4, E6, E8, E9, E10, E14, E15, E17*

### R1 来源：`capability-boundaries`（实现能力与归因边界：固定 Pair、后续 PR、设备条件）

vLLM v0.23.0 (0fc695fc6d1d) / Ascend v0.23.0 (5cb98caaadef) 的 Scheduler、Speculator、Rejection Sampler 与 Ascend D2H 路径已经按固定文件定位；这仅证明静态实现存在。实际 910B2、CANN9.1.0、具体 Drafter、TP/DP 与 Model Runner 组合的可运行性，还需要对应软件和模型的真实 Compatibility Gate。

已合入的 PR #63421 报告 H200 Qwen3-4B DSpark K7 的 Budget Kernel；#63096 报告 ROCm MI355X EAGLE3 的 Draft Graph；Ascend #19512 报告 4×910B4 TP4 DFlash2 Full ACLGraph，#19954 报告 Ascend950DT GLM/GDN Metadata Fusion。这些是各自环境下的原始记录，不构成旧稳定 Pair 的统一功能集合。

Ascend #20254 Rejection Graph、#21430 GDN D2H Overlap 与 vLLM #66595 RecoverSSM Deferred Commit 截至 2026-11-18 仍为开放 PR；vLLM #64915 的 Varlen Graph 方案已关闭未合入，使用 Synthetic Acceptance/Dummy KV 的 Rubin 测试，且部分基线预热不稳定。不能把这类候选标成官方稳定支持。完整的源码行号与组合能力矩阵可在 implementation-audit.md 查阅。

*原文依据：D6, D7, E1, E2, E7, E8, E9, E11, E12, E17*

## 7. 跨层综合：瓶颈迁移与条件性证据

### R1 来源：`engineering-evolution`（三条技术演进：已知机制、证据、反例与综合判断）

Candidate Generation：Lookup 通过重复前缀缩减 Drafter Cost；EAGLE/MTP 提供更强位置条件依赖；DFlash/DSpark 减少草稿的串行深度并引入块内关系。已知机制来自 P5–P8，工程侧 #63096 验证了减少 Draft Host Metadata 空泡能降低 Draft Loop K3 B1 571→463μs。然而作者 C32 Serving 27,741→27,572 tok/s，未观察到可稳定归因的加速。因此能成立的是“减少候选生成成本”，而不是“更快 Draft 必然提高 Serving TPS”；这个区分要求同时监控 Target、Sampling 与不同负载档位。

Target Verification：固定 K 会对低存活概率的位置浪费计算。DSpark/Adaptive Verification 使用 Confidence 与 Profiled Cost 来选择位置；#65175 证明 XPress 缺失 Estimator 数据时会错误地把接受长度压至约1，修复后 C32 AV TPS 从 2,227→5,389，但 C1 开启 AV 仍从 408 降到375。#63421 进一步证明预算选择器本身的编译和 Host Launch 可吞掉收益。同一策略在不同 Concurrency 上盈亏翻转，所以有意义的趋势是从固定 K 向“随概率与设备成本改变的 Verify Budget”转移，而非 AV 总是优于 Fixed Width。

State & Serving：经典 Acceptance 约束输出分布，Hybrid Target 还要保证 KV/SSM Accepted State 与跨轮生命周期一致。#61589 的 Lookahead Hash 让本地 Prefix Cache 覆盖更长合法块，却增加 Hash CPU 成本（32K/B16 text +12.6%）；#19954 把 GDN Metadata C32 从 2.289→0.952ms，但服务 TPS 仅 2,876.00→2,881.35（+0.19%）。#21430 指向更下游的 D2H/Commit 并行空泡，尚未提供充分统计对照。综合判断：状态和缓存优化必须明确谁生产/消费合法历史，并证明消除的确是 Serving Critical Path；内存容量、局部 Kernel 与 Host 同步各自是不同瓶颈。

上述三个结论并非“PR 数量证明趋势”。它们只在所引论文和 PR 的机制、模型、硬件及固定版本范围内成立；若关键 PR 的对照不稳定或源头状态改变，相关综合判断也须降级。证据附录保留了十条作者对照及负面结果，105 条候选索引是检索窗口而非 105 次独立核验。

*原文依据：P5, P6, P7, P8, E1, E2, E3, E5, E11, E12*

## 8. Research Gaps、验证与研究局限

### R1 来源：`research-perspective`（下一阶段：Hybrid MoE/GDN 与 Adaptive Serving 的共同边界）

更强的 Drafter 并没有消除 Target 的验证成本。低并发 Memory-bound 的优化空间与高并发 Compute/Expert-bound 的优化空间可能不同；混合模型还增加了 State Reconstruction 和跨步生命周期，故统一速度排名意义有限。合理的研究路径应先建立正确性、主机/设备关键路径和真实请求形状三个可观测量，再探索新的决策策略。

当前最有价值的交叉问题集中在：在设备成本随请求与路由变化时怎样自适应选择验证宽度；如何将合法状态提交与 Preemption/Prefix Cache/Graph Replay 统一；如何让 Draft/Target KV、图桶和 Scheduler 共享容量预算。它们都有既有论文和工程基础，可通过清晰的配对实验缩小剩余不确定性。

*原文依据：P8, P9, D4, E5, E7, E14, E17*

其余 G1–G5 与 10 条 PR 证据卡分别迁入正文研究议题和附录，不在此阶段改写原始数字。

## 附录边界

A：10 条 PR 完整证据记录；B：固定源码与支持矩阵；C：105 PR 候选账本；D：实验设计与指标定义。原版来源与状态索引保留于 R1 资产目录。
