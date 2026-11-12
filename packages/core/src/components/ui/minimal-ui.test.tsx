import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AutoSubmitSelect } from "./auto-submit-select";
import { Fold } from "./fold";
import { MoreMenu, MoreMenuItem } from "./more-menu";

/** PLATFORM-NAV-P0-02.x -- the three helpers the simplified module pages share. Each one
 * exists to put one control on screen where there were several, so that is what is
 * checked: what is visible before anything is opened. */
const count = (html: string, tag: string) => (html.match(new RegExp(`<${tag}\\b`, "g")) ?? []).length;

describe("MoreMenu", () => {
  const items = (
    <>
      <MoreMenuItem>Import</MoreMenuItem>
      <MoreMenuItem>Barcode / QR labels</MoreMenuItem>
    </>
  );

  it("shows one button, and none of its actions, until opened", () => {
    const html = renderToStaticMarkup(<MoreMenu>{items}</MoreMenu>);
    expect(count(html, "button")).toBe(1);
    expect(html).toContain("More");
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).not.toContain("Import");
    expect(html).not.toContain("Barcode");
  });

  it("names a row's icon button for screen readers", () => {
    const html = renderToStaticMarkup(
      <MoreMenu variant="row" label="More for Acme">
        {items}
      </MoreMenu>,
    );
    expect(count(html, "button")).toBe(1);
    expect(html).toContain('aria-label="More for Acme"');
  });
});

describe("Fold", () => {
  const body = <input name="owner" aria-label="Owner" />;

  it("renders only its button while closed", () => {
    const html = renderToStaticMarkup(<Fold label="Filters">{body}</Fold>);
    expect(count(html, "button")).toBe(1);
    expect(html).toContain('aria-expanded="false"');
    expect(count(html, "input")).toBe(0);
  });

  it("says how many folded choices are in effect, and opens on them", () => {
    const html = renderToStaticMarkup(
      <Fold label="Filters" count={2} defaultOpen>
        {body}
      </Fold>,
    );
    expect(html).toContain("· 2");
    expect(html).toContain('aria-expanded="true"');
    expect(count(html, "input")).toBe(1);
  });

  it("shows no count when nothing is in effect", () => {
    expect(renderToStaticMarkup(<Fold label="Filters" count={0}>{body}</Fold>)).not.toContain("·");
  });
});

describe("AutoSubmitSelect", () => {
  it("is a plain form field with no button of its own", () => {
    const html = renderToStaticMarkup(
      <form>
        <AutoSubmitSelect name="status" defaultValue="new" aria-label="Status">
          <option value="new">new</option>
          <option value="won">won</option>
        </AutoSubmitSelect>
      </form>,
    );
    expect(count(html, "select")).toBe(1);
    expect(html).toContain('name="status"');
    expect(count(html, "button")).toBe(0);
    expect(html).not.toMatch(/\sdisabled(=|\s|>)/);
  });
});
