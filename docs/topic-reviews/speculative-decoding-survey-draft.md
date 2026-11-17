# Speculative Decoding — 机制与系统研究源稿

> 资料截至：**2026-11-17**。状态：**未发布研究源稿 / SOURCE REVIEW**。本稿不属于学术投稿稿件、独立复现实验或已通过验收的动态报告。
>
> 来源次序：**vLLM / vLLM-Ascend / SGLang 官方文档与源码 → 原始社区 PR / Diff → 原始论文**；日报仅用于回溯候选及收录日期。所有速度与测试描述如非另有标注，均为 PR/论文作者陈述；**本站未执行 GPU/NPU 基准测试**。
>
> 原始网页候选：21 期日报，105 条；截至本稿完成的人工范围排除 24 条，当前 81 条仍为 *rule-matched leads*，不能作为“81 条已准入工程证据”。排除记录见 `speculative-decoding-exclusions-20261117.json`；**原始日报不修改**。

## 研究问题

1. SpecDec 如何在多个 Token 上降低 Target 顺序调用，同时保持与对应 Target 自回归采样一致的输出合同？
2. EAGLE/MTP 的 AR 草稿与 DFlash/DSpark 的 Parallel/Semi-AR 草稿，分别在哪段关键路径消耗时间？
3. 为何高 Acceptance Length 未必改善 TPOT / Goodput？如何在动态 Batch 下选择 Draft/Verify 长度？
4. Attention、Sampling、Graph、KV/SSM State 与 P/D 调度中的哪些实现是真正的 SpecDec 依赖，而不是普通推理优化？
5. Hybrid GDN/Mamba/KDA + MoE 的正确状态提交与成本可否纳入统一的验证预算，需满足怎样的可复现实验门槛？

## 1. 正确性：减少 Target 轮数，而不是消除自回归依赖

