import { describe, expect, it } from "vitest";
import { researchPath, safeResearchContext } from "./workbench-navigation";
describe("safe management return context", () => {
  it("keeps only opaque study/report identities", () => {
    expect(researchPath("?study=s1&job=j1&token=discard")).toBe("/research?study=s1&job=j1");
    expect(safeResearchContext({ path: "/research?study=s1&job=j1", scrollY: 600 })).toEqual({ path: "/research?study=s1&job=j1", scrollY: 600 });
  });
  it("rejects external, malformed or ambiguous return targets", () => {
    for (const path of ["https://other.org", "//other.org", "/research/admin", "/research?study=s1&study=s2", "/research?study=../private", "/research?job=j1", "/research?study=s1#token", "/research?token=secret"]) expect(safeResearchContext({ path, scrollY: 1 })).toBeUndefined();
  });
});
