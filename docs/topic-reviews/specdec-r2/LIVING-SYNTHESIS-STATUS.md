# SpecDec Living Synthesis · 2026-11-18

## 本轮代码与保留范围

- 基于网站 `main@20def13a` 新开 `feat/specdec-living-synthesis-20261118`，不直接合并原先比 main 落后 5 个提交的 SpecDec 分支。
- 移植冻结 R2 的全部 `report.json/md/html`、manifest、10 条完整 PR 证据、105 PR 来源账本、固定实现审计，以及独立 9 章算法综述；未改动冻结稿字节。
- 与 ACL living survey 对齐，新增 4 条研究路线和 4 条明示适用边界的工程证据综合、版本绑定与引用校验；报告仅有 revision 1，不伪造上一版研究判断。
- 动态报告以 8 章和小节为主文，默认展开。新增瓶颈迁移、原始 PR 失败/负例、固定 head SHA 与 Gaps 的基线/指标/证伪条件；工程证据详情仍可折叠核对。
- 学术稿补充方法史和跨层三条因果链，首次阅读页面给出“导引→独立综述→Living Report”的学习路径。
- 扩展原有 ACL 版本校验，允许 SpecDec 尚未发布论文 PDF 的 report-only 导读；保留 ACL 的 paperVersion 和 HTML anchor 强校验。
- 新 PR 录入/评审过程见 `topics/speculative-decoding/README.md`，静态资产和报告仅从正式研究修订生成。

## 本轮未声明通过的验收

**当前只完成 GitHub 侧代码静态核查，不声称已在 Node/浏览器中运行。** 需在能拉取本分支的工作环境执行：

```bash
python -m unittest discover -s scripts -p 'test_specdec*.py'
python -m unittest discover -s scripts -p 'test_speculative_topic_curation.py'
python -m unittest discover -s scripts -p 'test_topic_survey.py'
python -m unittest discover -s scripts -p 'test_topic_assets.py'
npm ci
npm test
npm run build
```

随后手工验收 `#/topics/speculative-decoding`、`?view=paper`、`?view=report`、`?view=report&read=brief`；逐项检查移动端、深链跳转、引用返回、历史、PDF 缺席提示，确保 ACL 专题和新版首页不发生 UI 回归。

## 发布前 Gate

1. 上述 Python/Vitest/TypeScript/Build 全绿且 URL/窄屏人工验收。
2. 对 `§1–§8` 与 ACL 的章节论证职能做逐节人工学术审读，杜绝把工程 PR 简化成技术榜单。
3. 审读独立 9 章学术稿的文献措辞和正式报告的机制一致性。没有实跑 NPU 不能升级作者对照结论。
4. 如需发布 PDF，必须在一个明确的新版本中生成真实 PDF 和 manifest；当前 R1 不伪造 PDF 或修订 2。
