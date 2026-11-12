/**
 * PLATFORM-NAV-P0-02.3 -- what the CRM Inbox shows before anything is opened: one New
 * ticket button instead of the create form, and at most one control on a row beyond its
 * status and assignee.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InboxView } from "./inbox-view";
import type { Ticket } from "../../lib/tickets/types";

type Props = Parameters<typeof InboxView>[0];

const ticket = (overrides: Partial<Ticket>): Ticket =>
  ({
    id: "t1",
    subject: "Leaking tap",
    status: "open",
    channel_id: null,
    assigned_to: null,
    party_id: null,
    external_sender_handle: null,
    created_at: "2026-11-01T00:00:00Z",
    ...overrides,
  }) as Ticket;

const render = (tickets: Ticket[]) =>
  renderToStaticMarkup(
    <InboxView
      businessSlug="acme"
      tickets={tickets}
      channels={[] as Props["channels"]}
      employees={[] as Props["employees"]}
      createAction={async () => {}}
      updateStatusAction={async () => {}}
      assignAction={async () => {}}
      convertToProspectAction={async () => ({ success: true })}
    />,
  );

const count = (html: string, pattern: RegExp) => (html.match(pattern) ?? []).length;
const buttons = (html: string) =>
  [...html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)].map((m) => m[1]!.replace(/<[^>]+>/g, "").trim());

describe("CRM Inbox", () => {
  it("opens on the tickets, with the create form behind one New ticket button", () => {
    const html = render([]);
    expect(buttons(html)).toEqual(["New ticket"]);
    expect(html).toContain('aria-expanded="false"');
    expect(count(html, /<input\b/g)).toBe(0);
    expect(html).not.toContain("Create ticket");
  });

  it("keeps status and assignee on the row, each once per layout, with no duplicate status badge on desktop", () => {
    const html = render([ticket({})]);
    expect(count(html, /aria-label="Status for Leaking tap"/g)).toBe(2);
    expect(count(html, /aria-label="Assignee for Leaking tap"/g)).toBe(2);
    expect(html).not.toContain("lg:inline-flex");
  });

  it("folds Customer 360 and Convert to prospect into one More button when a row has both", () => {
    const html = render([ticket({ party_id: "p1", external_sender_handle: "+911234567890" })]);
    expect(count(html, /aria-label="More for Leaking tap"/g)).toBe(2);
    expect(html).not.toContain("Customer 360");
    expect(html).not.toContain("Convert to prospect");
  });

  it("shows the action itself when a row has only one", () => {
    const onlyCustomer = render([ticket({ party_id: "p1" })]);
    expect(count(onlyCustomer, /href="\/acme\/crm\/customers\/p1\?ticketId=t1"/g)).toBe(2);
    expect(onlyCustomer).not.toContain("More for");

    const onlyConvert = render([ticket({ external_sender_handle: "+911234567890" })]);
    expect(buttons(onlyConvert).filter((b) => b === "Convert to prospect")).toHaveLength(2);
    expect(onlyConvert).not.toContain("More for");
  });

  it("adds nothing to a row that has neither", () => {
    expect(buttons(render([ticket({})]))).toEqual(["New ticket"]);
  });
});
