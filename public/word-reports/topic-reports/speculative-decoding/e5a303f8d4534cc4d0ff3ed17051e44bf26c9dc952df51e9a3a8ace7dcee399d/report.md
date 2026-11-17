# Speculative Decoding：从候选生成到可验证的系统加速

> 持续研究稿 R1 · 资料截至 2026-11-17 · **作者/社区证据，不是本站复现**  
> 原始分类 PR **105 条完整保留**；其中 18 条用于当前综合分析。  
> 冻结版本：`e5a303f8d4534cc4d0ff3ed17051e44bf26c9dc952df51e9a3a8ace7dcee399d`

## 摘要

Speculative Decoding 通过低成本 Draft、多 Token Target Verify、Rejection Sampling 和合法前缀提交，降低昂贵的顺序调用；其服务收益却由草稿质量、验证宽度、Graph/Host 开销、KV/GDN 状态和动态请求共同决定。本文在完整保留 vLLM 与 vLLM-Ascend 已分类的 105 条 PR 线索（68+37）的前提下，综合官方文档、10 项原始论文与 18 条代表性社区 PR，梳理从 N-gram/EAGLE/MTP 经 DFlash/DSpark 到 Adaptive Verification/HybridSpec 的技术演进。综合判断是：提高候选接受长度不等于提高吞吐，必须同时验证 Target 输出正确性、Accepted State 生命周期和端到端关键路径确实缩短。当前证据主要是来源作者实验，尚不能支持跨模型或跨硬件的统一性能结论；本站没有运行 NPU/GPU 实验。

## 研究问题

1. 推测轮次如何在保持 Target 输出/采样合同的条件下减少串行调用？
2. 各类 Drafter 的顺序依赖、候选质量与内存代价如何进入服务关键路径？
3. 动态批次下如何让 Adaptive Verification 避免多 Token Target 计算浪费？
4. KV/SSM/GDN/KDA 与 Prefix Cache 怎样正确提交 Accepted Prefix，隔离被拒绝分支？
5. 社区作者报告的局部性能证据在何种软硬件与 Workload 条件下成立，怎样验证其 Serving 收益？

## 研究方法与证据范围

2026-10-22 至 11-11 的 21 份 vLLM/vLLM-Ascend 社区日报，完整保留已分类 105 条 PR；代表性 18 条深入综合。增补原始论文与官方资料截至 11-17。

**检索策略：** 从官方接口与源码、原始论文、原始 PR 描述/必要 Diff 入手，对照 SpecDec 一次循环的 Draft→Verify→Acceptance→State Commit。既有 methods/runtime/verification 分类不做裁撤或重新标注；本综述单独组织技术 taxonomy。

**纳入原则：**

- 保留全部原先已分类的 105 条社区 PR 线索，无论相关强弱。
- 正文的机制性结论必须明确链接一手来源，注明合入状态和适用上下文。
- 不同设备、模型、并发和采样设置下的实验条件分别列出，不抽象成统一 Speedup。

**排除的推断：**

- 不删除或重新归类任何已收录 PR；直接机制与关联优化仅在正文中区分。
- 不把作者性能数字、日报二手分析或本地研究意向冒充本站复现实验。
- 未确认的平台、开放 PR、固定版本兼容性一律不推断为已实现或生产可用。

论文提供数学与算法机制；官方文档/源码提供版本化执行合同；原始 PR 提供实现路径、条件与局部作者对照。按因果执行阶段分类，保留 7 组可追溯工程证据记录与 6 个待验证研究问题。

## 方法与实现权衡

