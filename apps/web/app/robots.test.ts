import { describe, expect, it } from "vitest";
import robots, { AI_CRAWLERS } from "./robots";

describe("robots.txt", () => {
  const rules = [robots().rules].flat();

  it("keeps the public site open to search engines and the app closed", () => {
    const everyone = rules.find((r) => r.userAgent === "*");
    expect(everyone?.allow).toBe("/");
    expect(everyone?.disallow).toEqual(expect.arrayContaining(["/dashboard", "/api/", "/help"]));
  });

  it("shuts AI crawlers out of the whole site", () => {
    const ai = rules.find((r) => Array.isArray(r.userAgent));
    expect(ai?.userAgent).toEqual(AI_CRAWLERS);
    expect(ai?.disallow).toBe("/");
    expect(AI_CRAWLERS).toEqual(expect.arrayContaining(["GPTBot", "ClaudeBot", "CCBot", "Google-Extended"]));
    expect(AI_CRAWLERS).not.toContain("Googlebot");
  });
});
