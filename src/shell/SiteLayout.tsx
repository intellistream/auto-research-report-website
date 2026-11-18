import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Activity,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  Compass,
  Github,
  Menu,
  Moon,
  Search,
  Sun,
  Users,
  X,
} from "lucide-react";
import { Link, NavLink, useLocation } from "react-router-dom";
import type { Catalog } from "../pages/report-preview-data";
import CommandSearchModal from "./CommandSearchModal";
import "./shell.css";

function getInitialTheme(): "light" | "dark" {
  if (typeof document === "undefined") return "light";
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

export default function SiteLayout({
  catalog,
  days,
  wide = false,
  children,
}: {
  catalog?: Catalog;
  days: string[];
  wide?: boolean;
  children: ReactNode;
}) {
  const { pathname } = useLocation();
  const previousPath = useRef(pathname);
  const mainRef = useRef<HTMLElement>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">(getInitialTheme);

  const reading = pathname.startsWith("/reports/");
  const latestDay = days[0];

  useEffect(() => {
    setMobileMenuOpen(false);
    if (previousPath.current === pathname) return;
    previousPath.current = pathname;
    window.scrollTo(0, 0);
    mainRef.current?.focus({ preventScroll: true });
  }, [pathname]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen((prev) => !prev);
        return;
      }
      if (
        event.key === "/" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !(event.target instanceof HTMLInputElement) &&
        !(event.target instanceof HTMLTextAreaElement) &&
        !(event.target instanceof HTMLSelectElement)
      ) {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function toggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("sage-research-theme", next);
    } catch {
      /* ignore storage errors */
    }
  }

  return (
    <div className="docx-preview site-shell-root">
      <a
        className="docx-skip"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          mainRef.current?.focus();
        }}
      >
        跳到正文
      </a>

      <header className="site-header">
        <div className="site-header-inner">
          <Link className="site-brand" to="/" aria-label="社区研报首页">
            <span className="site-brand-emblem" aria-hidden="true">
              <Activity size={19} strokeWidth={2.3} />
            </span>
            <span className="site-brand-text">
              <strong>推理性能研报</strong>
              <small translate="no">SAGE · INFERENCE RESEARCH</small>
            </span>
          </Link>

          <nav className="site-nav-desktop" aria-label="主导航">
            <NavLink to="/" end>
              <Compass size={15} aria-hidden />
              优化总览
            </NavLink>
            <NavLink to="/reports" end>
              <CalendarDays size={15} aria-hidden />
              日报档案
            </NavLink>
            <NavLink to="/topics">
              <BookOpen size={15} aria-hidden />
              技术专题
            </NavLink>
            {latestDay && (
              <Link to={`/reports/${latestDay}`} aria-current={reading ? "page" : undefined}>
                <Activity size={15} aria-hidden />
                研报阅读
              </Link>
            )}
            <NavLink to="/contributors">
              <Users size={15} aria-hidden />
              贡献者
            </NavLink>
          </nav>

          <div className="site-header-actions">
            <button
              type="button"
              className="site-search-trigger"
              onClick={() => setSearchOpen(true)}
              aria-label="全局检索 PR、日报与专题（快捷键 Ctrl+K）"
            >
              <Search size={15} aria-hidden />
              <span className="site-search-placeholder">检索 PR / 日报 / 专题…</span>
              <kbd aria-hidden="true">Ctrl K</kbd>
            </button>

            <button
              type="button"
              className="site-icon-btn"
              onClick={toggleTheme}
              aria-label={theme === "light" ? "切换至深色模式" : "切换至浅色模式"}
              title={theme === "light" ? "切换至深色控制台主题" : "切换至浅色阅读主题"}
            >
              {theme === "light" ? <Moon size={17} aria-hidden /> : <Sun size={17} aria-hidden />}
            </button>

            <button
              type="button"
              className="site-icon-btn site-mobile-toggle"
              aria-expanded={mobileMenuOpen}
              aria-label={mobileMenuOpen ? "收起导航菜单" : "展开导航菜单"}
              onClick={() => setMobileMenuOpen((v) => !v)}
            >
              {mobileMenuOpen ? <X size={19} aria-hidden /> : <Menu size={19} aria-hidden />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <nav className="site-nav-mobile" aria-label="移动端主导航">
            <NavLink to="/" end>
              <Compass size={16} aria-hidden />
              优化总览
            </NavLink>
            <NavLink to="/reports" end>
              <CalendarDays size={16} aria-hidden />
              日报档案
            </NavLink>
            <NavLink to="/topics">
              <BookOpen size={16} aria-hidden />
              技术专题
            </NavLink>
            {latestDay && (
              <Link to={`/reports/${latestDay}`} aria-current={reading ? "page" : undefined}>
                <Activity size={16} aria-hidden />
                研报阅读（{latestDay}）
              </Link>
            )}
            <NavLink to="/contributors">
              <Users size={16} aria-hidden />
              贡献者
            </NavLink>
          </nav>
        )}
      </header>

      <div className="docx-workspace site-workspace">
        <main
          className={wide ? "docx-main docx-main-wide" : "docx-main"}
          id="main-content"
          ref={mainRef}
          tabIndex={-1}
        >
          {children}
        </main>
      </div>

      <footer className="site-footer">
        <div className="site-footer-inner">
          <div className="site-footer-brand">
            <div className="site-footer-logo">
              <span className="site-brand-emblem small" aria-hidden="true">
                <Activity size={15} strokeWidth={2.3} />
              </span>
              <strong>SAGE · 推理性能研报</strong>
            </div>
            <p>
              持续追踪 <code>vLLM</code> 与 <code>vLLM Ascend</code> 社区工程改动及前沿论文，按推理全生命周期定位优化机制、性能边界与原始代码证据。
            </p>
            <div className="site-footer-communities" aria-label="覆盖来源">
              <span>
                <i className="dot-vllm" /> vLLM Upstream
              </span>
              <span>
                <i className="dot-ascend" /> vLLM Ascend
              </span>
              <span>
                <i className="dot-paper" /> arXiv 研究论文
              </span>
            </div>
          </div>

          <div className="site-footer-links">
            <div>
              <h3>核心板块</h3>
              <ul>
                <li>
                  <Link to="/">推理优化总览</Link>
                </li>
                <li>
                  <Link to="/reports">历史日报档案</Link>
                </li>
                <li>
                  <Link to="/topics">技术专题综述</Link>
                </li>
                <li>
                  <Link to="/contributors">项目贡献者</Link>
                </li>
              </ul>
            </div>
            <div>
              <h3>生态与源码</h3>
              <ul>
                <li>
                  <a href="https://lab.sage.org.ai/" target="_blank" rel="noopener noreferrer">
                    SAGE Lab 主站 <ArrowUpRight size={13} aria-hidden />
                  </a>
                </li>
                <li>
                  <a
                    href="https://github.com/intellistream/auto-research-report-website"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Github size={13} aria-hidden /> 网站源码仓库 <ArrowUpRight size={13} aria-hidden />
                  </a>
                </li>
                <li>
                  <a href="https://github.com/vllm-project/vllm" target="_blank" rel="noopener noreferrer">
                    vLLM GitHub <ArrowUpRight size={13} aria-hidden />
                  </a>
                </li>
                <li>
                  <a href="https://github.com/vllm-project/vllm-ascend" target="_blank" rel="noopener noreferrer">
                    vLLM Ascend GitHub <ArrowUpRight size={13} aria-hidden />
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="site-footer-bottom">
          <span>每一条工程进展均保留原始 PR 链接与版本校验 · 只读研究门户</span>
          <span>北京时间 (Asia/Shanghai){latestDay ? ` · 最新收录至 ${latestDay}` : ""}</span>
        </div>
      </footer>

      <CommandSearchModal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        days={days}
        catalog={catalog}
      />
    </div>
  );
}
