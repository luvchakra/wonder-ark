/**
 * PLATFORM-NAV-P0-02.4 -- the Finance pages simplified under CLAUDE.md's "Minimal UI":
 * the dashboard's GST snapshot without its four menu-duplicating buttons, and GST Filing
 * with one line of help per tab and no dead download button.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ComplianceDashboardView } from "./dashboard/compliance-dashboard-view";
import { GstFilingView } from "./filing/gst-filing-view";

type FilingProps = Parameters<typeof GstFilingView>[0];

const count = (html: string, pattern: RegExp) => (html.match(pattern) ?? []).length;
const buttons = (html: string) =>
  [...html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)].map((m) => m[1]!.replace(/<[^>]+>/g, "").trim());

describe("Finance dashboard, GST snapshot", () => {
  const data = {
    gstin: "27ABCDE1234F1Z5",
    period: "2026-11",
    payableThisMonth: 100,
    collectedThisMonth: 250,
    cgstCollected: 100,
    sgstCollected: 100,
    igstCollected: 50,
    einvoicesThisMonth: 3,
    riskCount: 0,
    ewayBillConfigured: false,
    einvoiceConfigured: true,
  };

  it("has nothing to press once the GST profile is set up", () => {
    const html = renderToStaticMarkup(<ComplianceDashboardView businessId="b1" data={data} />);
    // Was four buttons: GST Profile, e-Way Bill, e-Invoicing, GST Filing.
    expect(count(html, /<a\b/g)).toBe(0);
    expect(buttons(html)).toEqual([]);
    expect(html).toContain("GSTIN 27ABCDE1234F1Z5");
  });

  it("links a missing GST profile to the page that sets it up, and nothing else", () => {
    const html = renderToStaticMarkup(<ComplianceDashboardView businessId="b1" data={{ ...data, gstin: null }} />);
    expect(count(html, /<a\b/g)).toBe(1);
    expect(html).toMatch(/<a\b[^>]*href="\/dashboard\/businesses\/b1\/gst\/profile"[^>]*>[\s\S]*GST profile not set up/);
  });

  it("still says which GSP credentials are set up", () => {
    const html = renderToStaticMarkup(<ComplianceDashboardView businessId="b1" data={data} />);
    expect(html).toContain("Configured");
    expect(html).toContain("Not set up");
  });
});

describe("GST Filing", () => {
  const emptyPurchases = {
    poCount: 0,
    poIds: [],
    taxableValue: 0,
    cgst: 0,
    sgst: 0,
    igst: 0,
    totalTax: 0,
    bySupplier: [],
    byHsn: [],
    csvRows: [],
  } as unknown as FilingProps["purchaseRegister"];
  const emptySales = {
    invoiceCount: 0,
    taxableValue: 0,
    cgst: 0,
    sgst: 0,
    igst: 0,
    totalTax: 0,
    netTax: 0,
    netTaxableValue: 0,
    missingGstinCount: 0,
    invalidGstinCount: 0,
    b2b: [],
    b2c: [],
    byHsn: [],
    creditNotes: [],
  } as unknown as FilingProps["salesRegister"];
  const render = (purchaseRegister = emptyPurchases) =>
    renderToStaticMarkup(
      <GstFilingView
        businessName="Acme"
        period="2026-11"
        gstin="27ABCDE1234F1Z5"
        gstRegistrationType="regular"
        purchaseRegister={purchaseRegister}
        salesRegister={emptySales}
      />,
    );

  it("gives the open tab one line of help, not a boxed paragraph", () => {
    const html = render();
    expect(html).toContain("reconcile it against GSTR-2B and enter it in GSTR-3B");
    expect(html).not.toContain("This covers the");
    expect(html).not.toContain("bg-muted/30 px-4 py-3");
  });

  it("offers no download for a period with nothing in it", () => {
    const html = render();
    // Only the two tabs are left to press.
    expect(buttons(html)).toEqual(["Inward (Purchases)", "Outward (Sales)"]);
    expect(html).toContain("No purchase orders in this period yet.");
  });

  it("offers the purchase register download once the period has purchases", () => {
    const withRows = {
      ...emptyPurchases,
      poCount: 1,
      csvRows: [{ po_number: "PO-1" }],
    } as unknown as FilingProps["purchaseRegister"];
    const html = render(withRows);
    expect(buttons(html)).toContain("Export purchase register (CSV)");
    expect(html).not.toMatch(/<button\b[^>]*\sdisabled=""/);
  });
});