给定已提交前缀 `x_<t`，Drafter 生成候选 `y_1…y_K`，Target 对对应条件位置进行验证。经典概率推测采样在正确实现的条件下用 `min(1, p(y)/q(y))` 决定接受，拒绝时由归一化的正残差分布补样，并在全部接受时按规则处理额外 Target token。关键源是 [Leviathan et al., ICML 2023](https://proceedings.mlr.press/v202/leviathan23a.html)，其逻辑不同于在 Greedy 模式下简单比较 token 是否一致。[Blockwise Parallel Decoding, NeurIPS 2018](https://papers.nips.cc/paper/8212-blockwise-parallel-decoding-for-deep-autoregressive-models) 给出并行预测/确认前缀的早期路线。

**正确性至少拆成三个门槛：** (i) Greedy 输出 token IDs 与 Target AR 严格比对；(ii) 非 Greedy 的算法采样满足 Target 分布（同一 Seed 不保证完全相同的 token 序列）；(iii) 已接受前缀之外的 KV、注意力位置、GDN/Mamba/KDA 循环状态、Draft Cache 和 Bonus Token 的更新均满足生命周期合同。不能把 GSM8K 接近或 synthetic acceptance 下吞吐提升称为 exact-sampling 正确性。

推测解码所需的计算是 *Draft → Target Verify → Acceptance/Sampling → Commit / Reuse*，而非仅一个 Draft Model。见 [vLLM 官方 SpecDec 指南](https://docs.vllm.ai/en/latest/features/speculative_decoding/)、[vLLM Ascend SpecDec 指南](https://docs.vllm.ai/projects/ascend/en/main/user_guide/feature_guide/speculative_decoding.html)、[SGLang 官方 SpecDec 文档](https://docs.sglang.io/docs/advanced_features/speculative_decoding)。

## 2. Drafter 设计：候选质量、并行性和推测深度的三角关系

| 路线 | 代表源 | 工程意义 | 必须明确的限制 |
| --- | --- | --- | --- |
| History lookup | N-gram / Suffix（[vLLM](https://docs.vllm.ai/en/latest/features/speculative_decoding/)） | 几乎不增加权重，适合高重复文本及代码 | 命中分布决定质量；不能把特定 Prompt 重复性外推到一般请求 |
| 小 AR Drafter | 独立 Draft Model、EAGLE、原生 MTP | 更明确的条件依赖，常有较好的 Acceptance | 若 K 次 Draft 依次串行，Draft latency 本身可能主导 |
| EAGLE-3 | [NeurIPS 2025](https://papers.neurips.cc/paper_files/paper/2025/hash/c7b5a35ea98b62512a869c19ea7b03cb-Abstract-Conference.html) | 使用 Target 多层表示，Token Prediction / Training-time Test | Feature 提取、Draft KV、Aux Hidden State、逐步候选执行需要系统配合 |
| Parallel Draft | [DFlash, ICML 2026](https://proceedings.mlr.press/v306/chen26bv.html) | 单次轻量块式 Forward 生成多位置候选，降低 Draft 顺序深度 | 块内位置依赖较弱时，后段接受率下降；Target 多 Token Verify 更昂贵 |
| Semi-AR Draft | [DSpark, arXiv 2607.05147](https://arxiv.org/abs/2607.05147) | 并行 Backbone + 轻量 Markov Head + Confidence Head | 顺序采样链、Logits Cache 与置信度校准不是零成本 |
| Target-aware Budget | [HybridSpec, arXiv 2611.04055](https://arxiv.org/abs/2611.04055) | 将 Hybrid GDN/MoE Verify 的成本纳入选择，不是单纯增大 K | Paper 结果不能代替具体 vLLM/Ascend 代码已集成或固定硬件可复现 |

[Speculators 官方决策指南](https://docs.vllm.ai/projects/speculators/en/latest/user_guide/algorithms/decision_guide/) 是模型、训练和选择的上游入口，和 Runtime 支持矩阵需分别阅读。论文方法、已发布 checkpoint、具体 Runner 代码路径及底层设备支持属于四个不同层级，不自动等价。

## 3. 验证的代价：并行不一定划算

Target Verify 会处理大致 `B × (K+1)` 的 Query Rows（实际受 ragged query、Padding 和 Dynamic Verification 影响）。只有被接受的**连续前缀**转化为有效输出，拒绝之后执行过的行可能纯粹浪费计算。令 `A = E[committed tokens/round]`，顺序路径的粗略估算：

```text
effective_time_per_token ≈ round_critical_path_time / A
round_critical_path_time = Draft + Verify + Sampling + State + Scheduling/Graph
```

有 Stream Overlap、异步调度和多请求组批时，第二行**不能直接用 Kernel 求和**。理想情况要同时缩短 Target 执行轮次、避免高 Batch 下 `B×K` 造成计算瓶颈、控制新的中间缓存。高 Acceptance Rate 只影响分母，无法保证分子变小。

**官方机制与工程证据：**
- [vLLM Adaptive Verification](https://github.com/vllm-project/vllm/blob/main/docs/features/speculative_decoding/adaptive_verification.md) 在每请求/位置估计 Prefix Survival，并用实测 Step Cost Profile 限制全局验证 Token 预算。其适用方法与硬件版本必须按文档时间核验；
- [vLLM #63421](https://github.com/vllm-project/vllm/pull/63421) 针对 Budget Kernel 的 Host JIT/Launch 开销，[vLLM #65175](https://github.com/vllm-project/vllm/pull/65175) 针对 XPress 与 Acceptance Estimator 接口；说明动态预算本身是执行路径；
- [vLLM #64915](https://github.com/vllm-project/vllm/pull/64915) 针对固定推测宽度时的变长 Decode CUDA Graph，[vLLM #63801](https://github.com/vllm-project/vllm/pull/63801) 专为多 Token Verify 预取历史 KV；说明 Verify 的 Attention/Graph 形状不同于普通单 Token Decode；
- [Ascend #20254](https://github.com/vllm-project/vllm-ascend/pull/20254) 将 Rejection Sampling 小 Kernel 纳入 ACL Graph 以压低 Host 提交开销，[Ascend #20006](https://github.com/vllm-project/vllm-ascend/pull/20006) 解决大批验证行下 Top-k/Top-p 的峰值显存问题。

这些 PR 互不构成一个统一的“已经集成优化栈”；每个 PR 自己的依赖、支持配置、对照实验和修订历史须独立标记。

## 4. Draft 侧工程：减少不必要的多步计算和内存

AR Drafter 可能需要 K 次 Draft Decode，并在每步维护 Meta/Cache；并行 Drafter 则转向一次大 Forward + Candidate Selector / Markov Sampling。两者均受到 Graph Shape、启动 JIT、KV 容量与 Target 隐状态传递的约束。

- [vLLM #63096](https://github.com/vllm-project/vllm/pull/63096)：ROCm AITER Draft Backend 的 Graph/Metadata 更新能力；只在其指定 Draft Backend 与硬件条件下成立。
- [Ascend #19512](https://github.com/vllm-project/vllm-ascend/pull/19512) / [#20279](https://github.com/vllm-project/vllm-ascend/pull/20279)：DFlash2 Draft 在 MRV2 上的 Full ACLGraph Capture 和 Replay 路径；二者存在相关/重叠实现，必须检查 upstream 实际基线再选取证据。
- [vLLM #62784](https://github.com/vllm-project/vllm/pull/62784)：对不会被消费的 Draft 决定 K=0；与普通 P/D Prefill 优化的区别在于它确实更改 Speculator 的 Draft 调用。
- [vLLM #64109](https://github.com/vllm-project/vllm/pull/64109)：DFlash/DSpark Drafter Sliding-window KV 的尾部驻留约束；不能直接沿用 Target 的历史 KV 留存策略。
- [vLLM #65553](https://github.com/vllm-project/vllm/pull/65553) / [#64612](https://github.com/vllm-project/vllm/pull/64612)：分别作用于 DSpark / DFlash 的 Draft KV FP8 配置；效益首先是 Draft 侧显存，不能不测量就推断 TPOT 提升。

## 5. Correct State：Hybrid Model 的必要条件

对于传统全注意力模型，最先可见的是 KV Slots/Block Table 与 accepted prefix 的映射。对于 GDN/Mamba/KDA，Target Verify 还产生递归更新的隐藏状态；拒绝位置之后的候选中间态不能流入下一轮。必须区分：**Checkpoint（历史合法状态）→ Speculative Intermediate → Accepted Prefix Commit**。这不是可忽略的 Kernel 细节，而是 SpecDec 准确性的构成部分。

- [vLLM #66595](https://github.com/vllm-project/vllm/pull/66595) 提出在下一轮 Verify 中回放上轮 accepted tokens、推迟对应 Commit 的实现合同；其适用的是描述中指定的 KDA/RecoverSSM 实现。
- [vLLM #65182](https://github.com/vllm-project/vllm/pull/65182) 针对 Mamba2 Spec 的共享 accepted-token / graph metadata；对应的缓冲区别名关系必须正确。
- [Ascend #21430](https://github.com/vllm-project/vllm-ascend/pull/21430) 优化 GDN Hybrid + SpecDec 下 Host Copy 与 RecoverSSM Commit 的同步顺序；
- [Ascend #19954](https://github.com/vllm-project/vllm-ascend/pull/19954) 覆盖可变推测长度、混合 Spec/Non-spec 批次的 GDN metadata；
- [vLLM #61589](https://github.com/vllm-project/vllm/pull/61589) 为 EAGLE/MTP Prefix Cache 的 Lookahead Token 身份提供了更细的缓存命中契约。

**特别注意：**“采用 RecoverSSM/重放”是一个机制路线，不是所有 vLLM/Ascend 版本、GDN/KDA 模型都已经实现或支持的结论。不能拿 KDA 上的实现通过，直接断言 Qwen GDN Target 在 910B2 上正确。硬件与版本由官方文档和目标 PR Diff 共同限定。

## 6. 证据体系：按社区和运行阶段组织，而不是 PR 标题聚合

当前网站扫描结果的 `methods`、`runtime`、`verification` 是历史初筛标签，并不直接等价于严格的研究 taxonomy。正式报告需要建立二级交叉映射：

- **Draft / Model**：EAGLE/MTP 与 DFlash/DSpark、候选选择、Draft Context、Graph、Draft KV；
- **Verify / Sampling**：Target 多 Token Attention、Budget、Rejection Sampler、Bonus Token；
- **State / Lifetime**：KV 的跨轮复用，GDN/Mamba/KDA Checkpoint、Commit、Rejected Path；
- **Serving / Parallelism**：批次变化、P/D Prefill-only、TP/DP/PP、Async Scheduling、设备/Host Launch；
- **Evidence / Baseline**：PR 状态和 Diff、论文条件、平台与配置、Greedy/Probabilistic、是否独立复现。

**明确排除原则：**普通 MoE Fusion、普通 Single-token Decode、通用 KV Store/Pool、QLI Sparse Indexer 候选块等，即使 README 或实验命令中出现 MTP/DSpark，也不作为 SpecDec 主干证据。见 24 条原始来源人工排除索引；排除仅意味着不属本专题的主要工程机制，仍可从其他方向建立链接。

## 7. 如何做公平 Benchmark 和因果归因

最小实验矩阵不是“单组开启 Spec、然后报 TPS”，而是：

| 维度 | 必须控制或记录 |
| --- | --- |
| Runtime | vLLM / vLLM-Ascend / SGLang 明确 commit；Model Runner 版本，Attention Backend，Graph Mode |
| 模型与采样 | Target 和 Draft checkpoint / dtype / quant；Greedy 或 stochastic；实际 Spec Depth 与 Acceptance |
| 设备 | GPU/NPU 型号和数量、TP/DP/PP、驱动与编译运行时；对不兼容版本禁止静默迁移 |
| Workload | Prompt/Output 长度分布，Request Rate/Concurrency，Prefix Cache 与 P/D 模式 |
| Metrics | Accuracy/Distribution Contract，Acceptance Length，Draft+Verify+Sampling+Commit Step Cost，TTFT/TPOT/ITL/TPS/Goodput，HBM |
| 对照 | AR → Fixed-k Spec → Adaptive-k/Verify → 新优化；保持相同模型、部署和负载，多次配对并报告波动 |

Synthetic Acceptance 对隔离 Verify Kernel 的成本非常有用，**不保证生成 Token 符合 Target 分布**；必须另有真实接受率与输出正确性的闭环。对 K、Batch 或设备变化导致的收益，不应把多个论文/PR 的速度直接相加或取最大值作为预期值。

## 8. 研究缺口（本次来源范围内的未闭环问题）

**G1 | Draft–Verify 的统一成本模型。** 现有机制分别优化草稿、验证预算和图调度。待验证：同一运行时中是否存在稳定的、无法被已有 Adaptive Verification 解释的关键路径损失？建议以固定 Target 与负载做三臂消融，分离 Draft、Verify、Sampler 和 State。

**G2 | Hybrid Accepted-state 的细粒度正确性。** 有 RecoverSSM / accepted-prefix replay 等路径，但公开 PR 的 SoC/模型覆盖不同。待验证：多请求混合长度、拒绝位置、prefix hit、请求迁移和图回放下，是否仍满足相同 Target 状态？建议比对各层 checkpoint + 相同 Token 输入，而非只比最终准确率。

**G3 | 并行草稿与动态负载的耦合。** DFlash/DSpark 降低 Draft 深度，却可能增加 Verify 内存/计算。待验证：在低并发、峰值并发和混合 Prefill/Decode 下，动态 K 与全局 Verify Budget 能否维持 Goodput 而无回归？以 AR / Fixed-k / AV 作为优先基线。

**G4 | 设备专用实现的迁移边界。** GPU CUDA Graph、ROCm AITER、Ascend ACLGraph 具有不同的缓存、metadata、kernel 约束。待验证：同样的算法优化，哪些是真正的跨设备机制、哪些依赖后端特性？必须分别明确版本和硬件；不把一个 PR 的设备结论外推。

**G5 | 完整 Serving 的验证链。** PR 常只报告 Kernel、局部 Forward 或单配置 TPOT。待验证：在指定模型精度/版本下，真实输出正确且有稳定服务收益，是否存在可解释的对照与置信区间？禁止拿作者数字代替独立复现。

## 当前限制与交付门槛

- 这是一份**选择性叙述性研究源稿**，没有完成双人独立筛选、全量 cross-community PR Diff、全部论文的引用元数据核查或新实验；文中“未闭环”不表示其他社区没有相关成果。
- 来源覆盖截至 2026-11-17；现有网页候选截至 2026-11-11，二者口径不同。后续需补入 11-12 至今主仓更新，不能谎称 81 条候选代表最新完整社区。
- 上游开放 PR、正式已合入实现、已发布 Wheel/Tag 和本地可用固定 Pair 是四个不同的状态；具体状态要随报表版本刷新。
- 本稿只做机制、证据及假设分析；**没有 GPU/NPU 跑分、没有独立性能收益结论、没有生成 PDF/HTML 冻结稿**。
- 只有在 source-to-claim 逐项审查、版本化的生成器与产物一致性校验、静态页面回归和正式审稿均完成后，才能将本稿升级为网站动态研究报告。此前不应给出占位下载链接或“已发布”状态。
