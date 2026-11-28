/** PLATFORM-NAV-P0-03.5: the whole business name shows in the top bar; it wraps, never cut. */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/b" }));

const { BusinessSwitcher } = await import("./business-switcher");

describe("BusinessSwitcher's top-bar button", () => {
  it("shows the whole name, wrapping to a second line instead of an ellipsis", () => {
    const name = "WonderHome Solutions Private Limited";
    const html = renderToStaticMarkup(
      <BusinessSwitcher businesses={[{ id: "b1", name, slug: "b1" } as never]} activeBusinessId="b1" businessHref={() => "/b1"} />,
    );
    const label = html.match(/<span class="([^"]*)">WonderHome Solutions Private Limited<\/span>/);
    expect(label).not.toBeNull();
    expect(label![1]).toContain("line-clamp-2");
    expect(label![1]).not.toContain("truncate");
    expect(html).not.toContain("max-w-[15rem]");
    expect(html).toContain(`title="${name}"`);
  });
});
