import { lazy, Suspense, useMemo } from "react";
import { Link, Route, Routes, useLocation, useMatch, useParams, useSearchParams } from "react-router-dom";
import type { FlowIndex } from "./chapter-intros";
import { localReports, useJson, type Catalog, type Report } from "./report-preview-data";
import type { TopicIndex } from "./TopicPages";
import SiteLayout from "../shell/SiteLayout";
import OverviewPage from "../views/OverviewPage";
import ArchivePage from "../views/ArchivePage";

const DailyReportReader = lazy(() => import("./DailyReportReader"));
const TopicPages = lazy(() => import("./TopicPages"));
const Contributors = lazy(() => import("./Contributors"));
const ResearchQuery = lazy(() => import("./ResearchQuery"));

function ReaderRoute({ catalog, days }: { catalog: Catalog; days: string[] }) {
  const { day: requestedDay } = useParams();
  const day = !requestedDay || requestedDay === "latest" ? days[0] : requestedDay;
  const [query] = useSearchParams();
  const record = catalog.days[day];
  const requested = query.get("version") ?? record?.current;
  const version = record?.versions.find((item) => item.sha256 === requested);
  const result = useJson<Report>(version?.path);

  if (!version) {
    return (
      <div className="overview-status-card error" role="alert">
        没有找到该日期或版本的日报。<Link to="/reports">返回日报档案</Link>
      </div>
    );
  }

  return (
    <Suspense fallback={<div className="overview-status-card" role="status">正在打开日报…</div>}>
      <DailyReportReader catalog={catalog} days={days} day={day} version={version} result={result} />
    </Suspense>
  );
}

export default function DocxPreview() {
  const { pathname } = useLocation();
  const topicRoute = /^\/topics(?:\/|$)/.test(pathname);
  const kvTopicRoute = /^\/topics\/kv-cache\/?$/.test(pathname);
  const result = useJson<Catalog>(topicRoute ? undefined : "catalog.json");
  const catalog = result?.data;
  const days = useMemo(
    () => (catalog?.schemaVersion === 1 ? Object.keys(catalog.days).sort().reverse() : []),
    [catalog],
  );
  const research = useMatch("/research");
  const overview = pathname === "/";
  const flow = useJson<FlowIndex>(overview ? "flow-index.json" : undefined);
  const topics = useJson<TopicIndex>(topicRoute && !kvTopicRoute ? "topics.json" : undefined);

  return (
    <SiteLayout catalog={catalog} days={days} wide={overview}>
      {pathname === "/contributors" ? (
        <Suspense fallback={<div className="overview-status-card" role="status">正在打开贡献者页面…</div>}>
          <Contributors />
        </Suspense>
      ) : research ? (
        <Suspense fallback={<div className="overview-status-card" role="status">正在打开研究查询…</div>}>
          <ResearchQuery />
        </Suspense>
      ) : topicRoute ? (
        <Suspense fallback={<div className="overview-status-card" role="status">正在打开专题…</div>}>
          <Routes><Route path="/topics/:topicId?" element={<TopicPages index={topics?.data} error={topics?.error} />} /></Routes>
        </Suspense>
      ) : result?.error ? (
        <div className="overview-status-card error" role="alert">
          {localReports ? "请先导入本地日报。" : "日报目录加载失败。"}
          {result.error}
        </div>
      ) : !catalog ? (
        <div className="overview-status-card" role="status">
          正在加载日报索引…
        </div>
      ) : !days.length ? (
        <div className="overview-status-card error" role="alert">
          索引为空或版本不支持。
        </div>
      ) : (
        <Suspense fallback={<div className="overview-status-card" role="status">正在打开页面…</div>}>
          <Routes>
            <Route path="/" element={<OverviewPage catalog={catalog} days={days} result={flow} />} />
            <Route path="/reports" element={<ArchivePage catalog={catalog} days={days} />} />
            <Route path="/reports/:day" element={<ReaderRoute catalog={catalog} days={days} />} />
            <Route
              path="*"
              element={
                <div className="overview-status-card">
                  页面不存在。<Link to="/reports">查看历史日报</Link>
                </div>
              }
            />
          </Routes>
        </Suspense>
      )}
    </SiteLayout>
  );
}
