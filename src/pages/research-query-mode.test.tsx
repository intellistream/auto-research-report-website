import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import ResearchQuery from "./ResearchQuery";
const render = (path: string) => renderToStaticMarkup(<MemoryRouter initialEntries={[path]}><ResearchQuery /></MemoryRouter>);
afterEach(() => vi.unstubAllEnvs());
describe("v4 research entry modes", () => {
  it("keeps the public research entry safe until a fixed workbench origin is configured", () => {
    vi.stubEnv("VITE_WORKBENCH_MODE", ""); vi.stubEnv("VITE_WORKBENCH_ORIGIN", "");
    const html = render("/research"); expect(html).toContain("研究查询"); expect(html).toContain("工作台入口尚未配置");
    expect(html).not.toContain("<form"); expect(html).not.toContain("创建调研任务");
  });
  it("links only to an explicit fixed HTTPS origin", () => {
    vi.stubEnv("VITE_WORKBENCH_MODE", ""); vi.stubEnv("VITE_WORKBENCH_ORIGIN", "https://research.example.org");
    expect(render("/research")).toContain('href="https://research.example.org/#/research"');
    vi.stubEnv("VITE_WORKBENCH_ORIGIN", "https://temporary.trycloudflare.com");
    expect(render("/research")).toContain("工作台入口尚未配置");
  });
  it("requires a session before displaying private research", () => {
    vi.stubEnv("VITE_WORKBENCH_MODE", "enabled");
    const html = render("/research?study=s1&job=j1"); expect(html).toContain("正在确认登录状态"); expect(html).not.toContain("<form");
  });
  it("shows the legacy anonymous migration notice without looking up a task", () => {
    vi.stubEnv("VITE_WORKBENCH_MODE", "enabled");
    const html = render("/research?task=569aeb71-ff29-4ea6-9c87-8dfe537a7795");
    expect(html).toContain("旧匿名任务不在个人工作台中提供访问"); expect(html).not.toContain("<form"); expect(html).not.toContain("正在读取调研任务");
  });
});
