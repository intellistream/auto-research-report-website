import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import ResearchQuery from "./ResearchQuery";

const id = "569aeb71-ff29-4ea6-9c87-8dfe537a7795";
const render = (path: string) => renderToStaticMarkup(<MemoryRouter initialEntries={[path]}><ResearchQuery /></MemoryRouter>);

afterEach(() => vi.unstubAllEnvs());

describe("research query entry modes", () => {
  it("keeps the group flow in the current page by default", () => {
    vi.stubEnv("VITE_RESEARCH_MODE", "");
    const html = render(`/research?task=${id}`);
    expect(html).toContain("生成调研报告");
    expect(html).not.toContain("调研任务链接");
    expect(html).not.toContain("正在读取调研任务");
  });

  it("offers background submission at the public entry point", () => {
    vi.stubEnv("VITE_RESEARCH_MODE", "public");
    const html = render("/research");
    expect(html).toContain("创建调研任务");
    expect(html).toContain("后台生成");
    expect(html).not.toContain("调研任务链接");
  });

  it("opens a public task view immediately without another submission form", () => {
    vi.stubEnv("VITE_RESEARCH_MODE", "public");
    const html = render(`/research?task=${id.toUpperCase()}`);
    expect(html).toContain("正在读取调研任务");
    expect(html).toContain("调研任务链接");
    expect(html).toContain(`/research?task=${id}`);
    expect(html).toContain("发起新调研");
    expect(html).not.toContain("<form");
    expect(html).not.toContain("创建调研任务");
  });

  it("rejects invalid or ambiguous links without a task view or submission form", () => {
    vi.stubEnv("VITE_RESEARCH_MODE", "public");
    for (const path of ["/research?task=../../private", "/research?task=", `/research?task=${id}&task=${id}`]) {
      const html = render(path);
      expect(html).toContain("调研任务链接无效");
      expect(html).not.toContain("正在读取调研任务");
      expect(html).not.toContain("调研任务链接\"");
      expect(html).not.toContain("<form");
    }
  });
});
