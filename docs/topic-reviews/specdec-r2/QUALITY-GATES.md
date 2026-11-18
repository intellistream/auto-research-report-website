# R2 编辑整改质量 Gate | 2026-11-18

本表依据随附《Spec_R2 整改方案与验收标准》的五项 Gate。**检查完成不等于发布通过**；本轮仅在分支保留初始 revision/version，未开启 PR。

| Gate | 当前可核对的结果 | 判定 |
|---|---|---|
| 1 研究闭环 | 1 主命题、4 RQ；8 章中 §1/§2 为合同/成本，§3–§6 四主干，§7 交叉证据，§8 对 RQ1–4 明确回答 | 静态结构通过 |
| 2 技术演进 | Candidate 4 分支、Verify 概率/预算/Selector 三层、Hybrid State 与 Runtime，4 行瓶颈迁移图，每章都有“本章综合判断” | 静态内容通过；还需研究审读 |
| 3 跨层综合 | §7.1 Candidate→Verify；§7.2 Verify→Accepted State；§7.3 Graph/Host/Metadata→Serving，均引用原始 PR/论文与反例 | 静态链条通过 |
| 4 证据可信 | 105 PR 原分类保留、10 条完整 PR 原始条件、固定 v0.23.0 源码 SHA；#64915 关闭未合入，#20254/#21430/#66595 未合入；负例没有隐藏 | 静态引用通过；没有独立硬件复现 |
| 5 可独立阅读 | Markdown/HTML 均按八章导出，原 PR 与 Code 详情后移到附录，RQ、章节与文献可追踪 | **待 Build、浏览器检查及外部熟悉 Serving 的读者审查** |

## 自动合同与待验证项

- `python -m unittest scripts/test_specdec_research_contract.py scripts/test_speculative_topic_curation.py scripts/test_topic_assets.py`
- `npm ci && npm run build` 与现有 Vitest 命令（按 `package.json` 的实际脚本执行）
- 在 `/topics/speculative-decoding?view=report` 查看：主命题/四 RQ、四维分类、四步瓶颈迁移、8 章与小节层级、附录/引用/Gap 跳转；再检查 `?view=paper` 与导引旧路由不受影响。
- 测试回归需对照 `main` 的最新两笔前端变更；本分支暂未合入它们，因此不声称最新 main 兼容。
- 中文技术术语、跨硬件结果外推、DFlare/HybridSpec 等原始论文机制及 Reference URL 需要独立逐项学术校核。

## 数据完整性

- 冻结 R1：`83330844d152de19bc1d880a0814a153551080f8`。
- 当前网站资产仍 revision=1，version=`e5a303f8d4534cc4d0ff3ed17051e44bf26c9dc952df51e9a3a8ace7dcee399d`；R2 指**编辑稿结构**，不是发布新不可变版本。
- 原始 PR 数 105（68 vLLM / 37 Ascend）；详细证据 10；G1–G4 机制与假设，G5 共用归因方法。证据详情与事实来源没有因重排删除。
