import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Github, ShieldCheck } from "lucide-react";
import { Notice } from "./workbench-ui";
import { useWorkbenchSession } from "./WorkbenchSession";
import { adminLocation, researchPath, safeResearchContext } from "./workbench-navigation";
import type { Session, WorkbenchApi } from "./workbench-api";
import WorkbenchWorkspace from "./WorkbenchWorkspace";
import WorkbenchAdmin from "./WorkbenchAdmin";
import "./workbench.css";

export default function ResearchWorkbench() {
  const state = useWorkbenchSession(), location = useLocation();
  const admin = location.pathname === adminLocation;
  if (!state) return <div className="workbench"><Notice>正在确认登录状态…</Notice></div>;
  const { api, session, checking, validating, message, checkError, connection, logoutRetry, checkSession, logout, research, openResearch } = state;
  const returnTo = "/#" + (admin ? adminLocation : researchPath(location.search));
  if (!session) return <section className="workbench wb-login" aria-labelledby="wb-title">
    <header><span className="wb-eyebrow"><ShieldCheck size={16} />个人研究工作台</span><h1 id="wb-title">{admin ? "管理后台" : "研究查询"}</h1>
      <p>{admin ? "请先登录，只有管理员可以访问管理后台。" : "在一项研究中持续生成报告，旧报告和生成记录分别保留。"}</p></header>
    {checking ? <Notice>正在确认登录状态…</Notice> : <>
      {message && <Notice>{message}</Notice>}
      {logoutRetry !== null ? <button className="wb-primary" onClick={() => void logout(logoutRetry)}>重试退出</button>
        : <a className="wb-button wb-primary" href={`/auth/github/login?${new URLSearchParams({ return_to: returnTo })}`}><Github size={18} />使用 GitHub 登录</a>}
      {checkError && <Notice error><p>{checkError}</p><button disabled={validating} onClick={() => void checkSession()}>{validating ? "正在检查…" : "重试"}</button></Notice>}
      <p className="wb-muted">须由管理员开通。日报、专题和已发布的组内 MOD 仍可公开浏览。</p>
      {admin && <Link className="wb-button" to="/research">返回我的研究</Link>}
    </>}
  </section>;
  return <div className="workbench">
    {connection && <Notice error>{connection} <button disabled={validating} onClick={() => void checkSession()}>{validating ? "正在检查…" : "重试"}</button></Notice>}
    <SignedWorkbench key={session.member.user_id} api={api} session={session} available={!connection} research={research} openResearch={openResearch} />
  </div>;
}
function SignedWorkbench({ api, session, available, research, openResearch }: {
  api: WorkbenchApi; session: Session; available: boolean; research: { path: string; scrollY: number }; openResearch: (path: string) => void;
}) {
  const location = useLocation(), admin = location.pathname === adminLocation;
  const [visitedResearch, setVisitedResearch] = useState(!admin);
  const [visitedAdmin, setVisitedAdmin] = useState(admin && session.member.is_admin);
  const context = safeResearchContext(location.state?.researchReturn) ?? research;
  useEffect(() => {
    if (!admin) setVisitedResearch(true);
    if (admin && session.member.is_admin) setVisitedAdmin(true);
  }, [admin, session.member.is_admin]);
  useEffect(() => {
    if (admin) return;
    const restore = safeResearchContext(location.state?.researchRestore);
    if (!restore) return;
    const timer = setTimeout(() => window.scrollTo(0, restore.scrollY), 0);
    return () => clearTimeout(timer);
  }, [admin, location.key]);
  const search = admin ? context.path.slice(context.path.indexOf("?") < 0 ? context.path.length : context.path.indexOf("?")) : location.search;
  return <>
    {(visitedResearch || !admin) && <div hidden={admin} data-workbench-view="research">
      <WorkbenchWorkspace api={api} available={available} researchSearch={search} onNavigate={openResearch} />
    </div>}
    {admin && <header className="wb-top wb-admin-heading"><div><span className="wb-eyebrow">个人研究工作台 / 管理</span><h1>管理后台</h1></div>
      <Link className="wb-button" to={context.path} state={{ researchRestore: context }}>返回我的研究</Link></header>}
    {session.member.is_admin ? (visitedAdmin || admin) && <div hidden={!admin} data-workbench-view="admin"><WorkbenchAdmin api={api} available={available} /></div>
      : admin && <Notice error>当前账号没有管理权限。请返回本人的研究，或使用具有管理权限的账号登录。</Notice>}
  </>;
}
