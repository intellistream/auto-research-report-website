# 固定源码执行链、状态所有权与部署边界

资料核对：2026-11-18。**审计对象是固定提交的静态执行路径，不代表该 Pair 已集成随后 PR 的所有功能。**

- vLLM **v0.23.0**：`0fc695fc6d1d82e9a5ac6835ac8e4e1c83703665`
- vLLM-Ascend **v0.23.0**：`5cb98caaadeff42b5b62b996e34bb2aaa29d20fd`

## 一轮推测的固定调用链

```text
Scheduler.schedule()
  └─ Scheduled requests / num_scheduled_tokens / scheduled_spec_decode_tokens
       ↓
ModelRunner.prepare_inputs() → execute_model()
       ↓
BaseSpeculator.propose(...)  [Draft tokens + draft logits + cache context]
       ↓
Target Forward / model.compute_logits()
       ↓
ModelRunner.sample() ── RejectionSampler(logits, draft_logits)
       │                    └─ sampled / rejected counts
       ↓
ModelRunner.postprocess_sampled()
       ├─ post_update(... num_sampled, num_rejected, token history)
       └─ model_state.postprocess_state(idx_mapping, num_sampled)
       ↓
Ascend: _copy_num_computed_tokens_to_cpu()
       └─ CPU seq_lens update waits on recorded device event
       ↓
Scheduler.update_from_output() → next schedule()
```

这是**函数与责任**的阅读顺序，而不是声称所有调用在一个 Python Stack 中逐行同步发生。跨 Engine / Worker 的通信、Draft Token 回传与异步流水由运行模式决定，须结合实际 trace 验证。

## 固定源码位置与契约

