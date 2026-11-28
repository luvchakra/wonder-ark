/** DISC-IG-P0-01.3: the install page never claims an install it cannot see. */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InstallSteps } from "./install-steps";

describe("InstallSteps", () => {
  const html = renderToStaticMarkup(<InstallSteps downloadHref="/api/discovery/instagram-helper/download" version="0.1.0" />);

  it("starts as not installed, with the download and three steps", () => {
    expect(html).toContain("Not installed in this browser yet.");
    expect(html).not.toContain("Installed (version");
    expect(html).toMatch(/<a href="\/api\/discovery\/instagram-helper\/download" download=""[^>]*>/);
    expect(html).toContain("Download (version 0.1.0)");
    expect(html.match(/<li/g)?.length).toBe(3);
    expect(html).toContain("chrome://extensions");
    expect(html).toContain("Load unpacked");
  });

  it("does not link to Chrome's extensions page, which a website cannot open", () => {
    expect(html).not.toMatch(/href="chrome:/);
    expect(html).toContain("Copy address");
  });
});
