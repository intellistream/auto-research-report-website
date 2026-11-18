# ACL Graph → SpecDec 逐节论证对齐 / 2026-11-18

**目标不是让不同专题使用完全相同的标题，而是复用学术综述中的问题驱动、历史演进、反例综合和自包含阅读标准。**

| ACL Graph 的论证功能 | SpecDec R2 正文 | 读者应该得到的回答 | 核查与证据 |
|---|---|---|---|
| 引言：核心问题 | §1 正确性合同 | 为什么多 Token Verify 合法，何为 Accepted Prefix？ | K=3；精确概率残差；P1/P2/P4 |
| 执行机制与成本 | §2 有效输出成本 | 少 Target 轮次何时被 Draft/Target/Host 成本抵消？ | E[N]、CriticalPath 与 Query Rows；D4/E1 |
| 技术分类 | §3 Candidate | Lookup、EAGLE/MTP、Tree、DFlash/DSpark 各消除哪种依赖？ | P3–P8/P10；E1/E8 |
| 关键路线 | §4 Verification | Fixed K 到 AV、Router-aware HybridSpec 的依据与风险？ | 存活概率、Target/MoE Shape、Selector；E2/E3 |
| 动态正确性 | §5 Accepted State | Token 正确为何不等于 KV/SSM 正确，Reject 后谁恢复状态？ | Pending/Replay/Checkpoint/Prefix；E5/E7/E12 |
| 资源/调度 | §6 Serving Runtime | Graph/采样/缓存/调度怎样共同决定关键路径？ | 固定 Pair 代码、Head/Device Trace、KV/SSM；E8/E9/E11/E17 |
| 历史与证据综合 | §7 三条因果链 | 新方法缓解原瓶颈后将哪个约束推向关键路径？ | Candidate→Verify→State→Serving；对照负例 |
| 研究缺口及局限 | §8 Research Gaps 与 RQ | G1–G4 如何证伪？G5 为何是评估方法而非新算法？ | 4 RQ、5 Gap、固定对照与 Source Ledger |

## 与学术稿的关系

独立网页综述（`?view=paper`）保留以“引言→正确性→Candidate→Verify→State→Runtime→综合→Research Gaps→结语”组织的九章。动态 R2（`?view=report`）以严格的八章研究报告呈现。**两者不是逐字复刻，而是同一研究命题下的算法教学与证据更新两种交付物**。引用、技术术语和否定结论须一致，增量 PR 仅首先改变动态证据；独立稿在实际学术综述机制发生变化后才修订。

## 具体阅读体验检查

1. 一个不懂 SpecDec 的读者从 AR 与 Drafter/Target 示例开始，能在一页内区分 Token、Bonus 与 Pending State。
2. 不查外部文档也能沿 §1–§6 理解公式、算法和工程接口，外链只用来核验细节。
3. 方法史不是“技术排名”；每段必须回答旧路径→改动→新增成本，必要时明确负结果。
4. §7 的跨层论证不是另一个 PR 摘要；至少能定位三条条件性的因果链及反例。
5. §8 的缺口必须有强基线、控制变量、观测指标与证伪条件；既有方法不伪装成原创。
6. 10 条完整 PR 测量、固定 SHA 与 105 候选不丢失，新的来源不能覆盖旧冻结版本。
7. `?view=report` 默认展开主文，可切换速读；侧栏目录/引用/Gap/历史链接应可定位；窄屏仍可读。
8. 无独立 PDF 时明确显示“不存在/未生成”，不生成虚假的下载路径；待正式学术稿发布后再按同版本契约提供 PDF。
