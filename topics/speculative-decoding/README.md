# Speculative Decoding · Living Research Survey

本目录的 `survey.json` 是**可编辑的学术综合判断**，不是原始 PR 仓库，也不是冻结报告的替代文件。它通过 `reportVersion` 绑定 SpecDec R2 的 `report.json`。目前 SpecDec 的独立学术稿由 `src/pages/specdec-survey-content.ts` 提供，没有发布 `academicPaper.version`，所以**不伪造 PDF/paperVersion**；一旦生成并接受独立学术档案，应像 ACL Graph 一样绑定并核验 `paperVersion` 与 HTML anchors。

## 阅读入口与职责

| 入口 | 面向读者 | 更新方式 |
| --- | --- | --- |
| `#/topics/speculative-decoding` | 初次接触：AR 与推测轮次、正确性、阅读路径 | 只描述稳定机制，不依赖本周 PR |
| `?view=paper` | 算法—系统方法史、9 章独立学术稿、文献 | 独立编辑、学术审读，不随每条 PR 重写 |
| `?view=report&read=full` | 8 章动态论证、跨层证据、历史版本、Gaps | 冻结 `report.json` + 版本绑定 `survey.json` |
| `?view=report&read=brief` | 快速了解本期重要判断与未证实问题 | 同一份数据，不额外维护结论 |

## 新 PR 的最短准入路径

1. **发现，不等于采纳。** 日报/社区初筛记录 workId、URL、类别、日期。105 条历史候选只是检索窗口；不将未核验候选冒充实验或官方支持。
2. **定位机制。** 对照 `candidate / verification / accepted-state / runtime` 之一，明确它改变哪个 Producer–Consumer 边界、Target Query Shape、状态或关键路径；允许一条 PR 跨多个路线。
3. **记录可审计条件。** 原始 PR head SHA、合并状态、模型/硬件/版本、K、并发、流、负载、基线、对照次数、统计单位、负例和失败，尽量指向具体变更文件。源头作者数据与独立复现严格区分。
4. **证据→判断。** 逐项写出旧路径、机制变化、原始结果、未控制的混杂及其支持的**最小结论**；没有可归因服务对照只能标成待核，不能写入确定性加速结论。
5. **冻结新版报告。** 上游流水线生成新的 `version`、`revision`、`previousVersion`、manifest、JSON/MD/HTML（及真实存在时的 PDF）；旧版字节不变。将新 `report` 写入 `public/word-reports/topics.json`，PR 仍保留候选索引。
6. **重审精简导读。** 更新 `survey.json` 的 `reportVersion`、`routes` 的机制/限制、`update.evidence` 的判断变化和 `nextGapIds`。每个 evidenceId/gapId 的源引用必须被同一条路线覆盖。不得直接把旧判断换一个版本号。
7. **原子导入、测试和阅读验收。** `python scripts/import-topic-survey.py --topic speculative-decoding --source topics/speculative-decoding/survey.json`；`npm run check:topic-survey && npm test && npm run build`。检查完整章节、引用往返、URL 深链、下载文件身份、移动端和无 JS fallback。

如果新冻结版本已经产生但尚未完成导读重审，可暂时移除索引中的旧 `survey`，依赖当前报告的安全降级阅读；`--check` 仅允许明确的 *pending review*，不得显示已失效的研究判断。新 PR 先进入候选，不强迫当天就更新研究结论。

## 研究叙事约束

- **四条研究线路**：Candidate → Verification → Accepted State → Serving。方法并存，不按发表时间或速度倍率排名。
- **八章主文**：合同与成本 → 方法与验证 → 状态与 Runtime → 跨层综合与可证伪问题。章节不可只藏在附录；原始 10 条 PR 详情、固定源码 SHA 与 105 候选账本在可追踪的证据/附录层。
- **证据级别**：P=原始论文，D=固定文档/代码，E=公开 PR 作者测量/代码。不同 Hardware/Pair/Acceptance Mode 不组合加速比。
- **学术评估**：`G1–G4` 是尚待验证的机制假设，`G5` 是共同的因果归因方法，不能宣称五个原创算法贡献。
- **日期与范围**：当前版本证据观察截至 2026-11-18；网页样式修改不等于新论文或新 NPU 实验。R1 冻结研究稿不应被冒充为 R2 已正式发布。

参见 `docs/topic-reviews/specdec-r2/aclgraph-section-alignment-20261118.md` 中的逐节对照与独立阅读验收。
