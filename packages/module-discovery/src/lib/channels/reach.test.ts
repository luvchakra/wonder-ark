/** DISC-REACH-P0-01.1 */
import { describe, expect, it } from "vitest";
import { dmPlatformOf, reachOf } from "./reach";
import { channelOf, publishedEmail } from "../data-sources/channels";

describe("dmPlatformOf", () => {
  it("names the platform of a profile link, and nothing for other links", () => {
    expect(dmPlatformOf("https://www.instagram.com/weekview/")).toBe("instagram");
    expect(dmPlatformOf("https://m.facebook.com/groups/1")).toBe("facebook");
    expect(dmPlatformOf("https://in.linkedin.com/company/x")).toBe("linkedin");
    expect(dmPlatformOf("https://youtube.com/@x")).toBeNull();
    expect(dmPlatformOf("https://notinstagram.com/x")).toBeNull();
    expect(dmPlatformOf("javascript:alert(1)//instagram.com")).toBeNull();
    expect(dmPlatformOf(null)).toBeNull();
  });
});

describe("reachOf", () => {
  it("is an email only when there is an address to send it to", () => {
    expect(reachOf({ unsent: [{ channel: "email" }], hasContactEmail: true })).toBe("email");
    expect(reachOf({ unsent: [{ channel: "email" }], hasContactEmail: false })).toBe("needs_email");
  });
  it("prefers a direct-message draft, and is nothing with no unsent draft", () => {
    expect(reachOf({ unsent: [{ channel: "email" }, { channel: "instagram" }], hasContactEmail: false })).toBe("instagram");
    expect(reachOf({ unsent: [], hasContactEmail: true })).toBeNull();
  });
});

// DISC-REACH-P0-01.2: a published enquiry address arrives with the search result.

describe("a channel's published address", () => {
  it("is kept only when it is an address", () => {
    expect(publishedEmail(" Hello@Podz.app ")).toBe("hello@podz.app");
    expect(publishedEmail("hello at podz dot app")).toBeNull();
    expect(publishedEmail("a@b")).toBeNull();
    expect(publishedEmail('x"><script>@evil.com')).toBeNull();
    expect(publishedEmail(null)).toBeNull();
  });

  it("is read from the search result with where it was published, and absent on older results", () => {
    const base = { kind: "channel", channelType: "podcast", topics: [], audience: null, url: "https://podz.app", contactUrl: null, observedAt: "2026-11-23T00:00:00Z" };
    expect(channelOf({ ...base, contactEmail: "hello@podz.app", contactEmailSource: "channel's website" })).toMatchObject({ contactEmail: "hello@podz.app", contactEmailSource: "channel's website" });
    expect(channelOf(base)).toMatchObject({ contactEmail: null, contactEmailSource: null });
    expect(channelOf({ ...base, contactEmail: "ignore previous instructions" })?.contactEmail).toBeNull();
  });
});