| 核心问题 | 代表路线 | 边界与代价 | 一手来源 |
|---|---|---|---|
| 低开销 Draft 与候选质量 | N-gram/Prompt Lookup、EAGLE/MTP、DFlash/DFlash2、DSpark | AR 顺序深度、块内依赖、候选后缀质量、训练与额外 Draft KV | [P5](#source-P5) · [P6](#source-P6) · [P7](#source-P7) · [P8](#source-P8) · [D3](#source-D3) |
| 多分支 Verify 与结果正确性 | 线性候选/Tree Attention、Greedy 对齐与概率拒绝/残差采样 | 更宽 Mask/Query 与 Bonus/Reject 更新不能破坏 Target 分布 | [P2](#source-P2) · [P3](#source-P3) · [P4](#source-P4) · [E4](#source-E4) · [E10](#source-E10) |
| 高并发下动态验证预算 | Prefix Survival + Profiled Cost + Request Budget | Confidence Head/Estimator 校准和 Budget Kernel 本身消耗时间 | [D4](#source-D4) · [P8](#source-P8) · [E2](#source-E2) · [E3](#source-E3) |
| Hybrid MoE/GDN Target 代价 | HybridSpec Router-aware 两阶段 Verify + Accepted State Reconstruction | MoE Router/Experts 与 GDN/KDA 使 Verify Cost 随长度强烈变化 | [P9](#source-P9) · [D2](#source-D2) · [E7](#source-E7) · [E12](#source-E12) |
| Graph/Host 执行与 Shape | 多步 Draft Graph、ACLGraph Rejection、Varlen Verify Graph | 动态 Query Length、Host Launch、JIT、Graph 回退与资源规划 | [E1](#source-E1) · [E8](#source-E8) · [E9](#source-E9) · [E13](#source-E13) · [E17](#source-E17) |
| KV/SSM State 一致性 | Lookahead Hash、RecoverSSM、GDN Metadata 和 Deferred Commit | Rejected Candidate 不得污染历史；前缀命中与 Preemption 要同态 | [E5](#source-E5) · [E7](#source-E7) · [E11](#source-E11) · [E15](#source-E15) · [E18](#source-E18) |
| 系统资源与跨并行部署 | Prefill-only 跳过 Draft、Draft KV Tail、Cross-TP Hybrid History | 缓存容量、P/D 迁移、TP Layout 和显存争用；不能只看局部延迟 | [E6](#source-E6) · [E14](#source-E14) · [E15](#source-E15) |
| 工程证据与可复现性 | 固定版本配对与 Concurrency Sweep，分层拆解 Critical Path | 不同 SoC/Backend/Workload、作者数字与本站实测不能拼接 | [E1](#source-E1) · [E2](#source-E2) · [E8](#source-E8) · [E12](#source-E12) · [M1](#source-M1) |

## 机制分析

### 正确性：减少 Target 轮数，而不是消除自回归依赖

给定已提交前缀 x_<t，Drafter 生成候选 y_1…y_K，Target 对对应条件位置进行验证。经典概率推测采样在正确实现的条件下用 min(1, p(y)/q(y)) 决定接受，拒绝时由归一化的正残差分布补样，并在全部接受时按规则处理额外 Target token。关键源是 Leviathan et al., ICML 2023，其逻辑不同于在 Greedy 模式下简单比较 token 是否一致。Blockwise Parallel Decoding, NeurIPS 2018 给出并行预测/确认前缀的早期路线。

正确性至少拆成三个门槛： (i) Greedy 输出 token IDs 与 Target AR 严格比对；(ii) 非 Greedy 的算法采样满足 Target 分布（同一 Seed 不保证完全相同的 token 序列）；(iii) 已接受前缀之外的 KV、注意力位置、GDN/Mamba/KDA 循环状态、Draft Cache 和 Bonus Token 的更新均满足生命周期合同。不能把 GSM8K 接近或 synthetic acceptance 下吞吐提升称为 exact-sampling 正确性。

推测解码所需的计算是 *Draft → Target Verify → Acceptance/Sampling → Commit / Reuse*，而非仅一个 Draft Model。见 vLLM 官方 SpecDec 指南、vLLM Ascend SpecDec 指南、SGLang 官方 SpecDec 文档。

**本节依据：** [D1](#source-D1) · [D2](#source-D2) · [P1](#source-P1) · [P2](#source-P2) · [E5](#source-E5) · [E7](#source-E7)

### Drafter 设计：候选质量、并行性和推测深度的三角关系

Speculators 官方决策指南 是模型、训练和选择的上游入口，和 Runtime 支持矩阵需分别阅读。论文方法、已发布 checkpoint、具体 Runner 代码路径及底层设备支持属于四个不同层级，不自动等价。

**本节依据：** [D3](#source-D3) · [P3](#source-P3) · [P4](#source-P4) · [P5](#source-P5) · [P6](#source-P6) · [P7](#source-P7) · [P8](#source-P8) · [P10](#source-P10)

### 验证的代价：并行不一定划算

Target Verify 会处理大致 B × (K+1) 的 Query Rows（实际受 ragged query、Padding 和 Dynamic Verification 影响）。只有被接受的连续前缀转化为有效输出，拒绝之后执行过的行可能纯粹浪费计算。令 A = E[committed tokens/round]，顺序路径的粗略估算：

有 Stream Overlap、异步调度和多请求组批时，第二行不能直接用 Kernel 求和。理想情况要同时缩短 Target 执行轮次、避免高 Batch 下 B×K 造成计算瓶颈、控制新的中间缓存。高 Acceptance Rate 只影响分母，无法保证分子变小。

vLLM Adaptive Verification 在每请求/位置估计 Prefix Survival，并用实测 Step Cost Profile 限制全局验证 Token 预算。其适用方法与硬件版本必须按文档时间核验；

vLLM #63421 针对 Budget Kernel 的 Host JIT/Launch 开销，vLLM #65175 针对 XPress 与 Acceptance Estimator 接口；说明动态预算本身是执行路径；

vLLM #64915 针对固定推测宽度时的变长 Decode CUDA Graph，vLLM #63801 专为多 Token Verify 预取历史 KV；说明 Verify 的 Attention/Graph 形状不同于普通单 Token Decode；

Ascend #20254 将 Rejection Sampling 小 Kernel 纳入 ACL Graph 以压低 Host 提交开销，Ascend #20006 解决大批验证行下 Top-k/Top-p 的峰值显存问题。

这些 PR 互不构成一个统一的“已经集成优化栈”；每个 PR 自己的依赖、支持配置、对照实验和修订历史须独立标记。

**本节依据：** [D4](#source-D4) · [P2](#source-P2) · [P8](#source-P8) · [P9](#source-P9) · [E2](#source-E2) · [E3](#source-E3) · [E4](#source-E4) · [E17](#source-E17)

### Draft 侧工程：减少不必要的多步计算和内存

AR Drafter 可能需要 K 次 Draft Decode，并在每步维护 Meta/Cache；并行 Drafter 则转向一次大 Forward + Candidate Selector / Markov Sampling。两者均受到 Graph Shape、启动 JIT、KV 容量与 Target 隐状态传递的约束。

vLLM #63096：ROCm AITER Draft Backend 的 Graph/Metadata 更新能力；只在其指定 Draft Backend 与硬件条件下成立。

Ascend #19512 / #20279：DFlash2 Draft 在 MRV2 上的 Full ACLGraph Capture 和 Replay 路径；二者存在相关/重叠实现，必须检查 upstream 实际基线再选取证据。

vLLM #62784：对不会被消费的 Draft 决定 K=0；与普通 P/D Prefill 优化的区别在于它确实更改 Speculator 的 Draft 调用。

vLLM #64109：DFlash/DSpark Drafter Sliding-window KV 的尾部驻留约束；不能直接沿用 Target 的历史 KV 留存策略。

vLLM #65553 / #64612：分别作用于 DSpark / DFlash 的 Draft KV FP8 配置；效益首先是 Draft 侧显存，不能不测量就推断 TPOT 提升。

**本节依据：** [D3](#source-D3) · [E1](#source-E1) · [E6](#source-E6) · [E8](#source-E8) · [E13](#source-E13) · [E14](#source-E14)

### Correct State：Hybrid Model 的必要条件

对于传统全注意力模型，最先可见的是 KV Slots/Block Table 与 accepted prefix 的映射。对于 GDN/Mamba/KDA，Target Verify 还产生递归更新的隐藏状态；拒绝位置之后的候选中间态不能流入下一轮。必须区分：Checkpoint（历史合法状态）→ Speculative Intermediate → Accepted Prefix Commit。这不是可忽略的 Kernel 细节，而是 SpecDec 准确性的构成部分。

vLLM #66595 提出在下一轮 Verify 中回放上轮 accepted tokens、推迟对应 Commit 的实现合同；其适用的是描述中指定的 KDA/RecoverSSM 实现。

vLLM #65182 针对 Mamba2 Spec 的共享 accepted-token / graph metadata；对应的缓冲区别名关系必须正确。

Ascend #21430 优化 GDN Hybrid + SpecDec 下 Host Copy 与 RecoverSSM Commit 的同步顺序；

Ascend #19954 覆盖可变推测长度、混合 Spec/Non-spec 批次的 GDN metadata；

vLLM #61589 为 EAGLE/MTP Prefix Cache 的 Lookahead Token 身份提供了更细的缓存命中契约。

特别注意：“采用 RecoverSSM/重放”是一个机制路线，不是所有 vLLM/Ascend 版本、GDN/KDA 模型都已经实现或支持的结论。不能拿 KDA 上的实现通过，直接断言 Qwen GDN Target 在 910B2 上正确。硬件与版本由官方文档和目标 PR Diff 共同限定。

**本节依据：** [D2](#source-D2) · [P9](#source-P9) · [E5](#source-E5) · [E7](#source-E7) · [E11](#source-E11) · [E12](#source-E12) · [E18](#source-E18)

### 证据体系：按社区和运行阶段组织，而不是 PR 标题聚合

当前网站扫描结果的 methods、runtime、verification 是历史初筛标签，并不直接等价于严格的研究 taxonomy。正式报告需要建立二级交叉映射：

Draft / Model：EAGLE/MTP 与 DFlash/DSpark、候选选择、Draft Context、Graph、Draft KV；

Verify / Sampling：Target 多 Token Attention、Budget、Rejection Sampler、Bonus Token；

State / Lifetime：KV 的跨轮复用，GDN/Mamba/KDA Checkpoint、Commit、Rejected Path；

Serving / Parallelism：批次变化、P/D Prefill-only、TP/DP/PP、Async Scheduling、设备/Host Launch；

Evidence / Baseline：PR 状态和 Diff、论文条件、平台与配置、Greedy/Probabilistic、是否独立复现。

明确排除原则：普通 MoE Fusion、普通 Single-token Decode、通用 KV Store/Pool、QLI Sparse Indexer 候选块等，即使 README 或实验命令中出现 MTP/DSpark，也不作为 SpecDec 主干证据。见 24 条原始来源人工排除索引；排除仅意味着不属本专题的主要工程机制，仍可从其他方向建立链接。

**本节依据：** [D1](#source-D1) · [D2](#source-D2) · [D5](#source-D5) · [E4](#source-E4) · [E15](#source-E15) · [E16](#source-E16)

### 如何做公平 Benchmark 和因果归因

最小实验矩阵不是“单组开启 Spec、然后报 TPS”，而是：

Synthetic Acceptance 对隔离 Verify Kernel 的成本非常有用，不保证生成 Token 符合 Target 分布；必须另有真实接受率与输出正确性的闭环。对 K、Batch 或设备变化导致的收益，不应把多个论文/PR 的速度直接相加或取最大值作为预期值。

**本节依据：** [D4](#source-D4) · [E1](#source-E1) · [E2](#source-E2) · [E8](#source-E8) · [E9](#source-E9) · [E10](#source-E10) · [E12](#source-E12) · [E17](#source-E17)

### 综合判断：以可验证的系统收益而非单一接受率为目标

完整推测轮次包括 Draft、Target Verify、Sampling、Accepted-State Commit，以及 Serving 在每轮之前与之后的调度。不同算法优化不同子段，任何单点提速都需要经过真正的性能归因，特别是 Host 图准备、KV/GDN 状态与拥塞切换。

对于并行草稿，较长的候选链可能在 Target 上产生更多被拒绝位置。Adaptive Verification 根据各位置存活概率和设备预算优化 Target 计算量；HybridSpec 进一步把 GDN+MoE 的路由及状态成本建模。它们提供现成强基线，而不是空白研究方向的证明。

本报告以正式的 vLLM、vLLM-Ascend、Speculators、SGLang 文档以及历史论文和 18 条原始 PR 做技术综合；所有 105 条组织分类 PR 保持取材资格。作者报告的速度数字仍停留在特定设备、模型和 PR 修订，不代表本站独立复现。

**本节依据：** [D1](#source-D1) · [D2](#source-D2) · [D3](#source-D3) · [D4](#source-D4) · [P7](#source-P7) · [P8](#source-P8) · [P9](#source-P9) · [E1](#source-E1) · [E2](#source-E2) · [E12](#source-E12)

## 工程证据：条件与结果分开核验

### ROCm Multi-step Draft Graph

**机制：** 允许 AITER Metadata 视图在多个 Draft 步原位更新

| 维度 | 作者记录或核验状态 |
|---|---|
| 证据层级 | 已合入 PR 的作者报告；本站未复现 |
| 环境 | MI355X / ROCm AITER |
| 修订 | vLLM #63096 |
| 工作量 | K=3/7，B=1/8/32 与 Serving Concurrency 对照 |
| 结果 | 作者报告 Draft Loop 约90–120µs/轮减少；端到端 TPS 变化接近噪声。 |
| 限制 | 不能把 Draft Microbenchmark 的改善当作服务加速。 |
| 核验 | 原始 PR 描述阅读 |

来源：[E1](#source-E1)

### Adaptive Verification Budget Selector

**机制：** Warmup 预编译单个 Triton Budget Kernel

| 维度 | 作者记录或核验状态 |
|---|---|
| 证据层级 | 已合入 PR 的作者报告；本站未复现 |
| 环境 | H200，Qwen3-4B + DSpark |
| 修订 | vLLM #63421 |
| 工作量 | GSM8K 128 Prompts，K7，Concurrency16 |
| 结果 | 作者报告 Host Budget 76–90µs→约15µs，Output TPS 4783→6803。 |
| 限制 | 不能推广到任意 SoC、并发或 Drafter。 |
| 核验 | 原始 PR 描述阅读 |

来源：[E2](#source-E2)

### Fixed-width Speculation 的 Varlen Graph

**机制：** 动态组批时复用可变长度 Decode Graph

| 维度 | 作者记录或核验状态 |
|---|---|
| 证据层级 | Closed/Not merged；作者报告，本站未复现 |
| 环境 | 4×Rubin，DeepSeek-V4.1-Flash，DP4/EP4 |
| 修订 | vLLM #64915（未合并） |
| 工作量 | DSpark K5，高并发长输入 |
| 结果 | 作者报告图覆盖与 TPS 大幅改善，但至少一组对照未通过稳定性条件。 |
| 限制 | 不能作为 main 已有能力或稳定收益证据。 |
| 核验 | 原始 PR 描述阅读 |

来源：[E17](#source-E17)

### Ascend DFlash2 Full ACLGraph

**机制：** MRV2 草稿 Backbone/Candidate Selector/Proposal Cache 的完整图复用

| 维度 | 作者记录或核验状态 |
|---|---|
| 证据层级 | #19512 已合入、#20279 未合入；本站未复现 |
| 环境 | 4×910B4、Qwen3.8-27B、TP4、K7（#19512） |
| 修订 | Ascend #19512/#20279 |
| 工作量 | 五场景、384 请求/部署，作者分日对照 |
| 结果 | 作者提供图捕获及服务对照证据；此处不合并为跨设备统一收益。 |
| 限制 | 跨天对照与新旧版本差异，不能推导旧 910B2 兼容。 |
| 核验 | 两 PR 原始描述阅读 |

来源：[E8](#source-E8) · [E13](#source-E13)

### Rejection Host Launch 与 Peak HBM

**机制：** ACLGraph 汇总采样 Kernel；Chunk Top-k/p 的中间排序缓冲

| 维度 | 作者记录或核验状态 |
|---|---|
| 证据层级 | 均为未合入 PR 的作者报告 |
| 环境 | Ascend 910B 与 Qwen3-8B DSpark TP4 高并发 |
| 修订 | Ascend #20254/#20006 |
| 工作量 | K+1 行随并发增长；多次 Triton Host Launch |
| 结果 | 作者报告 Host 约1.98ms 而设备约110–170µs，并记录高并发 Sampling OOM。 |
| 限制 | 不同 PR 不构成同一次加速对照；解决 OOM 亦不保证 TPS 提升。 |
| 核验 | 两 PR 原始描述阅读 |

来源：[E9](#source-E9) · [E10](#source-E10)

### RecoverSSM State Commit 与 Host Overlap

**机制：** 下轮 Verify 重放合法状态，或提前 D2H Snapshot 让 Commit 与后续输入准备重叠

| 维度 | 作者记录或核验状态 |
|---|---|
| 证据层级 | 均未合入，作者报告 |
| 环境 | KDA GPU 指定配置；Ascend A5 Qwen GDN/MTP |
| 修订 | vLLM #66595 / Ascend #21430 |
| 工作量 | 分别 Concurrency128 / 72 |
| 结果 | 作者分别报告 KDA c128 +5.4% 输出 TPS；A5 c72 TPS 约24→30。 |
| 限制 | 模型、设备、运行时不同，不能迁移成旧固定 Pair 结果。 |
| 核验 | 原始 PR 描述阅读 |

来源：[E7](#source-E7) · [E12](#source-E12)

### Lookahead Prefix Hash 与 Cross-TP Hybrid History

**机制：** Draft KV 的后一 Token 身份；迁移时保持 Hybrid Recurrent Checkpoint 所有权

| 维度 | 作者记录或核验状态 |
|---|---|
| 证据层级 | #61589 已合入，#20755 未合入 |
| 环境 | vLLM Local Prefix Cache；Ascend 8×910 + Qwen3.8-MTP3（作者配置） |
| 修订 | vLLM #61589 / Ascend #20755 |
| 工作量 | Prefix Hit 与跨 TP1/2/4 Restore |
| 结果 | #20755 作者报告 Restore TTFT 814.66→289.54ms；不是 Spec Step TPOT 提升。 |
| 限制 | 指标属 State Restore 而非 Draft/Verify，PR 未合入且本站未复现。 |
| 核验 | 两 PR 原始描述阅读 |

来源：[E5](#source-E5) · [E15](#source-E15)

## Research Gaps 与验证路径

### G1 · Hybrid State 全生命周期正确性

**观察：** RecoverSSM、Lookahead Hash 与 GDN Metadata 有不同代码入口，部分重要 PR 未合入。

**问题：** 拒绝、Prefix Hit、Preemption 和 P/D 迁移后，Checkpoint 是否仍与 Target AR 合法前缀一致？

**验证方案：** 同 Token 输入与绝对位置比较各层 KV/SSM，覆盖 0/1/K 接受、Bonus、重新加入和 Graph Replay。

**状态：** evidence-gap · **依据：** [E5](#source-E5) · [E7](#source-E7) · [E11](#source-E11) · [E15](#source-E15)

### G2 · Adaptive Budget 与 Hybrid Target 成本的联合模型

**观察：** 已有 AV/DSpark/HybridSpec，却缺少同 Target/同设备的完整竞争对照。

**问题：** 在当前强基线已知的前提下，同时考虑 Draft、Verify、Sampler 与 State 还有可重复的 Goodput 收益吗？

**验证方案：** AR/Fixed-K/AV/Hybrid-aware 同前态多轮交错 A/B；记录 K、存活概率、Query Rows、TPOT/Goodput。

**状态：** hypothesis · **依据：** [D4](#source-D4) · [P8](#source-P8) · [P9](#source-P9) · [E2](#source-E2) · [E3](#source-E3)

### G3 · 动态 Verify Shape 与 Graph 资源的联合规划

**观察：** Draft/Verify/Sampler 各有 Graph PR，部分尚未合并，Host CPU 时间可能不同。

**问题：** 在不同模型与 Concurrency 下，变长形状和图重放什么时候比即时回退更划算？

**验证方案：** 固定工作量分离 Graph Coverage、JIT/Host Dispatch、设备执行及同步，记录回退与峰值 HBM。

**状态：** hypothesis · **依据：** [E1](#source-E1) · [E8](#source-E8) · [E9](#source-E9) · [E17](#source-E17)

### G4 · Draft KV 与 Target KV 的容量竞争

**观察：** Draft Tail 以及 Prefix Lookahead 身份带来不同于普通 KV 的生命周期。

**问题：** 长上下文与动态批次下，较小 Draft KV 的容量收益能否传到端到端调度？

**验证方案：** 按 Prompt/Prefix Hit/K/窗口记录 Draft/Target KV Pages、Eviction、Preemption 与 Serve Latency。

**状态：** hypothesis · **依据：** [E5](#source-E5) · [E6](#source-E6) · [E14](#source-E14)

### G5 · 跨平台兼容矩阵与真实实施边界

**观察：** ROCm、GB300、Ascend 910B4/A5 对 Graph、Recurrent 和 Sampling 的支持不同。

**问题：** 哪些性能提升是算法普适，哪些依赖本机原生算子、驱动和 Graph Mode？

**验证方案：** 逐平台固定 Pair、检查官方能力表，再以相同 Correctness 与 Workload 验证；不跨平台移植数值。

**状态：** evidence-gap · **依据：** [D1](#source-D1) · [D2](#source-D2) · [E1](#source-E1) · [E8](#source-E8) · [E16](#source-E16)

### G6 · 局部优化到 Serving 收益的因果传递

**观察：** #63096 的 Draft Loop 改善未稳定转为 Serving TPS，#64915 未合并且一组基线不稳定。

**问题：** 在多次交错 A/B 下，TPOT/TTFT/Goodput 与 HBM 是否同时可接受且可重现？

**验证方案：** Concurrency/Length 网格、前态对齐、Warmup 与波动区间、Output Correctness 和调度关键路径跟踪。

**状态：** evidence-gap · **依据：** [E1](#source-E1) · [E2](#source-E2) · [E12](#source-E12) · [E17](#source-E17)

## 局限与证据边界

- 选取性叙述综述，非完全覆盖全部论文与社区的系统综述；105 条 PR 保留且均可浏览，但只综合其中 18 条代表性工程记录。
- 当前仅抽查公开原始文档和 PR，不曾执行任何 NPU/GPU、E2E Serving、Greedy 或概率分布的独立复现。
- 部分核心 PR 尚未合入，官方 latest 文档与用户的固定旧版本平台不能自动等价。真实可用性必须重新执行兼容矩阵 Gate。
- 不同作者性能记录分别对应 MI355X、H200、GB300/Rubin、910B4/A5 等配置，不能拼接倍数或外推到 910B2。
- Research Gaps 仅描述本次证据范围下尚未闭环的交叉条件，不代表全领域无人研究或存在已被证明的新贡献。
- 正式学术稿、独立专家审阅与 PDF 导出尚未完成；当前报告可在本分支作为动态研究稿阅读。

## 参考来源

1. <a id="source-D1"></a> **D1** [vLLM Speculative Decoding Guide](https://docs.vllm.ai/en/latest/features/speculative_decoding/) · documentation · 官方文档或源码（版本相关） · 运行方法的实际平台支持按版本和配置核验。

2. <a id="source-D2"></a> **D2** [vLLM Ascend Speculative Decoding Guide](https://docs.vllm.ai/projects/ascend/en/main/user_guide/feature_guide/speculative_decoding.html) · documentation · 官方文档或源码（版本相关） · 注意 MRV2/SoC/CANN 兼容边界。

3. <a id="source-D3"></a> **D3** [Speculators Algorithm Decision Guide](https://docs.vllm.ai/projects/speculators/en/latest/user_guide/algorithms/decision_guide/) · documentation · 官方文档或源码（版本相关） · Draft 架构和训练适配不是 Runtime 兼容矩阵。

4. <a id="source-D4"></a> **D4** [vLLM Adaptive Verification Guide](https://docs.vllm.ai/en/latest/features/speculative_decoding/adaptive_verification/) · documentation · 官方文档或源码（版本相关） · 采用存活概率和实测 Shape Cost 的预算。

5. <a id="source-D5"></a> **D5** [SGLang Speculative Decoding](https://docs.sglang.io/docs/advanced_features/speculative_decoding) · documentation · 官方文档或源码（版本相关） · 跨引擎机制对照，不迁移其性能数字。

6. <a id="source-D6"></a> **D6** [vLLM SpecDec Runtime Source](https://github.com/vllm-project/vllm/tree/main/vllm/v1/spec_decode) · documentation · 官方文档或源码（版本相关） · 源码入口，请在使用时固定 commit。

7. <a id="source-D7"></a> **D7** [vLLM Ascend MRV2 SpecDec Source](https://github.com/vllm-project/vllm-ascend/tree/main/vllm_ascend/worker/v2/spec_decode) · documentation · 官方文档或源码（版本相关） · Proposer/Sampler/Graph 侧源码入口，请固定 commit。

8. <a id="source-P1"></a> **P1** [Blockwise Parallel Decoding](https://papers.nips.cc/paper/8212-blockwise-parallel-decoding-for-deep-autoregressive-models) · paper · 原始论文（作者报告） · 早期多 Token 提案与确认。

9. <a id="source-P2"></a> **P2** [Speculative Decoding — Leviathan et al.](https://proceedings.mlr.press/v202/leviathan23a.html) · paper · 原始论文（作者报告） · 概率接受与残差分布的正确性基线。

10. <a id="source-P3"></a> **P3** [Medusa](https://proceedings.mlr.press/v235/cai24b.html) · paper · 原始论文（作者报告） · 多头草稿及候选树。

11. <a id="source-P4"></a> **P4** [SpecInfer](https://doi.org/10.1145/3620666.3651335) · paper · 原始论文（作者报告） · 树型 Target Verify。

12. <a id="source-P5"></a> **P5** [EAGLE](https://proceedings.mlr.press/v235/li24bt.html) · paper · 原始论文（作者报告） · 基于 Target Feature 的 AR Draft。

13. <a id="source-P6"></a> **P6** [EAGLE-3](https://proceedings.nips.cc/paper_files/paper/2025/hash/c7b5a35ea98b62512a869c19ea7b03cb-Abstract-Conference.html) · paper · 原始论文（作者报告） · 直接 Token Prediction，Training-Time Test。

14. <a id="source-P7"></a> **P7** [DFlash](https://proceedings.mlr.press/v306/chen26bv.html) · paper · 原始论文（作者报告） · 并行块式扩散 Drafter。

15. <a id="source-P8"></a> **P8** [DSpark](https://arxiv.org/abs/2607.05147) · paper · 原始论文（作者报告） · 半自回归 Draft 与置信度调度。

16. <a id="source-P9"></a> **P9** [HybridSpec](https://arxiv.org/abs/2611.04055) · paper · 原始论文（作者报告） · GDN-MoE Target-aware Budget 与状态回放；2026-11 预印本。

17. <a id="source-P10"></a> **P10** [DFLare](https://aclanthology.org/2026.emnlp-main.1503/) · paper · 原始论文（作者报告） · 增强块式 Draft 层间条件表达。

18. <a id="source-E1"></a> **E1** [ROCm AITER Multi-step Draft Graph](https://github.com/vllm-project/vllm/pull/63096) · pr · 原始 PR（截至 2026-11-17 已合入） · 作者隔离 Draft Loop 有收益，但 E2E 变化接近噪声。

19. <a id="source-E2"></a> **E2** [Adaptive Budget Triton Kernel](https://github.com/vllm-project/vllm/pull/63421) · pr · 原始 PR（截至 2026-11-17 已合入） · 预算计算本身的 JIT 与 Host Launch 是执行成本。

20. <a id="source-E3"></a> **E3** [XPress Acceptance Estimator](https://github.com/vllm-project/vllm/pull/65175) · pr · 原始 PR（截至 2026-11-17 已合入） · 修正置信度未传递造成的 AV 错误裁剪。

21. <a id="source-E4"></a> **E4** [HiSparse Multi-token Verification Prefetch](https://github.com/vllm-project/vllm/pull/63801) · pr · 原始 PR（截至 2026-11-17 已合入） · 多 Token Verify 的 KV Staging。

22. <a id="source-E5"></a> **E5** [Lookahead Block Hash for EAGLE/MTP](https://github.com/vllm-project/vllm/pull/61589) · pr · 原始 PR（截至 2026-11-17 已合入） · Prefix KV 依赖后一 Token 的身份。

23. <a id="source-E6"></a> **E6** [Skip Unused Drafts](https://github.com/vllm-project/vllm/pull/62784) · pr · 原始 PR（截至 2026-11-17 已合入） · Prefill-only 和已结束请求不做无用 Draft。

24. <a id="source-E7"></a> **E7** [RecoverSSM Deferred Commit](https://github.com/vllm-project/vllm/pull/66595) · pr · 原始 PR（截至 2026-11-17 未合入） · KDA Accepted State Replay 与生命周期。

25. <a id="source-E8"></a> **E8** [DFlash2 MRV2 Full ACLGraph](https://github.com/vllm-project/vllm-ascend/pull/19512) · pr · 原始 PR（截至 2026-11-17 已合入） · 4×910B4 作者对照；不证明 910B2 可用。

26. <a id="source-E9"></a> **E9** [Rejection Sampling ACLGraph](https://github.com/vllm-project/vllm-ascend/pull/20254) · pr · 原始 PR（截至 2026-11-17 未合入） · Host Launch 关键路径的候选修正。

27. <a id="source-E10"></a> **E10** [Chunk Top-k/Top-p to Avoid Sampling OOM](https://github.com/vllm-project/vllm-ascend/pull/20006) · pr · 原始 PR（截至 2026-11-17 未合入） · Spec Verify 高并发峰值排序内存。

28. <a id="source-E11"></a> **E11** [GDN Mixed Batch Metadata Fusion](https://github.com/vllm-project/vllm-ascend/pull/19954) · pr · 原始 PR（截至 2026-11-17 已合入） · 兼容可变 Spec 与混合 Batch。

29. <a id="source-E12"></a> **E12** [RecoverSSM Commit D2H Overlap](https://github.com/vllm-project/vllm-ascend/pull/21430) · pr · 原始 PR（截至 2026-11-17 未合入） · D2H snapshot 与 commit 排序的 Host 空泡。

30. <a id="source-E13"></a> **E13** [DFlash2 ACL Graph Mode Selection](https://github.com/vllm-project/vllm-ascend/pull/20279) · pr · 原始 PR（截至 2026-11-17 未合入） · 与 #19512 相关但独立审查状态。

31. <a id="source-E14"></a> **E14** [DFlash/DSpark Draft Tail KV](https://github.com/vllm-project/vllm/pull/64109) · pr · 原始 PR（截至 2026-11-17 未合入） · 草稿的尾部 KV 容量约束。

32. <a id="source-E15"></a> **E15** [Cross-TP Hybrid Decode History Reuse](https://github.com/vllm-project/vllm-ascend/pull/20755) · pr · 原始 PR（截至 2026-11-17 未合入） · State/KV 迁移与 MTP Lookahead 的周边机制。

33. <a id="source-E16"></a> **E16** [GLM Specialized Uniform MTP Verify](https://github.com/vllm-project/vllm/pull/63102) · pr · 原始 PR（截至 2026-11-17 已合入） · GB300 TP4 专用多 Token Verify。

34. <a id="source-E17"></a> **E17** [Varlen Graph for Fixed Speculation](https://github.com/vllm-project/vllm/pull/64915) · pr · 原始 PR（截至 2026-11-17 关闭未合入） · 作者大幅性能数字含不稳定基线，不能视为已发布特性。

35. <a id="source-E18"></a> **E18** [Hybrid Cache Group Metadata Reuse](https://github.com/vllm-project/vllm-ascend/pull/20345) · pr · 原始 PR（截至 2026-11-17 未合入） · GDN 组间元数据、图捕获分支一致性。

36. <a id="source-M1"></a> **M1** [TACL Survey Papers Guidance](https://transacl.org/index.php/tacl/about/submissions) · methodology · 综述组织方法

37. <a id="source-M2"></a> **M2** [PRISMA Living Systematic Reviews](https://www.prisma-statement.org/lsr) · methodology · 更新透明度的方法参考；非完成的系统综述

## 版本记录

- 2026-11-17: R1：保留 105 条社区 PR 及原分类；建立来源到机制的系统综合、7 组作者实验对照和 6 个验证假设。
