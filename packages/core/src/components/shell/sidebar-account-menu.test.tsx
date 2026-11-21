/**
 * PLATFORM-P1-10.16 / 10.17: the avatar menu's two admin rows. "Platform admin" appears
 * only when the layout gave it an address (an email in PLATFORM_ADMIN_EMAILS), and from an
 * organization's address it points at the main one. "Demo data" follows the business-admin
 * flag. Neither is a gate: the proxy and the pages check the caller themselves.
 */
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The menu's rows render only while it is open; open it for the static render.
vi.mock("react", async (original) => ({ ...(await original<typeof import("react")>()), useState: () => [true, vi.fn()] }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const { SidebarAccountMenu } = await import("./sidebar-account-menu");

const base = { name: "Founder", email: "founder@example.com" };
const render = (user: Record<string, unknown>) =>
  renderToStaticMarkup(<SidebarAccountMenu user={{ ...base, ...user } as never} onSignOut={() => {}} onNavigate={() => {}} />);
/** The href of the menu row with this label: each row is one anchor ending in its text. */
const hrefOf = (html: string, label: string) => {
  const row = html.split("<a ").find((part) => part.split("</a>")[0]!.endsWith(`${label}`));
  return row ? (/href="([^"]*)"/.exec(row)?.[1] ?? null) : null;
};

describe("the avatar menu's admin rows", () => {
  it("shows neither to an ordinary member", () => {
    const html = render({});
    expect(html).not.toContain("Platform admin");
    expect(html).not.toContain("Demo data");
  });

  it("links a platform admin on an organization's address to the console on the main address", () => {
    const html = render({ platformAdminUrl: "https://ark.example.com/platform", isBusinessAdmin: true });
    expect(hrefOf(html, "Platform admin")).toBe("https://ark.example.com/platform");
    expect(hrefOf(html, "Demo data")).toBe("/dashboard/admin");
  });

  it("links to /platform on the main address itself", () => {
    expect(hrefOf(render({ platformAdminUrl: "/platform" }), "Platform admin")).toBe("/platform");
  });

  it("shows a business admin the account tools and no console link", () => {
    const html = render({ isBusinessAdmin: true, platformAdminUrl: null });
    expect(hrefOf(html, "Demo data")).toBe("/dashboard/admin");
    expect(html).not.toContain("Platform admin");
  });
});
