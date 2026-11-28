import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { WorkbenchApi, WorkbenchError, errorMessage, isAbort, type Session } from "./workbench-api";
import { adminLocation, researchPath, type ResearchContext } from "./workbench-navigation";

type WorkbenchSessionState = {
  api: WorkbenchApi; session?: Session; checking: boolean; message: string; connection: string;
  logoutRetry: boolean | null; checkSession: () => Promise<void>; logout: (all: boolean) => Promise<void>;
  research: ResearchContext; rememberResearch: () => ResearchContext; openResearch: (path: string) => void;
};
const Context = createContext<WorkbenchSessionState | null>(null);
export const useWorkbenchSession = () => useContext(Context);
/** Pages never requests a private session; the dedicated same-origin build owns it. */
export function WorkbenchSessionProvider({ children }: { children: ReactNode }) {
  return import.meta.env.VITE_WORKBENCH_MODE === "enabled" ? <EnabledSession>{children}</EnabledSession> : <>{children}</>;
}
function EnabledSession({ children }: { children: ReactNode }) {
  const location = useLocation(), navigate = useNavigate();
  const locationRef = useRef(location); locationRef.current = location;
  const [research, setResearch] = useState<ResearchContext>(() => ({ path: location.pathname === "/research" ? researchPath(location.search) : "/research", scrollY: 0 }));
  const [api] = useState(() => new WorkbenchApi());
  const [session, setSession] = useState<Session>();
  const [checking, setChecking] = useState(true), [message, setMessage] = useState("");
  const [connection, setConnection] = useState("");
  const [logoutRetry, setLogoutRetry] = useState<boolean | null>(null);
  const logoutPending = useRef(false);
  const loginResult = useRef("");
  const current = useRef<Session | undefined>(undefined);
  const checkingRef = useRef(false), signingOut = useRef(false), alive = useRef(true);
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

  useEffect(() => {
    if (location.pathname === "/research") setResearch((old) => ({ ...old, path: researchPath(location.search) }));
  }, [location.pathname, location.search]);
  // A revoked or changed account cannot inherit another member's navigation context.
  const identity = useRef<string | undefined>(undefined);
  useEffect(() => {
    const next = session?.member.user_id;
    if (identity.current && identity.current !== next) setResearch({ path: "/research", scrollY: 0 });
    identity.current = next;
  }, [session?.member.user_id]);
  const rememberResearch = () => {
    const currentLocation = locationRef.current;
    if (currentLocation.pathname !== "/research") return research;
    const next = { path: researchPath(currentLocation.search), scrollY: window.scrollY };
    setResearch(next); return next;
  };
  const openResearch = (path: string) => {
    const next = researchPath(path.includes("?") ? path.slice(path.indexOf("?")) : "");
    setResearch((old) => ({ ...old, path: next }));
    if (locationRef.current.pathname !== adminLocation) navigate(next);
  };
  return <Context.Provider value={{ api, session, checking, message, connection, logoutRetry, checkSession, logout, research, rememberResearch, openResearch }}>{children}</Context.Provider>;
}
