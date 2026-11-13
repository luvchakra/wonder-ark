/** PLATFORM-NAV-P0-04.1: the round menu button at the bottom right opens the sidebar drawer. */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ open: false, setOpen: vi.fn() }));
vi.mock("./sidebar-context", () => ({ useSidebar: () => ({ open: h.open, setOpen: h.setOpen }) }));
const { SidebarFab } = await import("./sidebar-fab");

describe("SidebarFab", () => {
  it("is a round button at the bottom right, shown only where the sidebar is a drawer", () => {
    h.open = false;
    const html = renderToStaticMarkup(<SidebarFab />);
    expect(html).toContain('aria-label="Open menu"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toMatch(/class="[^"]*\bfixed\b[^"]*\bright-4\b[^"]*\brounded-full\b[^"]*\blg:hidden\b/);
  });

  it("says it closes the menu while the drawer is open", () => {
    h.open = true;
    const html = renderToStaticMarkup(<SidebarFab />);
    expect(html).toContain('aria-label="Close menu"');
    expect(html).toContain('aria-expanded="true"');
  });

  it("toggles the drawer when pressed", () => {
    h.open = false;
    const element = SidebarFab() as unknown as { props: { onClick: () => void } };
    element.props.onClick();
    expect(h.setOpen).toHaveBeenCalledWith(true);
  });
});
