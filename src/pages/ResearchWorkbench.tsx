import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Github, ShieldCheck } from "lucide-react";
import { WorkbenchApi, WorkbenchError, errorMessage, isAbort, privateLocation, validId, type Session } from "./workbench-api";
import { Notice } from "./workbench-ui";
import WorkbenchWorkspace from "./WorkbenchWorkspace";
import "./workbench.css";

export default function ResearchWorkbench() {
  const [api] = useState(() => new WorkbenchApi());
  const [session, setSession] = useState<Session>();
  const [checking, setChecking] = useState(true), [message, setMessage] = useState("");
  const [connection, setConnection] = useState("");
  const [logoutRetry, setLogoutRetry] = useState<boolean | null>(null);
  const logoutPending = useRef(false);
  const loginResult = useRef("");
  const current = useRef<Session | undefined>(undefined);
  const checkingRef = useRef(false), signingOut = useRef(false), alive = useRef(true);
  const [parameters] = useSearchParams();
  const study = parameters.getAll("study"), job = parameters.getAll("job");
  const returnTo = "/#" + privateLocation(study.length === 1 && validId(study[0]) ? study[0] : undefined,
    job.length === 1 && validId(job[0]) ? job[0] : undefined);
  const reject = useCallback((error: WorkbenchError) => {
    api.clear(); current.current = undefined; setSession(undefined); setChecking(false); setConnection("");
    const account = error.account ? `GitHub @${error.account}：` : "";
    const notice = account + (/disabled|inactive/.test(error.code) ? "当前账号已停用，请联系管理员。"
      : /not_approved|not_admitted|not_allowed|membership/.test(error.code) ? "当前 GitHub 账号尚未开通研究权限，请联系管理员。"
      : /oauth|github_unavailable|login_failed/.test(error.code) ? "本次 GitHub 登录未完成，请重新登录。" : "请登录或重新登录后查看本人的研究。");
    if (/disabled|oauth|github_unavailable|not_allowed/.test(error.code)) loginResult.current = notice;
    setMessage(loginResult.current || notice);
  }, [api]);
  const checkSession = useCallback(async () => {
    if (checkingRef.current || signingOut.current || logoutPending.current) return;
    checkingRef.current = true;
    try {
      let next = await api.session();
      if (!alive.current) return;
      if (current.current && current.current.member.user_id !== next.member.user_id) {
        api.clear(); current.current = undefined; setSession(undefined); setChecking(true); next = await api.session();
      }
      if (!alive.current) return;
      loginResult.current = ""; current.current = next; setSession(next); setConnection(""); setMessage(""); setChecking(false);
    } catch (error) {
      if (!alive.current || isAbort(error)) return;
      if (error instanceof WorkbenchError && [401, 403].includes(error.status)) reject(error);
      else if (current.current && Date.parse(current.current.expires_at) > Date.now()) {
        setConnection("暂时无法校验会话，已暂停新的操作。请恢复连接后重试。");
      } else {
        api.clear(); current.current = undefined; setSession(undefined); setChecking(false); setMessage(errorMessage(error));
      }
    } finally { checkingRef.current = false; }
  }, [api, reject]);
  useEffect(() => {
    alive.current = true; api.onSessionRejected = reject; void checkSession();
    const refresh = () => { if (!document.hidden) void checkSession(); };
    const interval = setInterval(refresh, 15_000);
    window.addEventListener("focus", refresh); window.addEventListener("pageshow", refresh); document.addEventListener("visibilitychange", refresh);
    return () => { alive.current = false; clearInterval(interval); api.onSessionRejected = undefined; api.clear();
      window.removeEventListener("focus", refresh); window.removeEventListener("pageshow", refresh);
      document.removeEventListener("visibilitychange", refresh); checkingRef.current = false; };
  }, [api, checkSession, reject]);
  async function logout(all: boolean) {
    api.cancelPending(); loginResult.current = ""; signingOut.current = true; logoutPending.current = true; current.current = undefined; setSession(undefined); setChecking(true); setLogoutRetry(null); setConnection("");
    try { await api.logout(all); logoutPending.current = false; api.clear(); setMessage(all ? "已退出所有设备。" : "已退出当前设备。"); }
    catch (error) {
      if (!(error instanceof WorkbenchError && error.status === 401)) {
        setMessage("退出请求尚未确认，页面中的私人内容已清除。请重试退出以确认会话撤销。"); setLogoutRetry(all);
      } else { logoutPending.current = false; api.clear(); setMessage("会话已失效，请重新登录。"); }
    } finally { setChecking(false); signingOut.current = false; }
  }
  if (!session) return <section className="workbench wb-login" aria-labelledby="wb-title">
    <header><span className="wb-eyebrow"><ShieldCheck size={16} />个人研究工作台</span><h1 id="wb-title">研究查询</h1><p>在一项研究中持续生成报告，旧报告和生成记录分别保留。</p></header>
    {checking ? <Notice>正在确认登录状态…</Notice> : <>
      {message && <Notice>{message}</Notice>}
      {logoutRetry !== null ? <button className="wb-primary" onClick={() => void logout(logoutRetry)}>重试退出</button>
        : <a className="wb-button wb-primary" href={`/auth/github/login?${new URLSearchParams({ return_to: returnTo })}`}><Github size={18} />使用 GitHub 登录</a>}
      <button onClick={() => void checkSession()}>重新检查登录状态</button><p className="wb-muted">须由管理员开通。日报、专题和已发布的组内 MOD 仍可公开浏览。</p>
    </>}
  </section>;
  return <div className="workbench">
    {connection && <Notice error>{connection} <button onClick={() => void checkSession()}>重新校验</button></Notice>}
    <WorkbenchWorkspace key={session.member.user_id} api={api} session={session} available={!connection} onLogout={logout} />
  </div>;
}
