# Evidence → Claim Matrix | SpecDec R2 编辑稿

核验窗口：PR 原始描述/变更文件截至 2026-11-18；版本化旧 Pair 参见附录 B。**已合入 PR** 指原作者功能进入上游仓库，**未合入 PR** 仅代表候选机制；下列性能均为 PR 作者数据而非独立实验。

| 机制与来源 | 旧路径与新变化 | 可归因观察/负例 | R2 综合判断 | 适用边界/仍未知 |
|---|---|---|---|---|
| Draft 的串行调度 [E1](https://github.com/vllm-project/vllm/pull/63096) | ROCm AITER Metadata 从每步 Host 重建改为多步 Fused Draft | MI355X K3 B1 Draft Loop 571→463 μs；C32 Serving 27,741→27,572 tok/s，作者认为差异属实例波动 | 减少 Draft 空泡≠稳定服务提速（§3.2、§7.1） | ROCm Unified Backend、合成 Acceptance，未证明其他设备 |
| Target Probability 输入 [E3](https://github.com/vllm-project/vllm/pull/65175) | XPress 以前没有给 Acceptance Estimator 写入所需 Logits | H100/Qwen3-8B，C32 AV 2,227→5,389 tok/s；AV-off 4,468；C1 AV-on 375 仍低于 off 408 | 概率估计正确性与并发成本是两个问题（§4.2、§7.2） | XPress/指定 Workload，不代表所有 Drafter |
| Budget Selector Runtime [E2](https://github.com/vllm-project/vllm/pull/63421) | 运行中 torch.compile → 预热单次 Triton Kernel | Host 约 76–90→15 μs；H200/DSpark AV 4,783→6,803 tok/s，与预编译修复 #62539 相近 | AV 实现开销可改变收益符号（§4.3） | 与算法 Policy 改进分开；其他 Backend 未测 |
| Prefix Lookahead [E5](https://github.com/vllm-project/vllm/pull/61589) | Hash 纳入 EAGLE/MTP 尾块使用的后一 Token | GB200 32K/B16 Text CPU Hash 3.166→3.566 ms；此前联合 PR 的 E2E 数字本拆分未重跑 | 修复 Cache 身份可增加命中，也会增加 CPU Cost（§5.3） | Local Cache；KV Connector 协议未一并支持 |
| Recurrent Commit [E7](https://github.com/vllm-project/vllm/pull/66595) | KDA Accepted Replay/Commit 延迟下一次 Verify | GB200/GLM C128 9,275→9,780 tok/s，C16 +0.8%；B1 局部成本退化 | Deferred State 改变关键路径但不保证低批次收益（§5.2） | 开放 PR，单次吞吐对照，需 Epoch/Preemption 验证 |
| DFlash2 Graph [E8](https://github.com/vllm-project/vllm-ascend/pull/19512) | Full ACLGraph 覆盖 Draft Backbone、Selector 与更新，且修改 FIA 非因果滑窗行为 | 4×910B4 K7，8K/8K C8 TPOT 21.739→10.838 ms；Acceptance 49.39→94.04% | Graph 贡献与正确性/Acceptance 变化混杂（§3.4、§6.2、§7.3） | 跨日对照，不能推广到 v0.23.0/910B2 |
| Rejection Graph [E9](https://github.com/vllm-project/vllm-ascend/pull/20254) | 四 Kernel → ACLGraph Replay + Buffer Pack | 910B/TP8 Host 1.98→0.53ms；Serving TPS +3.8% 混有 AL 1.96→2.01 与 Verify Rounds 减少 | Host 局部改善可确认，总吞吐净因果尚不充分（§6.2、§7.3） | 开放 PR；部分 Sampling Mode 需回退 |
| GDN Metadata [E11](https://github.com/vllm-project/vllm-ascend/pull/19954) | 索引/Partition/Clear 合并单次 Kernel | 950DT C32 Metadata 2.289→0.952ms，Output TPS 2,876.00→2,881.35（+0.19%） | Stage 节省未线性传到异步服务关键路径（§6.3、§7.3） | aligned cache；作者不声称显著性 |
| D2H/Commit [E12](https://github.com/vllm-project/vllm-ascend/pull/21430) | D2H Snapshot 提前于 RecoverSSM Commit，减少 CPU 等待 | A5/C72 作者称约40ms Idle Gap 消失、TPS约24→30 | 需证明 Cached Request 的读写集合互不冲突（§5.2、§6.3） | 开放 PR，缺完整配对重复 |
| Verify Shape Graph [E17](https://github.com/vllm-project/vllm/pull/64915) | Fixed Spec 使用已有 Varlen Graph | Rubin/Synthetic AL+Dummy KV，部分吞吐改善；FlashInfer 基线预热不稳 | 说明 Graph Shape 的可能瓶颈，不证明真实输出或稳定发布支持（§6.2、§8） | 已关闭未合入；需真实 KV/Correctness |

## 必须完成的三条因果链

**Candidate → Verify（§3→§4→§7.1）**：Serial Draft 工作减少/质量提高 → 连续可提交位置概率改变 → Verify Query Rows、Target Kernel 与 Sampling 成本重新成为上限；E1 是反例。

**Verify → Accepted State（§4→§5→§7.2）**：Adaptive Budget 改变每请求 Verify Shape → Rejection 后 Token/SSM/KV 只能按合法前缀提交/Replay → Cache Identity 与异步消费者约束变强；E3、E5、E7、E12 分别约束各接口。

**Runtime → Serving（§6→§7.3）**：Graph/Metadata/Sampler 阶段减少 Host 或 Device Work → overlap、批次、Acceptance 轨迹决定节省是否在 Critical Path → 必须在同版本/同工作量对照中检验 TPOT 和 Goodput；E8/E9/E11 不能混作一场 A/B。

正文主要结论由上述链条支撑；完整的 SHA、负对照、测试口径与失败仍在 `evidence-ledger.json` / `report.json:evidenceDetails`。R1 冻结源：`83330844d152de19bc1d880a0814a153551080f8`。