| 阶段 | 固定源码、函数 | 数据与所有权 | 核心约束 |
|---|---|---|---|
| Scheduler | [`Scheduler.schedule`](https://github.com/vllm-project/vllm/blob/0fc695fc6d1d82e9a5ac6835ac8e4e1c83703665/vllm/v1/core/sched/scheduler.py#L340-L375), [`update_draft_token_ids`](https://github.com/vllm-project/vllm/blob/0fc695fc6d1d82e9a5ac6835ac8e4e1c83703665/vllm/v1/core/sched/scheduler.py#L1737-L1759) | request token 计数、spec token ids 与 scheduled token budget，Scheduler 写，Runner 消费 | `num_tokens_with_spec` 与 `num_computed_tokens` 匹配；预填充/终止跳过无用草稿 |
| Drafter | [`BaseSpeculator.propose`](https://github.com/vllm-project/vllm/blob/0fc695fc6d1d82e9a5ac6835ac8e4e1c83703665/vllm/v1/worker/gpu/spec_decode/speculator.py#L25-L69) | `InputBatch`、`last_hidden_states`、`num_sampled/rejected`、温度与 seeds；Proposer 产生 Draft | 每个候选来自正确前态，Draft KV 的身份与生命周期一致 |
| Target | [`GPUModelRunner.prepare_inputs`](https://github.com/vllm-project/vllm/blob/0fc695fc6d1d82e9a5ac6835ac8e4e1c83703665/vllm/v1/worker/gpu/model_runner.py#L816-L850), [`execute_model`](https://github.com/vllm-project/vllm/blob/0fc695fc6d1d82e9a5ac6835ac8e4e1c83703665/vllm/v1/worker/gpu/model_runner.py#L1082-L1116) | `InputBatch`、KV Block Tables、Attention Metadata；Runner 负责预备，Target 消费 | query positions 只能读取合法前缀及树路径上的祖先 |
| Acceptance | [`sample`](https://github.com/vllm-project/vllm/blob/0fc695fc6d1d82e9a5ac6835ac8e4e1c83703665/vllm/v1/worker/gpu/model_runner.py#L1008-L1051) | `model.compute_logits` 生成 Target Logits；有 Draft 时 `rejection_sampler(logits, input_batch, self.speculator.draft_logits)` | Greedy、probabilistic 和近似采样的合同不能互换 |
| Commit | [`postprocess_sampled`](https://github.com/vllm-project/vllm/blob/0fc695fc6d1d82e9a5ac6835ac8e4e1c83703665/vllm/v1/worker/gpu/model_runner.py#L1052-L1081) | `post_update` 修订 token/计数；`model_state.postprocess_state` 提交 State | Rejected token 的临时状态不能流入下一轮；Bonus/Pending 必须处理 |
| Ascend 后处理 | [`postprocess_sampled` + `_copy_num_computed_tokens_to_cpu`](https://github.com/vllm-project/vllm-ascend/blob/5cb98caaadeff42b5b62b996e34bb2aaa29d20fd/vllm_ascend/worker/v2/model_runner.py#L388-L420) | D2H Copy 在独立流上等待 Default Stream，记录 Event | CPU 只消费已生产完成的本轮计算计数 |
| Ascend 下轮 CPU 准备 | [`_update_seq_lens_cpu`](https://github.com/vllm-project/vllm-ascend/blob/5cb98caaadeff42b5b62b996e34bb2aaa29d20fd/vllm_ascend/worker/v2/model_runner.py#L421-L440) | `num_computed_tokens_event.synchronize` 后读取缓存请求槽位 | 请求槽位世代与 Producer/Consumer 时序必须成立 |

## PR 演进与固定基线的区别

| 变更 | 原始 PR 和审计入口 | 与固定 Pair 的关系 |
|---|---|---|
| Adaptive Verification Budget Kernel | [vLLM #63421](https://github.com/vllm-project/vllm/pull/63421)，`vllm/v1/worker/gpu/spec_decode/adaptive_verification.py` | 后续主线实现；不能声称旧 v0.23.0 已具有该 Kernel |
| XPress Confidence Feed | [vLLM #65175](https://github.com/vllm-project/vllm/pull/65175)，`.../xpress/speculator.py` | 后续主线、专用 Drafter；旧 Pair 需独立适配 |
| Prefix Lookahead Hash | [vLLM #61589](https://github.com/vllm-project/vllm/pull/61589)，`vllm/v1/core/block_pool.py` | Prefix Cache Identity 变化；涉及外部 KV Connector 协议 |
| RecoverSSM Deferred Commit | [vLLM #66595](https://github.com/vllm-project/vllm/pull/66595)，`vllm/v1/worker/gpu/model_states/recoverssm.py` | 2026-11-18 尚未合入；只能按 PR Head 审查 |
| DFlash2 Full ACLGraph | [Ascend #19512](https://github.com/vllm-project/vllm-ascend/pull/19512)，`vllm_ascend/worker/v2/spec_decode/dflash2/speculator.py` | 后续 MRV2/910B4 分支能力，不能回填旧 910B2 Pair |
| GDN Metadata Fusion | [Ascend #19954](https://github.com/vllm-project/vllm-ascend/pull/19954)，`vllm_ascend/ops/gdn_attn_builder.py` | Metadata 仍在 Graph 外，依赖 Aligned Cache Layout |
| Rejection Sampling ACLGraph | [Ascend #20254](https://github.com/vllm-project/vllm-ascend/pull/20254)，`.../rejection_sampler_utils.py` | 开放 PR；特殊 Sampling Mode 保持 Eager |
| RecoverSSM D2H Overlap | [Ascend #21430](https://github.com/vllm-project/vllm-ascend/pull/21430)，`vllm_ascend/worker/v2/model_runner.py` | 开放 PR；须检查 `post_update` Writer 与 CPU Cached Request Reader 的槽位分离 |

## 状态不变量与负对照

1. **Token/Distribution**：Greedy 逐 Token 与 AR Oracle 相同；概率方案验证位置条件分布与拒绝残差，不用同 Seed 的单次相等替代分布检查。
2. **KV/SSM**：拒绝位置之后的 KV/SSM 不得对未来可见；若补样 Token 尚未执行 Target，保留 Pending，下一轮按正确前缀计算。注意全接受的 Bonus 规则。
3. **生命周期**：Preemption、Prefix Hit、请求重新加入、跨 TP/P-D Restore 后，用 Request ID/Generation/Block Identity 防止旧 Slot 和新请求混叠。
4. **时序**：设备 Producer → Event → Host/Device Consumer 的 Happens-before 必须成立；为性能移走同步点必须证明地址、值、有效范围与所有权同样安全。

负对照至少覆盖：强制拒绝第 1/2/3 个候选、Bonus、复用同样 Shape 但不同 Request ID、移动 Checkpoint Block、D2H 与 State Commit 交错、Graph Replay 后更换缓冲值。逐层状态访问若没有公开 API，标注测试所需 instrumentation，不能以 Token 正确替代内部状态验证。

## 部署能力矩阵（不跨版本推断）

| 固定来源/PR | 模型与方法 | 设备/并行/图 | 确认层级 | 尚待核验 |
|---|---|---|---|---|
| vLLM v0.23.0 + Ascend v0.23.0（上方固定 SHA） | BaseSpeculator / MRV2 Rejection 路径 | 环境依赖 | 固定源码函数存在 | 具体模型、Drafter、910B2/CANN 与 TP 跑通情况 |
| vLLM #63421 | Qwen3-4B + DSpark K7 | H200；AV Kernel | 已合入，作者报测试 | Ascend 适配 |
| vLLM #63096 | Llama3.1-8B + EAGLE3 K3/7 | MI355X / ROCm AITER | 已合入，作者报测试 | GPU 后端以外移植与 Serving 收益 |
| Ascend #19512 | Qwen3.8-27B DFlash2 K7 | 4×910B4、TP4、MRV2 Full ACLGraph | 已合入，作者报测试 | 910B2/CANN9.1.0 兼容 |
| Ascend #19954 | GLM-5.3-Flash、GDN/MTP3 | Ascend950DT ×8、TP8+EP | 已合入，作者报测试 | 其他 Cache Layout / 图模式 |
| Ascend #20254 | DSpark K5 | 910B、TP8、Rejection Graph | 未合入 PR，作者报测试 | 合并状态、兼容性与稳健服务 |
| Ascend #21430 | Qwen GDN/MTP | A5、MRV2、D2H Commit | 未合入 PR，作者报测试 | 负对照、重复与异常路径 |
| vLLM #66595 | GLM-5.3-Flash KDA/MTP5 | GB200、TP4 | 未合入 PR，作者报测试 | Streaming/Preemption 下独立端到端正确性 |
| vLLM #64915 | DeepSeek-V4.1-Flash / DSpark K5 | 4×Rubin、DP/EP4、Varlen Graph | 已关闭未合入，合成测量 | 真实 KV/Output Correctness、容量路径 |

以上为**来源明确描述的组合和固定代码路径**，不是生产部署推荐矩阵。所有报告数字按来源作者条件解释。
