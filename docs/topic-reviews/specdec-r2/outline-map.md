# R1 → R2 章节—RQ—证据映射

**冻结基线**：R1 完整原文与资产保留在 Git commit [`83330844d152`](https://github.com/intellistream/auto-research-report-website/tree/83330844d152de19bc1d880a0814a153551080f8)。对应 `public/word-reports/topic-reports/speculative-decoding/e5a303f8d4534cc4d0ff3ed17051e44bf26c9dc952df51e9a3a8ace7dcee399d/report.{json,md,html}`，不依赖可能后续改写的分支 HEAD。**暂不修改站点 revision/version；R2 是编辑学术稿，不代表新发布版本已审核。**

## 11 节技术正文逐项迁移

| R1 | 标题/ID | R2 归属 | 去重/迁移说明 | 原依据 |
|---|---|---|---|---|
| 1 | `worked-round` K=3 推测轮次：候选、拒绝、修正与状态提交 | §1 | 例子并入正确性讲解；Bonus/Pending 迁移至 §5 状态时序 | P1, P2, D6, D7, E7 |
| 2 | `correctness-and-cost` 四类正确性不变量与单位输出成本模型 | §1 + §2 | 四不变量留 §1；数学期望、Critical Path 与指标留 §2 | P2, P4, D4, D6, D7, E1, E2 |
| 3 | `fixed-source-contract` 固定源码路径：Scheduler、Proposer、Target、Sampler 与 Ascend State | §6 + 附录 B | 主文解释接口职责；完整源码 SHA、函数/读写者归附录 | D6, D7, E2, E3, E8, E12 |
| 4 | `execution-contract` 从 Token 接受率到合法轮次的实际收益 | §2 | 合并重叠的 Token/轮成本解释 | P1, P2, D1, D4 |
| 5 | `draft-techniques` Drafter：从历史检索与 EAGLE/MTP 到并行块生成 | §3 | 升格方法主章，加入树式、块并行演进及继发成本 | P5, P6, P7, P8, D3, E1 |
| 6 | `verification-budget` Verification Budget：位置存活概率与 Target 计算成本 | §4 | 依次分析概率估计→预算政策→选择器开销→Target 成本 | D4, P8, P9, E2, E3 |
| 7 | `state-correctness` Hybrid Target：接受前缀与递归状态必须共同合法 | §5 | 独立 Hybrid 合法状态、RecoverSSM、Prefix/Preemption/P-D | P9, E5, E7, E11, E12, E15, E18 |
| 8 | `runtime-cost` Runtime：图回放、Sampling 与 KV Residency 的关键路径 | §6 | 按 Runtime 关键路径→Graph→容量/调度组织 | E1, E4, E6, E8, E9, E10, E14, E15, E17 |
| 9 | `engineering-evolution` 三条技术演进：已知机制、证据、反例与综合判断 | §7（并局部分发 §3–§6） | 跨层证据链与反例在 §7，局部原因前移 | P5, P6, P7, P8, E1, E2, E3, E5, E11, E12 |
| 10 | `research-perspective` 下一阶段：Hybrid MoE/GDN 与 Adaptive Serving 的共同边界 | §8 | 展望并入 Gap、验证计划及局限，不再置于中段 | P8, P9, D4, E5, E7, E14, E17 |
| 11 | `capability-boundaries` 实现能力与归因边界：固定 Pair、后续 PR、设备条件 | §6 + 附录 B | 固定版本与后续 PR 分清；矩阵归附录，取消独立末章 | D6, D7, E1, E2, E7, E8, E9, E11, E12, E17 |

## 10 条完整 PR 证据与 5 项 Gap

- **E2** Adaptive Verification Budget Selector → §4/§7；完整 `sourceHead`、环境、失败与数字仍保留在附录 A 的证据记录。
- **E3** XPress Acceptance Estimator → §4/§7；完整 `sourceHead`、环境、失败与数字仍保留在附录 A 的证据记录。
- **E5** Lookahead Block Hash 与 Prefix Cache → §5/§7；完整 `sourceHead`、环境、失败与数字仍保留在附录 A 的证据记录。
- **E7** RecoverSSM Deferred Replay → §5/§7；完整 `sourceHead`、环境、失败与数字仍保留在附录 A 的证据记录。
- **E1** ROCm Multi-step Draft Graph → §3/§6/§7；完整 `sourceHead`、环境、失败与数字仍保留在附录 A 的证据记录。
- **E8** Ascend DFlash2 Full ACLGraph → §3/§6；完整 `sourceHead`、环境、失败与数字仍保留在附录 A 的证据记录。
- **E9** Rejection Sampling ACLGraph → §6/§7；完整 `sourceHead`、环境、失败与数字仍保留在附录 A 的证据记录。
- **E12** RecoverSSM D2H 与 Commit Overlap → §5/§6；完整 `sourceHead`、环境、失败与数字仍保留在附录 A 的证据记录。
- **E11** GDN Mixed-batch Metadata Fusion → §6/§7；完整 `sourceHead`、环境、失败与数字仍保留在附录 A 的证据记录。
- **E17** Fixed-width Spec Varlen Graph → §6/§7；完整 `sourceHead`、环境、失败与数字仍保留在附录 A 的证据记录。

- **G1** `adaptive-cost` 验证预算与实际 Target 成本的联合校准 → §8；类型、强基线、控制与证伪条件详见附录 D。
- **G2** `accepted-state` Hybrid Accepted-State 跨生命周期正确性 → §8；类型、强基线、控制与证伪条件详见附录 D。
- **G3** `graph-budget` 动态 Verify Shape 与 Graph Bucket 的联合决策 → §8；类型、强基线、控制与证伪条件详见附录 D。
- **G4** `kv-residency` Draft/Target KV 共存与状态恢复的容量收益 → §8；类型、强基线、控制与证伪条件详见附录 D。
- **G5** `serving-causality` 局部执行优化到真实 Serving 收益的因果传递 → §8；类型、强基线、控制与证伪条件详见附录 D。

## 归属纪律

- §1 **只**解释输出合法性、采样和 Token/State 契约；§2 **只**解释单位输出成本及跨层指标；§3–§6 各结束于继发瓶颈。
- §7 综合来自不同路线的因果链，避免每章重复整张 PR 表；附录 A 才放详细对照和未显著/失败记录。
- 105 条社区 PR 为候选池，10 条深入核验是证据样本，两者不可替代或删减。
- 固定 vLLM/Ascend SHA、开放/关闭 PR 状态、来源日期保留；正文只引必要的固定入口，不再复制全部审计信息。
