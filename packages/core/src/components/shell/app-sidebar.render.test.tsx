import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * PLATFORM-NAV-P0-03.1 / 03.2 -- what the sidebar draws with Discovery open: Business as
 * a row above the modules, and Discovery as four links with no section to unfold.
 */
let pathname = "/acme/discovery/dashboard";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => pathname }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("./sidebar-context", () => ({ useSidebar: () => ({ open: false, setOpen: vi.fn() }) }));
vi.mock("./sidebar-account-menu", () => ({ SidebarAccountMenu: () => null }));

import { AppSidebar } from "./app-sidebar";

const MODULES = [
  { key: "discovery", name: "Discovery", icon: "Target", routePrefix: "/discovery", nav: [], licensed: true },
  {
    key: "crm",
    name: "CRM",
    icon: "Users",
    routePrefix: "/crm",
    nav: [{ items: [{ label: "Inbox", href: "/crm/inbox" }] }],
    licensed: true,
  },
];

function render(path: string, products = [{ id: "p1", name: "Meridian HomeTech B2B" }]) {
  pathname = path;
  return renderToStaticMarkup(
    <AppSidebar
      modules={MODULES as never}
      businesses={[{ id: "b1", name: "Acme" }] as never}
      activeBusinessId="b1"
      businessHref={() => "/acme"}
      productsByBusiness={{ b1: products }}
      user={{ name: "Founder", email: "founder@example.com" } as never}
    />,
  );
}

const links = (html: string): [string, string][] =>
  [...html.matchAll(/<a [^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/g)].map((m) => [m[2]!.replace(/<[^>]+>/g, ""), m[1]!]);
// Buttons with a visible label; the drawer's close button is an icon and is left out.
const buttons = (html: string) =>
  [...html.matchAll(/<button[^>]*>(.*?)<\/button>/g)].map((m) => m[1]!.replace(/<[^>]+>/g, "")).filter(Boolean);

describe("AppSidebar with Discovery open", () => {
  it("draws Business above the modules, then Discovery's four links", () => {
    const html = render("/acme/discovery/dashboard");
    const rows = links(html).filter(([label]) => label !== "" && !label.includes("WonderArk"));
    expect(rows).toEqual([
      ["Executive Dashboard", "/dashboard"],
      ["Business", "/acme/business"],
      ["Overview", "/acme/discovery/dashboard"],
      ["Acquisition", "/acme/discovery/offerings/p1"],
      ["Marketing", "/acme/discovery/marketing"],
      ["Funding", "/acme/discovery/funding"],
    ]);
    // Business comes before the first module's own row.
    expect(html.indexOf("/acme/business")).toBeLessThan(html.indexOf(">Discovery<"));
  });

  it("has nothing to unfold inside Discovery: the only buttons are the module rows", () => {
    expect(buttons(render("/acme/discovery/marketing/campaigns"))).toEqual(["Discovery", "CRM"]);
  });

  it("lists no offering by name", () => {
    expect(render("/acme/discovery/offerings/p1/prospects")).not.toContain("Meridian HomeTech B2B");
  });

  it("marks exactly one row as the current page", () => {
    const current = (path: string) => [...render(path).matchAll(/<a [^>]*aria-current="page"[^>]*>(.*?)<\/a>/g)].map((m) => m[1]!.replace(/<[^>]+>/g, ""));
    expect(current("/acme/business")).toEqual(["Business"]);
    expect(current("/acme/discovery/offerings/p1/campaigns/c1")).toEqual(["Acquisition"]);
    expect(current("/acme/discovery/funding/data-room")).toEqual(["Funding"]);
  });
});
