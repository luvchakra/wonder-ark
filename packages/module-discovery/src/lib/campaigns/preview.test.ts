/**
 * DISC-CAMP-P0-05.3: the preview and "Send me a test", with the tables held in memory
 * and the SMTP library injected. Pinned here:
 *  - the preview shows the real email for a real prospect of each line of work, with
 *    their own values, the From line and the unsubscribe footer, and steps through more
 *    prospects and the later steps;
 *  - a prospect whose email would be skipped is shown as skipped with the reason, never
 *    with a placeholder filled in;
 *  - the audience and the reasons for those left out are the ones activation would
 *    enrol by;
 *  - a test goes to the mailbox's own address only, with a [Test] subject, writes no row
 *    for the prospect, is limited per hour, is audited, and reports what happened.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryDb } from "../data-sources/__tests__/memory-db";
import type { SmtpTransportFactory } from "./smtp";

const h = vi.hoisted(() => ({
  requireModule: vi.fn(),
  requirePermission: vi.fn(),
  createClient: vi.fn(),
  createCoreClient: vi.fn(),
  getBusinessIdForWorkspace: vi.fn(),
  getSenderMailbox: vi.fn(),
  loadMailboxForSending: vi.fn(),
  prepareOutreachEmail: vi.fn(),
  writeAuditLog: vi.fn(),
}));
vi.mock("@cofounderai/core/licensing/queries", () => ({ requireModule: h.requireModule }));
vi.mock("@cofounderai/core/rbac/require-permission", () => ({ requirePermission: h.requirePermission }));
vi.mock("@cofounderai/core/db/server", () => ({ createClient: h.createCoreClient }));
vi.mock("@cofounderai/core/db/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@cofounderai/core/audit/mutations", () => ({ writeAuditLog: h.writeAuditLog }));
vi.mock("@cofounderai/core/privacy/suppression", () => ({ prepareOutreachEmail: h.prepareOutreachEmail }));
vi.mock("../../db/server", () => ({ createClient: h.createClient }));
vi.mock("../tenancy/queries", () => ({
  getBusinessIdForWorkspace: h.getBusinessIdForWorkspace,
  getWorkspace: vi.fn(async (id: string) => ({ id, product_id: "prod" })),
  getProduct: vi.fn(async () => ({ id: "prod", name: "FieldDesk", business_id: "b1", website: "https://fielddesk.example" })),
  getBusiness: vi.fn(async () => ({ id: "b1", name: "Acme Software", website: null })),
}));
vi.mock("./mailbox", () => ({ getSenderMailbox: h.getSenderMailbox, loadMailboxForSending: h.loadMailboxForSending, MAILBOX_DAILY_LIMIT_MAX: 200 }));

const { PREVIEW_PROSPECTS, TEST_SENDS_PER_HOUR, buildCampaignPreview, sendCampaignTest } = await import("./preview");

const W = "w1";
const NOW = new Date("2026-11-12T10:00:00.000Z");
const publicLookup = async () => [{ address: "142.250.183.109", family: 4 }];
const mailboxView = { id: "mb1", fromName: "Asha", fromEmail: "asha@acme.example", status: "verified", dailyLimit: 30, imapHost: null, lastError: null };
const sending = { id: "mb1", fromName: "Asha", fromEmail: "asha@acme.example", dailyLimit: 30, connection: { host: "smtp.acme.example", port: 587, username: "asha@acme.example", password: "secret-w1" }, imap: null };

let db: ReturnType<typeof createMemoryDb>;
let sendMail: ReturnType<typeof vi.fn<(message: Record<string, unknown>) => Promise<unknown>>>;

const prospect = (id: string, overrides: Record<string, unknown> = {}) => ({ id, workspace_id: W, kind: "company", status: "qualified", outcome: "open", fit_score: 80, industry: "Plumber", location: "Pune, Maharashtra", company_name: `Company ${id}`, company_email: null, ...overrides });
const contact = (id: string, prospectId: string, overrides: Record<string, unknown> = {}) => ({ id, workspace_id: W, prospect_id: prospectId, email: `${id}@prospect.example`, status: "active", email_status: null, source: null, first_name: null, created_at: "2026-11-01T00:00:00Z", ...overrides });
const steps = [
  { id: "s1", campaign_id: "c1", workspace_id: W, position: 1, channel: "email", delay_days: 0, purpose: "intro" },
  { id: "s2", campaign_id: "c1", workspace_id: W, position: 2, channel: "email", delay_days: 3, purpose: "follow_up" },
];
const template = (stepId: string, segment: string, body: string) => ({ id: `${stepId}-${segment}`, campaign_id: "c1", step_id: stepId, workspace_id: W, segment, subject: stepId === "s1" ? "An idea for {{company}}" : "Following up, {{company}}", body, origin: "ai_generated" });

function setup(tables: Record<string, Record<string, unknown>[]> = {}, campaign: Record<string, unknown> = {}) {
  db = createMemoryDb({
    outreach_campaigns: [{ id: "c1", workspace_id: W, name: "c1", status: "draft", audience: {}, include_unverified: false, send_days: [1, 2, 3, 4, 5], send_from_hour: 9, send_to_hour: 18, timezone: "Asia/Kolkata", daily_limit: null, preview_confirmed_at: null, test_sent_at: [], ...campaign }],
    outreach_campaign_steps: steps,
    outreach_templates: [
      template("s1", "general", "Hello {{company}} in {{city}}.\n\n{{sender_name}}, {{business_name}}"),
      template("s2", "general", "Still interested, {{company}}?"),
      template("s1", "plumber", "Hello {{company}}, plumbers in {{city}} use {{offering}}."),
      template("s2", "plumber", "Any thoughts, {{company}}?"),
    ],
    prospects: [prospect("p1"), prospect("p2", { location: null }), prospect("p3", { industry: "Dentist" }), prospect("p4", { status: "new" })],
    contacts: [contact("k1", "p1"), contact("k2", "p2"), contact("k3", "p3"), contact("k4", "p4")],
    outreach_enrollments: [],
    outreach_sends: [],
    messages: [],
    ...tables,
  });
  h.createClient.mockResolvedValue(Object.assign(db.client, { auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) } }));
  h.createCoreClient.mockResolvedValue(createMemoryDb({ communication_suppressions: [] }).client);
}
const smtp = () => ({ lookup: publicLookup, createTransport: (() => ({ sendMail, close: vi.fn() })) as unknown as SmtpTransportFactory });
const ready = async (choice?: { step?: number; index?: number }) => {
  const result = await buildCampaignPreview("c1", choice);
  if (result.status !== "ready") throw new Error(`not ready: ${result.message}`);
  return result.preview;
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  sendMail = vi.fn(async (message: Record<string, unknown>) => ({ messageId: "<test@sent>", accepted: [message.to] }));
  h.getBusinessIdForWorkspace.mockResolvedValue("b1");
  h.getSenderMailbox.mockResolvedValue(mailboxView);
  h.loadMailboxForSending.mockResolvedValue(sending);
  h.prepareOutreachEmail.mockImplementation(async (_business: string, to: string) => ({ suppressed: false, unsubscribeUrl: `https://app.example/api/unsubscribe?t=${to}`, headers: { "List-Unsubscribe": "<x>" } }));
  setup();
});

describe("the preview", () => {
  it("shows the real first email for a real prospect of each line of work, as it will be sent", async () => {
    const preview = await ready();

    expect(preview).toMatchObject({ audience: 3, alreadyEnrolled: false, leftOut: { not_qualified: 1 }, step: 1, index: 0, confirmed: false });
    expect(preview.lines.map((line) => [line.segment, line.prospects])).toEqual([["general", 1], ["plumber", 2]]);
    expect(preview.lines[1]!.email).toEqual({
      ok: true,
      kind: "email",
      prospectId: "p1",
      company: "Company p1",
      from: "Asha <asha@acme.example>",
      to: "k1@prospect.example",
      subject: "An idea for Company p1",
      text: "Hello Company p1, plumbers in Pune use FieldDesk.\n\n--\nUnsubscribe: https://app.example/api/unsubscribe?t=k1@prospect.example",
    });
    // The dentist has no text of its own, so it gets the general one, with its own values.
    expect(preview.lines[0]!.email).toMatchObject({ ok: true, prospectId: "p3", subject: "An idea for Company p3" });
    expect(JSON.stringify(preview)).not.toContain("{{");
  });

  it("says the schedule in words, from the campaign's own settings", async () => {
    expect((await ready()).schedule).toEqual([
      "Emails go out on Mon, Tue, Wed, Thu, Fri, between 9:00 and 18:00 (Asia/Kolkata), at the daily check at 11:35.",
      "At most 30 emails a day, the mailbox's limit, shared by all of this offering's campaigns.",
      "2 emails to each prospect: step 2 3 days after step 1.",
    ]);
    setup({}, { daily_limit: 10 });
    expect((await ready()).schedule[1]).toBe("At most 10 emails a day for this campaign. The mailbox allows 30 a day across all of this offering's campaigns.");
  });

  it("steps through the later steps and the next prospect", async () => {
    const second = await ready({ step: 2 });
    expect(second.step).toBe(2);
    expect(second.lines[1]!.email).toMatchObject({ ok: true, subject: "Following up, Company p1" });

    const next = await ready({ index: 1 });
    expect(next).toMatchObject({ index: 1, lastIndex: 1 });
    // The general line has one prospect, so there is no second one to show there.
    expect(next.lines[0]!.email).toBeNull();
    expect(next.lines[1]!.email).toMatchObject({ prospectId: "p2" });
    // A position past the last one is held to the last.
    expect((await ready({ index: 99 })).index).toBe(1);
  });

  it("shows a prospect whose email would be skipped as skipped, with the reason, never a filled-in placeholder", async () => {
    const preview = await ready({ index: 1 });
    expect(preview.lines[1]!.email).toEqual({
      ok: false,
      prospectId: "p2",
      company: "Company p2",
      reason: "Not sent: this prospect has no value for the first part of the prospect's location",
    });
  });

  describe("DISC-CAMP-P0-06.1: a step a person does", () => {
    const withCall = () =>
      setup({
        outreach_campaign_steps: [...steps, { id: "s3", campaign_id: "c1", workspace_id: W, position: 3, channel: "call", delay_days: 2, purpose: "call" }],
        outreach_templates: [
          template("s1", "general", "Hello {{company}}."),
          template("s2", "general", "Still interested, {{company}}?"),
          { ...template("s3", "general", "Say you emailed {{company}} about {{offering}}. Ask how they book jobs in {{city}}."), subject: null, origin: "user_modified" },
        ],
        prospects: [prospect("p1", { phone: "+91 98765 43210" }), prospect("p2", { phone: null })],
        contacts: [contact("k1", "p1"), contact("k2", "p2")],
      });

    it("shows who would get the task and the draft for a real prospect, as a task and not as an email", async () => {
      withCall();
      const preview = await ready({ step: 3 });
      expect(preview.steps.map((step) => [step.position, step.channel])).toEqual([[1, "email"], [2, "email"], [3, "call"]]);
      expect(preview.lines[0]!.email).toEqual({
        ok: true,
        kind: "task",
        channel: "call",
        prospectId: "p1",
        company: "Company p1",
        detail: { text: "+91 98765 43210", href: "tel:+919876543210" },
        text: "Say you emailed Company p1 about FieldDesk. Ask how they book jobs in Pune.",
        origin: "user_modified",
      });
      expect(preview.schedule[2]).toBe(
        "3 steps for each prospect: step 2 (an email) 3 days after step 1, step 3 (a call for you to make) 2 days after step 2. WonderArk sends the emails. A step for you appears on the Today list when it is due; nothing is sent or dialled for it, and the steps after it wait until you mark it done.",
      );
    });

    it("shows a prospect with no phone number as passed over, with the reason, never with a blank", async () => {
      withCall();
      expect((await ready({ step: 3, index: 1 })).lines[0]!.email).toEqual({ ok: false, prospectId: "p2", company: "Company p2", reason: "No phone number" });
    });

    it("has nothing to send as a test, and sends nothing", async () => {
      withCall();
      expect(await sendCampaignTest("c1", { segment: "general", step: 3 }, smtp(), NOW)).toEqual({
        status: "refused",
        message: "That step is for a person to do, so there is nothing to send as a test.",
      });
      expect(sendMail).not.toHaveBeenCalled();
    });

    it("cannot be previewed until the step has its draft", async () => {
      withCall();
      db.rows("outreach_templates").pop();
      expect(await buildCampaignPreview("c1")).toEqual({ status: "refused", message: "Write the messages first: step 3 has no text yet." });
    });
  });

  it("shows an address on the opt-out list as one that would not be written to", async () => {
    // Enrolled by an earlier preview, suppressed since.
    setup({ outreach_enrollments: [{ id: "e1", campaign_id: "c1", workspace_id: W, prospect_id: "p1", contact_id: "k1", recipient: "contact", segment: "plumber", status: "active", created_at: "2026-11-10T00:00:00Z" }] }, { status: "paused" });
    h.prepareOutreachEmail.mockResolvedValue({ suppressed: true });
    const preview = await ready();
    expect(preview).toMatchObject({ audience: 1, alreadyEnrolled: true });
    expect(preview.lines[0]!.email).toMatchObject({ ok: false, reason: "Asked not to be emailed" });
  });

  it("caps how many prospects of a line can be stepped through", async () => {
    setup({
      prospects: Array.from({ length: 9 }, (_, i) => prospect(`p${i}`)),
      contacts: Array.from({ length: 9 }, (_, i) => contact(`k${i}`, `p${i}`)),
    });
    expect((await ready()).lastIndex).toBe(PREVIEW_PROSPECTS - 1);
  });

  it("is refused until there is something complete to preview", async () => {
    h.getSenderMailbox.mockResolvedValueOnce({ ...mailboxView, status: "unverified" });
    expect(await buildCampaignPreview("c1")).toEqual({ status: "needs_setup", message: "Needs setup: connect a mailbox" });
    setup({ outreach_templates: [] });
    expect(await buildCampaignPreview("c1")).toMatchObject({ status: "refused" });
    setup({}, { status: "active" });
    expect(await buildCampaignPreview("c1")).toMatchObject({ status: "refused" });
  });

  it("needs the licence and discovery.manage", async () => {
    h.requirePermission.mockRejectedValueOnce(new Error("You don't have permission to do this (discovery.manage)."));
    await expect(buildCampaignPreview("c1")).rejects.toThrow("discovery.manage");
  });
});

describe("Send me a test", () => {
  it("sends the previewed email to the mailbox's own address only, marked as a test, and writes nothing for the prospect", async () => {
    const outcome = await sendCampaignTest("c1", { segment: "plumber" }, smtp(), NOW);

    expect(outcome).toEqual({ status: "sent", to: "asha@acme.example" });
    expect(sendMail).toHaveBeenCalledTimes(1);
    const message = sendMail.mock.calls[0]![0];
    expect(message).toMatchObject({ to: "asha@acme.example", subject: "[Test] An idea for Company p1", from: { name: "Asha", address: "asha@acme.example" } });
    // The test carries the mailbox's own unsubscribe link, not the prospect's.
    expect(String(message.text)).toContain("Hello Company p1, plumbers in Pune use FieldDesk.");
    expect(String(message.text)).toContain("unsubscribe?t=asha@acme.example");
    expect(JSON.stringify(sendMail.mock.calls)).not.toContain("k1@prospect.example");
    for (const table of ["outreach_enrollments", "outreach_sends", "messages"]) expect(db.rows(table)).toHaveLength(0);
    expect(h.writeAuditLog).toHaveBeenCalledWith({
      businessId: "b1",
      action: "discovery.campaign.test_sent",
      entityType: "discovery_outreach_campaign",
      entityId: "c1",
      after: { outcome: "sent", step: 1, prospectId: "p1" },
    });
    expect(JSON.stringify(h.writeAuditLog.mock.calls)).not.toMatch(/@|Hello/);
  });

  it("takes no address: whatever is asked, the recipient is the mailbox", async () => {
    await sendCampaignTest("c1", { segment: "plumber", to: "victim@elsewhere.example" } as never, smtp(), NOW);
    expect(sendMail.mock.calls[0]![0]).toMatchObject({ to: "asha@acme.example" });
  });

  it("is limited to a few an hour per campaign, and the limit holds for failures too", async () => {
    sendMail.mockRejectedValue(Object.assign(new Error("550"), { code: "EENVELOPE", responseCode: 550 }));
    for (let i = 0; i < TEST_SENDS_PER_HOUR; i += 1) {
      expect(await sendCampaignTest("c1", { segment: "plumber" }, smtp(), new Date(NOW.getTime() + i * 1000))).toMatchObject({ status: "failed" });
    }
    const refused = await sendCampaignTest("c1", { segment: "plumber" }, smtp(), new Date(NOW.getTime() + 60_000));
    expect(refused).toEqual({ status: "refused", message: "5 tests have been sent for this campaign in the last hour. Try again later." });
    expect(sendMail).toHaveBeenCalledTimes(TEST_SENDS_PER_HOUR);

    // An hour on, it is allowed again.
    sendMail.mockResolvedValue({ messageId: "<t@sent>" });
    expect(await sendCampaignTest("c1", { segment: "plumber" }, smtp(), new Date(NOW.getTime() + 61 * 60_000))).toMatchObject({ status: "sent" });
  });

  it.each([
    ["the mail server refuses it", Object.assign(new Error("535 secret-w1"), { code: "EAUTH", responseCode: 535 }), "failed", "sign-in"],
    ["the outcome is not known", Object.assign(new Error("Timeout"), { code: "ETIMEDOUT", timeoutType: "SOCKET_TIMEOUT" }), "unknown", "Outcome unknown"],
  ])("says so when %s, in fixed words", async (_label, error, status, words) => {
    sendMail.mockRejectedValue(error);
    const outcome = await sendCampaignTest("c1", { segment: "plumber" }, smtp(), NOW);
    expect(outcome.status).toBe(status);
    expect(outcome.status !== "sent" && outcome.message).toContain(words);
    expect(JSON.stringify([outcome, h.writeAuditLog.mock.calls])).not.toContain("secret-w1");
    expect(h.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ after: expect.objectContaining({ outcome: status }) }));
  });

  it("does not send a test of an email that would be skipped, or for a line with no prospect there", async () => {
    expect(await sendCampaignTest("c1", { segment: "plumber", index: 1 }, smtp(), NOW)).toMatchObject({ status: "refused" });
    expect(await sendCampaignTest("c1", { segment: "general", index: 1 }, smtp(), NOW)).toMatchObject({ status: "refused" });
    expect(await sendCampaignTest("c1", { segment: "no-such-line" }, smtp(), NOW)).toMatchObject({ status: "refused" });
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("needs a verified mailbox and the permission", async () => {
    h.loadMailboxForSending.mockResolvedValueOnce(null);
    expect(await sendCampaignTest("c1", { segment: "plumber" }, smtp(), NOW)).toEqual({ status: "refused", message: "Needs setup: connect a mailbox" });
    h.requirePermission.mockRejectedValueOnce(new Error("You don't have permission to do this (discovery.manage)."));
    await expect(sendCampaignTest("c1", { segment: "plumber" }, smtp(), NOW)).rejects.toThrow("discovery.manage");
    expect(sendMail).not.toHaveBeenCalled();
  });
});
