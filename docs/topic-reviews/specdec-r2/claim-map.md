# R2 结论—研究问题—证据矩阵

**版本边界**：沿用冻结 R1 [`83330844d152`](https://github.com/intellistream/auto-research-report-website/tree/83330844d152de19bc1d880a0814a153551080f8) 的来源身份与 2026-11-18 的 PR 状态观察。证据层级：P=原始论文、D=文档/固定源码、E=PR 作者测量/源码描述；没有把作者测试认作独立复现。

| 中心问题 / RQ | 研究主张（非性能宣传） | R2 主要论证 | 核心证据 | 证据级别与适用边界 | 仍未知 |
|---|---|---|---|---|---|
| 主命题 | 单位合法输出成本由 Draft、Verify、Sampler、State 与 Runtime 共同决定 | §1–§7 | P1/P2、D4/D6/D7、E1/E2/E11 | 原始理论 + 固定静态代码 + 不同设备 PR 作者测试 | 统一负载预测模型 |
| RQ1 分布与状态 | 经典残差采样维护目标分布；合法 Token 不代表 KV/SSM 已提交 | §1、§5 | P1/P2/P4/P9；E5/E7/E12 | 理论合同 + 状态实现；后续 PR 不等于旧 Pair | 多轮 Replay/Preemption/P-D 组合证明 |
| RQ2 Candidate | 较好候选、较浅 Draft、较少权重/KV 代价是不同目标 | §3 | P5/P6/P7/P8；E1/E8 | 论文机制；#63096 Draft Loop 改善未给出稳定 Serving 加速 | 同 Target 与不同 Draft 的公平成本边界 |
| RQ3 Verification | 长度预算是概率、Target 计算与选择器 Host 成本的联合决策 | §4 | D4/P8/P9；E2/E3 | #65175 修复后低/高并发收益翻转；#63421 测量含软件版本 | MoE Router 与 Graph Shape 成本联合校准 |
| RQ4 Serving | 固定图/元数据/缓存机制的收益必须传递到真实 Critical Path | §6–§7 | D6/D7；E1/E8/E9/E11/E12/E17 | #19954 Metadata C32 -58% 而 TPS +0.19%；#19512 验证路径混有接受率变化 | 同后端 Graph 与状态生命周期的配对对照 |

## 三条必须完整闭环的因果链

1. **Candidate→Verify**：减少 Draft 顺序步骤或提升 Acceptance → Target Query Rows/形状改变 → Budget/计算成本重新成为上限。依赖 P5–P8、E1、E2/E3；反例是 Draft Microbenchmark 不传递到 TPS。
2. **Verify→Accepted State**：较宽/树式 Verify 计算未来状态 → Sampler 拒绝后只提交合法前缀 → KV/SSM、Pending/Bonus、Prefix Hash、D2H 的生产消费必须匹配。依赖 P1/P2/P9、E5/E7/E12。
3. **Runtime→Serving**：Graph/Metadata/Sampler 局部减少 Host 或 Kernel → 重叠、Target Workload、Cache、并发改变关键路径份额 → Serving 指标未必同向。依赖 E1、E8、E9、E11、E17。

## 证据变化的更新规则

- 有可归因 PR 对照且确认实现时，结论可升级为“该条件下作者观察”。有跨配置/交错实验和独立复现才考虑一般化；否则仍是条件推论。
- PR 关闭未合入、配置不兼容、缺真实 Token 测试或反例明显时，应降级，不应用其证明正式能力。
- 原始性能数值和负例一律由既有 `evidence-ledger.json` 保持；本文矩阵不复制不完整的对照表。
