import { useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ChevronDown, Github, LogOut } from "lucide-react";
import { useWorkbenchSession } from "../pages/WorkbenchSession";
import { adminLocation, safeResearchContext } from "../pages/workbench-navigation";
import { dateText } from "../pages/workbench-ui";
import "./workbench-account.css";

export default function WorkbenchAccount() {
  const state = useWorkbenchSession();
  const location = useLocation(), navigate = useNavigate();
  const menu = useRef<HTMLDetailsElement>(null), trigger = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (!menu.current?.contains(event.target as Node)) menu.current?.removeAttribute("open"); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
  useEffect(() => { menu.current?.removeAttribute("open"); }, [location.key]);
  if (!state?.session) return null;
  const { session, logout, rememberResearch } = state;
  const context = safeResearchContext(location.state?.researchReturn) ?? state.research;
  function close() { menu.current?.removeAttribute("open"); }
  return <details className="wb-header-account" ref={menu} onKeyDown={(event) => {
    if (event.key === "Escape") { close(); trigger.current?.focus(); event.stopPropagation(); }
  }}>
    <summary ref={(element) => { trigger.current = element; }} aria-label={`账号菜单 @${session.member.github_login}`}>
      <Github size={17} aria-hidden="true" /><span className="wb-header-login">@{session.member.github_login}</span><ChevronDown size={13} aria-hidden="true" />
    </summary>
    <nav className="wb-account-menu" aria-label="账号操作">
      <p className="wb-account-identity">@{session.member.github_login}</p>
      <p className="wb-account-expiry">当前设备会话至 {dateText(session.expires_at)}</p>
      <Link to={context.path} state={{ researchRestore: context }} onClick={close}>我的研究</Link>
      {session.member.is_admin && <Link to={adminLocation} onClick={(event) => {
        if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
        event.preventDefault();
        const researchReturn = rememberResearch(); close(); navigate(adminLocation, { state: { researchReturn } });
      }}>管理后台</Link>}
      <div className="wb-account-menu-divider" />
      <button type="button" onClick={() => { close(); void logout(false); }}><LogOut size={15} aria-hidden="true" />退出当前设备</button>
      <button type="button" onClick={() => { close(); void logout(true); }}>退出所有设备</button>
    </nav>
  </details>;
}
