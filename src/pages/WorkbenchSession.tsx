import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { WorkbenchApi, WorkbenchError, isAbort, type Session } from "./workbench-api";
import { adminLocation, researchPath, type ResearchContext } from "./workbench-navigation";

type WorkbenchSessionState = {
  api: WorkbenchApi; session?: Session; checking: boolean; validating: boolean; message: string; checkError: string; connection: string;
  logoutRetry: boolean | null; checkSession: () => Promise<void>; logout: (all: boolean) => Promise<void>;
  research: ResearchContext; rememberResearch: () => ResearchContext; openResearch: (path: string) => void;
};
const Context = createContext<WorkbenchSessionState | null>(null);
export const useWorkbenchSession = () => useContext(Context);
const anonymousCodes = new Set(["authentication_required", "not_authenticated", "unauthenticated"]);
const expiredCodes = new Set(["session_expired", "session_revoked"]);
const disabledCodes = new Set(["member_disabled", "member_inactive"]);
const admissionCodes = new Set(["member_not_allowed", "not_admitted", "not_approved"]);
function businessResult(error: WorkbenchError) {
  return (error.status === 401 && (anonymousCodes.has(error.code) || expiredCodes.has(error.code) || error.code === "oauth_failed"))
    || (error.status === 403 && (disabledCodes.has(error.code) || admissionCodes.has(error.code)))
    || (error.status === 503 && error.code === "github_unavailable");
}
function businessMessage(error: WorkbenchError) {
  const login = error.account && /^[a-zA-Z0-9-]{1,39}$/.test(error.account) ? `GitHub @${error.account}：` : "";
  if (error.code === "admin_required") return "当前账号没有管理权限，请重新登录后核对。";
  if (disabledCodes.has(error.code)) return login + "当前账号已停用，请联系管理员。";
  if (admissionCodes.has(error.code)) return login + "当前 GitHub 账号尚未开通研究权限，请联系管理员。";
  if (error.code === "session_expired") return "登录会话已过期，请重新登录。";
  if (error.code === "session_revoked") return "登录会话已失效，请重新登录。";
  if (error.code === "oauth_failed") return "本次 GitHub 登录未完成，请重新登录。";
  if (error.code === "github_unavailable") return "GitHub 登录暂不可用，请稍后重新登录。";
  return "";
}
function checkFailure(error: unknown) {
  if (error instanceof WorkbenchError && error.code === "network_error") return "无法连接登录服务，请检查网络后重试。";
  if (error instanceof WorkbenchError && error.status >= 500) return "登录服务暂时不可用，请稍后重试。";
  if (error instanceof WorkbenchError && error.status === 404) return "登录状态服务尚未就绪，请稍后重试。";
  return "登录状态检查未完成，请重试。";
}
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
  const [checking, setChecking] = useState(true), [validating, setValidating] = useState(false);
  const [message, setMessage] = useState(""), [checkError, setCheckError] = useState("");
  const [logoutRetry, setLogoutRetry] = useState<boolean | null>(null);
  const logoutPending = useRef(false), loginResult = useRef("");
  const current = useRef<Session | undefined>(undefined);
  const flight = useRef<Promise<void> | null>(null), generation = useRef(0);
  const signingOut = useRef(false), alive = useRef(true);
  const reject = useCallback((error: WorkbenchError) => {
    if (!alive.current) return;
    const hadSession = !!current.current;
    generation.current++; flight.current = null; api.clear(); current.current = undefined;
    setSession(undefined); setChecking(false); setValidating(false); setCheckError("");
    const notice = businessMessage(error) || (hadSession && anonymousCodes.has(error.code) ? "登录会话已失效，请重新登录。" : "");
    if (notice) loginResult.current = notice;
    // T01 notices are consumed once; a later ordinary anonymous check must not erase one.
    setMessage(loginResult.current);
  }, [api]);
  const checkSession = useCallback((): Promise<void> => {
    if (!alive.current || signingOut.current || logoutPending.current) return Promise.resolve();
    if (flight.current) return flight.current;
    const expected = generation.current;
    setValidating(true);
    const request = Promise.resolve().then(async () => {
      try {
        const next = await api.session();
        if (!alive.current || expected !== generation.current) return;
        loginResult.current = ""; current.current = next; setSession(next); setMessage(""); setCheckError("");
      } catch (error) {
        if (!alive.current || expected !== generation.current || isAbort(error)) return;
        if (error instanceof WorkbenchError && businessResult(error)) reject(error);
        else {
          const denied = error instanceof WorkbenchError && [401, 403].includes(error.status);
          if (denied || (current.current && Date.parse(current.current.expires_at) <= Date.now())) {
            const expired = !!current.current && Date.parse(current.current.expires_at) <= Date.now();
            reject(expired ? new WorkbenchError("", "session_expired", 401) : error as WorkbenchError);
          }
          setCheckError(checkFailure(error));
        }
      }
    }).finally(() => {
      if (flight.current !== request) return;
      flight.current = null;
      if (alive.current) { setChecking(false); setValidating(false); }
    });
    flight.current = request;
    return request;
  }, [api, reject]);
  useEffect(() => {
    alive.current = true; api.onSessionRejected = reject; void checkSession();
    const refresh = () => { if (!document.hidden) void checkSession(); };
    const interval = setInterval(refresh, 15_000);
    window.addEventListener("focus", refresh); window.addEventListener("pageshow", refresh); document.addEventListener("visibilitychange", refresh);
    return () => {
      alive.current = false; clearInterval(interval);
      window.removeEventListener("focus", refresh); window.removeEventListener("pageshow", refresh); document.removeEventListener("visibilitychange", refresh);
      // React StrictMode replays the effect synchronously. Reuse its in-flight request
      // so a one-use login notice cannot be consumed by an immediately aborted duplicate.
      queueMicrotask(() => { if (!alive.current) { generation.current++; api.onSessionRejected = undefined; api.clear(); flight.current = null; } });
    };
  }, [api, checkSession, reject]);
  async function logout(all: boolean) {
    generation.current++; flight.current = null; api.cancelPending(); loginResult.current = "";
    signingOut.current = true; logoutPending.current = true; current.current = undefined;
    setSession(undefined); setChecking(true); setValidating(false); setLogoutRetry(null); setCheckError("");
    try {
      await api.logout(all);
      if (!alive.current) return;
      logoutPending.current = false; api.clear(); loginResult.current = all ? "已退出所有设备。" : "已退出当前设备。"; setMessage(loginResult.current);
    } catch (error) {
      if (!alive.current) return;
      if (!(error instanceof WorkbenchError && error.status === 401)) {
        setMessage("退出请求尚未确认，页面中的私人内容已清除。请重试退出以确认会话撤销。"); setLogoutRetry(all);
      } else { logoutPending.current = false; api.clear(); loginResult.current = "登录会话已失效，请重新登录。"; setMessage(loginResult.current); }
    } finally { if (alive.current) setChecking(false); signingOut.current = false; }
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
  const connection = session && checkError ? `${checkError} 已暂停新的操作，已接收的生成继续。` : "";
  return <Context.Provider value={{ api, session, checking, validating, message, checkError, connection, logoutRetry, checkSession, logout, research, rememberResearch, openResearch }}>{children}</Context.Provider>;
}
