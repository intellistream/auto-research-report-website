# SpecDec R1 → R2 编辑结构变更记录

**工作分支：** `feat/specdec-evidence-review-20261117`。**原始 R1** 以 Git commit `83330844d152de19bc1d880a0814a153551080f8` 冻结。**站点初始 revision=1、version hash 保持不变**；下述 R2 指分支中的学术论证重构，非已通过发布审查的新版本。

## 2026-11-18 · 结构与论证改写

- 将原 11 个并列技术小节映射为 8 个递进主章：正确性合同→成本模型→Candidate→Verify→Hybrid State→Runtime→跨层综合→Gaps。完整对应见 `outline-map.md`。
- 一个中心问题与四个 RQ；技术全景分为“正交方法分类”和“瓶颈迁移”两种视角。每章均有研究动因、小节机制与综合判断。
- 各条性能与状态结论按“旧机制→改动→原始证据→负例/混杂→限定结论”重写。具体来源映射见 `claim-map.md` 与 `evidence-to-claim-matrix.md`。
- 将完整 10 条 PR 证据详情置于附录 A，固定源码/能力矩阵列附录 B、105 条候选池列附录 C、G1–G5 控制变量和证伪条件列附录 D。
- G5 定位为共用的归因评估方法；未建立真正可验证的收益转折预测模型前，不将它冒充独立新机制。
- R2 内容强调 DFLare 的 Target 分层特征融合及 DFlash/DSpark 并存分支；没有采纳跨设备性能倍率作为统一排序。

## 证据结论是否变化

- 原有数据（10 条 PR 条件/失败/来源 Head、105 候选身份与分类、固定 vLLM/Ascend 源码 Commit）**未被改写成新实验**。
- 本轮变化主要是论证组织与因果范围的澄清；“更高 Acceptance 不保证 Serving 更快”等结论不是新发现。
- 对跨日图对照、Synthetic Acceptance、Dummy KV、未合入 PR 的结论保持条件性。新增文章机制解释均由现有论文来源支撑。

## 发布前仍待验收

- 审阅 R2 主文与独立学术综述页之间的技术措辞/范围一致性。
- 在具有 Node 依赖的开发机运行前端 Build、Vitest 和 Python Source Ledger/Manifest 合同测试，并目视检查三栏布局及附录锚点。
- 若未来批准发布新的不可变报告版本，再独立生成新 version/revision 与 PDF、更新历史链路；当前不擅自更改。
