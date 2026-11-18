import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import actualCatalog from "../../public/word-reports/catalog.json";
import actualFlow from "../../public/word-reports/flow-index.json";
import actualTopics from "../../public/word-reports/topics.json";
import sampleReport from "../../public/word-reports/2026-11-16/d2678efe2393164ed290c70b8fb6a89d113cdb3703a607db1a6e64354fae6d54/report.json";
import SiteLayout from "../shell/SiteLayout";
import OverviewPage from "./OverviewPage";
import ArchivePage from "./ArchivePage";
import DailyReportReader from "../pages/DailyReportReader";
import TopicPages, { type TopicIndex } from "../pages/TopicPages";
import type { Catalog, Report } from "../pages/report-preview-data";
import type { FlowIndex } from "../pages/chapter-intros";

const catalog = actualCatalog as unknown as Catalog;
const flow = actualFlow as unknown as FlowIndex;
const topics = actualTopics as unknown as TopicIndex;
const report = sampleReport as unknown as Report;
const days = Object.keys(catalog.days).sort().reverse();

describe("refactored website views", () => {
  it("renders the redesigned overview hero, executive KPI cards, lifecycle explorer, and spotlight", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/"]}>
        <SiteLayout catalog={catalog} days={days} wide>
          <OverviewPage catalog={catalog} days={days} result={{ data: flow }} />
        </SiteLayout>
      </MemoryRouter>,
    );

    expect(html).toContain("推理性能研报");
    expect(html).toContain(days[0]);
    expect(html).toContain("累计工程 PR（去重）");
    expect(html).toContain("沿着推理流程，查看社区改动");
    expect(html).toContain("展开完整推理生命周期连线全图");
    expect(html).toContain("ACL Graph：昇腾推理图执行");
    expect(html).toContain("近期日报速览");
  });

  it("groups archive issues by month and exposes cross-issue search & stage filtering", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/reports"]}>
        <ArchivePage catalog={catalog} days={days} />
      </MemoryRouter>,
    );

    expect(html).toContain("日报档案");
    expect(html).toContain("累计发布期次");
    expect(html).toContain("2026 年 11 月");
    expect(html).toContain("2026 年 10 月");
    expect(html).toContain("历史 Word 原件归档 ZIP");
  });

  it("parses engineering entry anatomy (问题 / 方法 / 边界 / 原始来源) cleanly in the report reader", () => {
    const day = "2026-11-16";
    const version = catalog.days[day].versions[0];
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={[`/reports/${day}`]}>
        <Routes>
          <Route
            path="/reports/:day"
            element={
              <DailyReportReader
                catalog={catalog}
                days={days}
                day={day}
                version={version}
                result={{ data: report }}
              />
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(html).toContain(report.title);
    expect(html).toContain("一 本日归纳");
    expect(html).toContain("anatomy-tag tone-problem");
    expect(html).toContain("anatomy-tag tone-method");
    expect(html).toContain("anatomy-tag tone-effect");
    expect(html).toContain("原始来源");
    expect(html).toContain("vLLM #61788");
  });

  it("renders interactive mechanism guides, route maps, analytics, and PR workbenches for KV Cache and Speculative Decoding", () => {
    const kvHtml = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/topics/kv-cache"]}>
        <Routes>
          <Route path="/topics/:topicId?" element={<TopicPages index={topics} />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(kvHtml).toContain("一次推理请求中，KV Cache 怎样省空间、免重算、跨卡搬运？");
    expect(kvHtml).toContain("核心技术路线与工程边界");
    expect(kvHtml).toContain("块与容量管理");
    expect(kvHtml).toContain("每日收录趋势");
    expect(kvHtml).toContain("涉及的推理生命周期环节");

    const specHtml = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/topics/speculative-decoding"]}>
        <Routes>
          <Route path="/topics/:topicId?" element={<TopicPages index={topics} />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(specHtml).toContain("推测解码怎样在不改变输出分布的前提下压缩单步延迟？");
    expect(specHtml).toContain("方法与模型适配");
    expect(specHtml).toContain("候选生成与验证");
    expect(specHtml).toContain("执行与部署");
  });
});
