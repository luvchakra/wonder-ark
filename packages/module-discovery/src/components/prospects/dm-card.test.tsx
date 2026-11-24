/** DISC-REACH-P0-01.1: a direct message on To do is copied and opened, never sent by WonderArk. */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DmCard } from "./dm-card";

const render = (profileLink: string | null) =>
  renderToStaticMarkup(
    <DmCard name="weekview" detail="2,741 audience" text="Hi! Love your weekly planning posts." platform="Instagram" profileLink={profileLink} prospectHref="/b/o/p/prospects/x#messages" markSentAction={async () => {}} editAction={async () => null} rewriteAction={async () => null} />,
  );

describe("DmCard", () => {
  it("opens the channel's own page in a new tab and offers Mark as sent; it has no Send", () => {
    const html = render("https://www.instagram.com/weekview/");
    expect(html).toContain('href="https://www.instagram.com/weekview/"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain("Copy and open Instagram");
    expect(html).toContain("Mark as sent");
    expect(html).not.toMatch(/>\s*Send\s*</);
    expect(html).toContain("WonderArk never sends on this platform");
    expect(html).toContain('href="/b/o/p/prospects/x#messages"');
  });

  it("shows the whole message with Edit beside it (DISC-REACH-P0-01.4)", () => {
    const html = render("https://www.instagram.com/weekview/");
    expect(html).toContain("Hi! Love your weekly planning posts.");
    expect(html).not.toContain("line-clamp");
    expect(html).toMatch(/>\s*Edit\s*</);
    expect(html).toContain("AI-generated");
  });

  it("only copies when the channel has no link", () => {
    const html = render(null);
    expect(html).toContain("Copy message");
    expect(html).not.toContain('target="_blank"');
  });
});
