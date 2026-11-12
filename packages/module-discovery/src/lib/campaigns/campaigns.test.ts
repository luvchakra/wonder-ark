/**
 * DISC-CAMP-P0-02.1 / 05.1: creating, changing, launching and pausing a campaign, with
 * the tables held in memory. Pinned here:
 *  - every action needs the licence and discovery.manage;
 *  - a new campaign is structure only: three email steps, no text, nobody enrolled;
 *  - Launch is refused without a verified mailbox ("Needs setup"), without text for
 *    every email step, or with nobody to write to, and enrols with counted reasons;
 *  - if the opt-out list cannot be read, nobody is enrolled;
 *  - steps change only before launch; a message may use only the listed merge fields;
 *  - the funnel is counted from the campaign's own rows.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emailHash } from "@cofounderai/core/privacy/unsubscribe-token";
import { createMemoryDb } from "../data-sources/__tests__/memory-db";

const h = vi.hoisted(() => ({
  requireModule: vi.fn(),
  requirePermission: vi.fn(),
  createClient: vi.fn(),
  createCoreClient: vi.fn(),
  getBusinessIdForWorkspace: vi.fn(),
  getWorkspace: vi.fn(),
  getProduct: vi.fn(),
  getSenderMailbox: vi.fn(),
}));

vi.mock("@cofounderai/core/licensing/queries", () => ({ requireModule: h.requireModule }));
vi.mock("@cofounderai/core/rbac/require-permission", () => ({ requirePermission: h.requirePermission }));
vi.mock("@cofounderai/core/db/server", () => ({ createClient: h.createCoreClient }));
vi.mock("@cofounderai/core/db/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("../../db/server", () => ({ createClient: h.createClient }));
vi.mock("../tenancy/queries", () => ({
  getBusinessIdForWorkspace: h.getBusinessIdForWorkspace,
  getWorkspace: h.getWorkspace,
  getProduct: h.getProduct,
}));
vi.mock("./mailbox", () => ({ getSenderMailbox: h.getSenderMailbox }));

const {
  activateCampaign,
  confirmCampaignPreview,
  createCampaign,
  enrolAudience,
  finishCampaign,
  getCampaignDetail,
  getCampaignResults,
  pauseCampaign,
  previewBlocker,
  replaceCampaignSteps,
  resumeCampaign,
  saveCampaignTemplate,
  updateCampaignSettings,
} = await import("./campaigns");

/** Confirms the preview, as "This looks right" does, then activates. */
const launchCampaign = async (id: string) => {
  await confirmCampaignPreview(id);
  return activateCampaign(id);
};

const WORKSPACE = "w1";
const BUSINESS = "b1";

let db: ReturnType<typeof createMemoryDb>;
let core: ReturnType<typeof createMemoryDb>;

function setup(seed: Record<string, Record<string, unknown>[]> = {}, coreSeed: Record<string, Record<string, unknown>[]> = {}) {
  // Tables the tests push rows into directly must exist up front.
  db = createMemoryDb({ outreach_templates: [], outreach_sends: [], messages: [], ...seed });
  core = createMemoryDb({ business_settings: [{ business_id: BUSINESS, timezone: "Asia/Kolkata" }], ...coreSeed });
  h.createClient.mockResolvedValue(Object.assign(db.client, { auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) } }));
  h.createCoreClient.mockResolvedValue(core.client);
}

const prospect = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  workspace_id: WORKSPACE,
  kind: "company",
  status: "qualified",
  outcome: "open",
  fit_score: 80,
  industry: "Plumber",
  company_name: `Company ${id}`,
  company_email: null,
  ...overrides,
});
const contact = (id: string, prospectId: string, email: string, overrides: Record<string, unknown> = {}) => ({
  id,
  workspace_id: WORKSPACE,
  prospect_id: prospectId,
  email,
  status: "active",
  email_status: null,
  source: null,
  created_at: "2026-11-01T00:00:00.000Z",
  ...overrides,
});

/** A draft campaign with its starting steps and a general text for each. */
async function draft(options: { written?: boolean } = {}) {
  const id = await createCampaign(WORKSPACE);
  if (options.written !== false) {
    for (const step of db.rows("outreach_campaign_steps")) {
      db.rows("outreach_templates").push({
        id: `t-${step.position}`,
        campaign_id: id,
        step_id: step.id,
        workspace_id: WORKSPACE,
        segment: "general",
        subject: "Hello {{company}}",
        body: "Hello from {{offering}}",
        origin: "ai_generated",
        ai_run_id: null,
      });
    }
  }
  return id;
}
const campaign = () => db.rows("outreach_campaigns")[0]!;
const enrollments = () => db.rows("outreach_enrollments");

beforeEach(() => {
  vi.clearAllMocks();
  h.getBusinessIdForWorkspace.mockResolvedValue(BUSINESS);
  h.getWorkspace.mockResolvedValue({ id: WORKSPACE, product_id: "prod-1" });
  h.getProduct.mockResolvedValue({ id: "prod-1", name: "FieldDesk", business_id: BUSINESS });
  h.getSenderMailbox.mockResolvedValue({ status: "verified", dailyLimit: 30 });
  setup({ prospects: [prospect("p1"), prospect("p2", { status: "new" })], contacts: [contact("c1", "p1", "ravi@acme.example"), contact("c2", "p2", "b@beta.example")] });
});

describe("a new campaign", () => {
  it("is a draft with three email steps, the business's timezone, and no text or enrollments", async () => {
    await createCampaign(WORKSPACE);

    expect(campaign()).toMatchObject({ workspace_id: WORKSPACE, timezone: "Asia/Kolkata", audience: { onlyQualified: true } });
    expect(String(campaign().name)).toMatch(/^FieldDesk, /);
    expect(campaign().status).toBe("draft");
    expect(db.rows("outreach_campaign_steps").map((step) => [step.position, step.channel, step.delay_days, step.purpose])).toEqual([
      [1, "email", 0, "intro"],
      [2, "email", 3, "follow_up"],
      [3, "email", 5, "last_note"],
    ]);
    expect(db.rows("outreach_templates")).toHaveLength(0);
    expect(enrollments()).toHaveLength(0);
  });

  it("includes prospects not yet marked qualified when the workspace marks none", async () => {
    setup({ prospects: [prospect("p1", { status: "new" })] });
    await createCampaign(WORKSPACE);
    expect(campaign().audience).toEqual({ onlyQualified: false });
  });

  it("needs the licence and discovery.manage", async () => {
    h.requirePermission.mockRejectedValueOnce(new Error("You don't have permission to do this (discovery.manage)."));
    await expect(createCampaign(WORKSPACE)).rejects.toThrow("discovery.manage");
    h.requireModule.mockRejectedValueOnce(new Error("Discovery is not licensed."));
    await expect(createCampaign(WORKSPACE)).rejects.toThrow("not licensed");
    expect(db.rows("outreach_campaigns")).toHaveLength(0);
  });
});

describe("Preview, then Activate (DISC-CAMP-P0-05.3)", () => {
  it("cannot be activated until its preview is confirmed", async () => {
    const id = await draft();

    expect(await activateCampaign(id)).toEqual({ status: "needs_preview", message: "Preview the campaign and confirm it looks right before activating it." });
    expect(enrollments()).toHaveLength(0);
    expect(campaign().status).toBe("draft");

    expect(await confirmCampaignPreview(id)).toEqual({ status: "saved" });
    expect(campaign().preview_confirmed_at).toEqual(expect.any(String));
    expect(campaign().preview_confirmed_by).toBe("u1");
    expect(await activateCampaign(id)).toMatchObject({ status: "activated" });
  });

  it("has nothing to confirm until every step has text and the mailbox is verified", async () => {
    const unwritten = await draft({ written: false });
    expect(await confirmCampaignPreview(unwritten)).toMatchObject({ status: "refused" });
    expect(campaign().preview_confirmed_at ?? null).toBeNull();

    setup({ prospects: [prospect("p1")], contacts: [contact("c1", "p1", "ravi@acme.example")] });
    const id = await draft();
    h.getSenderMailbox.mockResolvedValueOnce({ status: "unverified" });
    expect(await confirmCampaignPreview(id)).toEqual({ status: "needs_setup", message: "Needs setup: connect a mailbox" });
    expect(campaign().preview_confirmed_at ?? null).toBeNull();
  });

  it("needs a new confirmation to resume when the campaign was changed while paused", async () => {
    const id = await draft();
    await launchCampaign(id);
    await pauseCampaign(id);
    // What the database does when anything the preview showed changes.
    Object.assign(campaign(), { preview_confirmed_at: null, preview_confirmed_by: null });

    const refused = await resumeCampaign(id);
    expect(refused).toMatchObject({ status: "needs_preview" });
    expect(campaign().status).toBe("paused");

    expect(await confirmCampaignPreview(id)).toEqual({ status: "saved" });
    expect(await resumeCampaign(id)).toEqual({ status: "saved" });
    expect(campaign().status).toBe("active");
  });

  it("cannot be confirmed while it is running or once it is finished", async () => {
    const id = await draft();
    await launchCampaign(id);
    expect(await confirmCampaignPreview(id)).toMatchObject({ status: "refused" });
  });
});

describe("Activate", () => {
  it("is refused with Needs setup while no mailbox is verified, and enrols nobody", async () => {
    const id = await draft();
    await confirmCampaignPreview(id);
    for (const mailbox of [null, { status: "unverified" }, { status: "failed" }]) {
      h.getSenderMailbox.mockResolvedValueOnce(mailbox);
      expect(await activateCampaign(id)).toEqual({ status: "needs_setup", message: "Needs setup: connect a mailbox" });
    }
    expect(enrollments()).toHaveLength(0);
    expect(campaign().status).toBe("draft");
  });

  it("is refused until every email step has text", async () => {
    const id = await draft({ written: false });
    const outcome = await launchCampaign(id);
    expect(outcome).toMatchObject({ status: "refused" });
    expect(outcome.status === "refused" && outcome.message).toContain("step 1, 2, 3");
    expect(enrollments()).toHaveLength(0);
  });

  it("enrols the audience, records why the rest were left out, and makes the campaign active", async () => {
    const id = await draft();

    const outcome = await launchCampaign(id);

    expect(outcome).toEqual({ status: "activated", enrolled: 1, leftOut: { not_qualified: 1 } });
    expect(enrollments()).toHaveLength(1);
    expect(enrollments()[0]).toMatchObject({ campaign_id: id, prospect_id: "p1", contact_id: "c1", recipient: "contact", segment: "general", next_step_position: 1 });
    expect(enrollments()[0]!.next_due_at).toEqual(expect.any(String));
    expect(campaign()).toMatchObject({ status: "active", last_enrollment: { enrolled: 1, leftOut: { not_qualified: 1 } } });
  });

  it("uses a line of work's own text when the campaign has one", async () => {
    const id = await draft();
    const first = db.rows("outreach_campaign_steps").find((step) => step.position === 1)!;
    db.rows("outreach_templates").push({ id: "t-plumber", campaign_id: id, step_id: first.id, workspace_id: WORKSPACE, segment: "plumber", subject: "s", body: "b", origin: "ai_generated" });
    await launchCampaign(id);
    expect(enrollments()[0]!.segment).toBe("plumber");
  });

  it("is refused, and stays a draft, when nobody can be enrolled", async () => {
    setup({ prospects: [prospect("p1", { status: "disqualified" })] });
    const id = await draft();
    const outcome = await launchCampaign(id);
    expect(outcome).toMatchObject({ status: "refused" });
    expect(campaign().status).toBe("draft");
    expect(campaign().last_enrollment).toMatchObject({ enrolled: 0, leftOut: { disqualified: 1 } });
  });

  it("cannot be launched twice", async () => {
    const id = await draft();
    await launchCampaign(id);
    expect(await activateCampaign(id)).toEqual({ status: "refused", message: "This campaign was already activated." });
    expect(enrollments()).toHaveLength(1);
  });

  it("never enrols an address on the opt-out list", async () => {
    setup(
      { prospects: [prospect("p1")], contacts: [contact("c1", "p1", "ravi@acme.example")] },
      { communication_suppressions: [{ business_id: BUSINESS, email_hash: emailHash("ravi@acme.example") }] },
    );
    const id = await draft();
    expect(await launchCampaign(id)).toMatchObject({ status: "refused" });
    expect(enrollments()).toHaveLength(0);
    expect(campaign().last_enrollment).toMatchObject({ leftOut: { suppressed: 1 } });
  });

  it("enrols nobody when the opt-out list cannot be read", async () => {
    const id = await draft();
    const failing = { from: () => ({ select: () => ({ eq: async () => ({ data: null, error: { message: "permission denied" } }) }) }) };
    const detail = (await getCampaignDetail(id))!;
    await expect(enrolAudience(detail, { discovery: db.client as never, core: failing as never, businessId: BUSINESS })).rejects.toMatchObject({ message: "permission denied" });
    expect(enrollments()).toHaveLength(0);
  });

  it("needs the permission", async () => {
    const id = await draft();
    h.requirePermission.mockRejectedValueOnce(new Error("You don't have permission to do this (discovery.manage)."));
    await expect(activateCampaign(id)).rejects.toThrow("discovery.manage");
    h.requirePermission.mockRejectedValueOnce(new Error("You don't have permission to do this (discovery.manage)."));
    await expect(confirmCampaignPreview(id)).rejects.toThrow("discovery.manage");
    expect(enrollments()).toHaveLength(0);
  });
});

describe("pause, resume and finish", () => {
  it("pauses a running campaign with the reason, and resumes it only with a verified mailbox", async () => {
    const id = await draft();
    await launchCampaign(id);

    expect(await pauseCampaign(id)).toEqual({ status: "saved" });
    expect(campaign()).toMatchObject({ status: "paused", pause_reason: "Paused by a person" });

    h.getSenderMailbox.mockResolvedValueOnce({ status: "unverified" });
    expect(await resumeCampaign(id)).toEqual({ status: "needs_setup", message: "Needs setup: connect a mailbox" });
    expect(campaign().status).toBe("paused");

    expect(await resumeCampaign(id)).toEqual({ status: "saved" });
    expect(campaign().status).toBe("active");
  });

  it("does not pause a draft, and a finished campaign stays finished", async () => {
    const id = await draft();
    expect(await pauseCampaign(id)).toMatchObject({ status: "refused" });
    await launchCampaign(id);
    expect(await finishCampaign(id)).toEqual({ status: "saved" });
    expect(await resumeCampaign(id)).toMatchObject({ status: "refused" });
    expect(await updateCampaignSettings(id, { name: "x" })).toMatchObject({ status: "refused" });
    expect(await confirmCampaignPreview(id)).toMatchObject({ status: "refused" });
    expect(campaign().status).toBe("completed");
  });
});

describe("changing a campaign", () => {
  it("changes the steps only while it is a draft or paused, within the sequence rules", async () => {
    const id = await draft();
    expect(await replaceCampaignSteps(id, [{ channel: "email", delayDays: 0 }, { channel: "email", delayDays: 0 }])).toMatchObject({ status: "refused" });
    expect(await replaceCampaignSteps(id, [{ channel: "email", delayDays: 0 }, { channel: "email", delayDays: 31 }])).toMatchObject({ status: "refused" });
    expect(await replaceCampaignSteps(id, [{ channel: "call", delayDays: 0 }])).toMatchObject({ status: "refused" });
    expect(await replaceCampaignSteps(id, Array.from({ length: 6 }, () => ({ channel: "email" as const, delayDays: 3 })))).toMatchObject({ status: "refused" });
    expect(await replaceCampaignSteps(id, [{ channel: "email", delayDays: 0 }, { channel: "sms" as never, delayDays: 4 }])).toMatchObject({ status: "refused" });

    // DISC-CAMP-P0-05.4: a follow-up may come one day later.
    expect(await replaceCampaignSteps(id, [{ channel: "email", delayDays: 0 }, { channel: "email", delayDays: 1 }])).toEqual({ status: "saved" });
    expect(db.rows("outreach_campaign_steps").map((step) => [step.position, step.channel, step.delay_days, step.purpose])).toEqual([
      [1, "email", 0, "intro"],
      [2, "email", 1, "follow_up"],
    ]);

    await launchCampaign(id);
    expect(await replaceCampaignSteps(id, [{ channel: "email", delayDays: 0 }, { channel: "email", delayDays: 3 }])).toEqual({ status: "refused", message: "Pause the campaign to change its steps." });
  });

  it("DISC-CAMP-P0-06.1: a later step may be a call, a WhatsApp or a LinkedIn message, and needs its draft before the preview", async () => {
    const id = await draft();
    expect(
      await replaceCampaignSteps(id, [
        { channel: "email", delayDays: 0 },
        { channel: "call", delayDays: 2 },
        { channel: "whatsapp", delayDays: 3 },
        { channel: "linkedin", delayDays: 4 },
      ]),
    ).toEqual({ status: "saved" });
    const steps = db.rows("outreach_campaign_steps");
    expect(steps.map((step) => [step.position, step.channel, step.delay_days, step.purpose])).toEqual([
      [1, "email", 0, "intro"],
      [2, "call", 2, "call"],
      [3, "whatsapp", 3, "follow_up"],
      [4, "linkedin", 4, "last_note"],
    ]);
    // The first step stays an email: a person's step cannot open the sequence.
    expect(await replaceCampaignSteps(id, [{ channel: "whatsapp", delayDays: 0 }])).toEqual({ status: "refused", message: "The first step is an email." });

    // Only the email has text so far: the preview names the steps with none.
    const detail = { campaign: campaign() as never, steps: steps as never, templates: db.rows("outreach_templates").filter((row) => row.step_id === steps[0]!.id) as never };
    expect(previewBlocker(detail, true)).toEqual({ status: "refused", message: "Write the messages first: step 2, 3, 4 has no text yet." });
  });

  it("DISC-CAMP-P0-06.1: a person's edit of a call draft needs no subject, and may use only the merge fields", async () => {
    const id = await draft();
    await replaceCampaignSteps(id, [{ channel: "email", delayDays: 0 }, { channel: "call", delayDays: 2 }]);
    const call = db.rows("outreach_campaign_steps").find((step) => step.channel === "call")!;
    db.rows("outreach_templates").push({ id: "t-call", campaign_id: id, step_id: call.id, workspace_id: WORKSPACE, segment: "general", subject: null, body: "Old points", origin: "ai_generated" });

    expect(await saveCampaignTemplate("t-call", { subject: "", body: "Ask {{company}} how they book jobs." })).toEqual({ status: "saved" });
    expect(db.rows("outreach_templates").find((row) => row.id === "t-call")).toMatchObject({ subject: null, body: "Ask {{company}} how they book jobs.", origin: "user_modified" });
    expect(await saveCampaignTemplate("t-call", { subject: "", body: "Ask {{secret}}" })).toMatchObject({ status: "refused" });
    expect(await saveCampaignTemplate("t-call", { subject: "", body: "  " })).toEqual({ status: "refused", message: "The draft needs some text." });
  });

  it("while paused, adds a step and changes a gap, but will not remove a step that was sent to someone", async () => {
    const id = await draft();
    await launchCampaign(id);
    await pauseCampaign(id);
    const second = db.rows("outreach_campaign_steps").find((step) => step.position === 2)!;
    db.rows("outreach_sends").push({ id: "send-1", step_id: second.id, campaign_id: id, status: "sent" });

    expect(await replaceCampaignSteps(id, [{ channel: "email", delayDays: 0 }])).toEqual({ status: "refused", message: "Step 2 has already been sent to someone, so it can't be removed." });
    expect(db.rows("outreach_campaign_steps")).toHaveLength(3);

    // Step 3 has been sent to nobody: it can go, and step 2's gap can change.
    expect(await replaceCampaignSteps(id, [{ channel: "email", delayDays: 0 }, { channel: "email", delayDays: 7 }])).toEqual({ status: "saved" });
    expect(db.rows("outreach_campaign_steps").map((step) => [step.position, step.delay_days])).toEqual([[1, 0], [2, 7]]);

    expect(await replaceCampaignSteps(id, [{ channel: "email", delayDays: 0 }, { channel: "email", delayDays: 7 }, { channel: "email", delayDays: 2 }])).toEqual({ status: "saved" });
    expect(db.rows("outreach_campaign_steps")).toHaveLength(3);
  });

  it("saves a person's edit, labels it, and refuses a field outside the list", async () => {
    await draft();
    expect(await saveCampaignTemplate("t-1", { subject: "Hi {{company}}", body: "Hello {{ssn}}" })).toMatchObject({ status: "refused" });
    expect(db.rows("outreach_templates")[0]).toMatchObject({ body: "Hello from {{offering}}", origin: "ai_generated" });

    expect(await saveCampaignTemplate("t-1", { subject: " Hi  {{company}} ", body: "Hello {{first_name}}" })).toEqual({ status: "saved" });
    expect(db.rows("outreach_templates")[0]).toMatchObject({ subject: "Hi {{company}}", body: "Hello {{first_name}}", origin: "user_modified" });
  });

  it("does not change a running campaign's messages, schedule or audience: pause first", async () => {
    const id = await draft();
    await launchCampaign(id);

    expect(await saveCampaignTemplate("t-1", { subject: "Changed", body: "Changed text" })).toEqual({ status: "refused", message: "Pause the campaign to change its messages." });
    expect(await updateCampaignSettings(id, { sendDays: [1] })).toMatchObject({ status: "refused" });
    expect(await updateCampaignSettings(id, { dailyLimit: 5 })).toMatchObject({ status: "refused" });
    expect(await updateCampaignSettings(id, { audience: { onlyQualified: false } })).toMatchObject({ status: "refused" });
    expect(db.rows("outreach_templates")[0]).toMatchObject({ subject: "Hello {{company}}" });
    // The name is not part of what is sent.
    expect(await updateCampaignSettings(id, { name: "Renamed" })).toEqual({ status: "saved" });

    await pauseCampaign(id);
    expect(await saveCampaignTemplate("t-1", { subject: "Changed", body: "Changed text" })).toEqual({ status: "saved" });
    expect(await updateCampaignSettings(id, { sendDays: [1] })).toEqual({ status: "saved" });
  });

  it("holds a campaign's own emails a day between 1 and the mailbox's limit", async () => {
    const id = await draft();
    expect(await updateCampaignSettings(id, { dailyLimit: 31 })).toMatchObject({ status: "refused" });
    expect(await updateCampaignSettings(id, { dailyLimit: 0 })).toMatchObject({ status: "refused" });
    expect(await updateCampaignSettings(id, { dailyLimit: 10 })).toEqual({ status: "saved" });
    expect(campaign().daily_limit).toBe(10);
    expect(await updateCampaignSettings(id, { dailyLimit: null })).toEqual({ status: "saved" });
    expect(campaign().daily_limit).toBeNull();
  });

  it("holds the audience and sending hours to valid values", async () => {
    const id = await draft();
    expect(await updateCampaignSettings(id, { sendFromHour: 18, sendToHour: 9 })).toMatchObject({ status: "refused" });
    expect(await updateCampaignSettings(id, { sendDays: [0, 9] })).toMatchObject({ status: "refused" });
    expect(await updateCampaignSettings(id, { audience: { linesOfWork: [" Plumber "], minFitScore: 250, onlyQualified: false }, sendDays: [6, 1, 1], autoEnroll: true })).toEqual({ status: "saved" });
    expect(campaign()).toMatchObject({ audience: { linesOfWork: ["plumber"], minFitScore: 100, onlyQualified: false }, send_days: [1, 6], auto_enroll: true });
  });
});

describe("results", () => {
  it("counts the funnel from the campaign's own rows", async () => {
    const id = await draft();
    await launchCampaign(id);
    const enrollment = enrollments()[0]!;
    db.rows("outreach_sends").push(
      { enrollment_id: enrollment.id, campaign_id: id, status: "sent", bounced_at: null },
      { enrollment_id: enrollment.id, campaign_id: id, status: "sent", bounced_at: "2026-11-13T00:00:00Z" },
      { enrollment_id: enrollment.id, campaign_id: id, status: "skipped", bounced_at: null },
    );
    db.rows("messages").push({ prospect_id: "p1", direction: "inbound", classification: "interested", created_at: "2999-01-01T00:00:00Z" });
    Object.assign(enrollment, { status: "replied" });

    expect(await getCampaignResults(id)).toMatchObject({ enrolled: 1, sent: 2, skipped: 1, failed: 0, bounced: 1, replied: 1, interested: 1, won: 0, inProgress: 0 });
    expect((await getCampaignResults(id)).rows[0]).toMatchObject({ company: "Company p1", status: "replied", stepsSent: 2 });
  });

  it("DISC-CAMP-P0-06.1: counts a step a person did apart from emails sent and steps skipped", async () => {
    const id = await draft();
    await replaceCampaignSteps(id, [{ channel: "email", delayDays: 0 }, { channel: "call", delayDays: 2 }, { channel: "whatsapp", delayDays: 2 }, { channel: "linkedin", delayDays: 2 }]);
    const byChannel = (channel: string) => db.rows("outreach_campaign_steps").find((step) => step.channel === channel);
    const [email, call, whatsapp, linkedin] = ["email", "call", "whatsapp", "linkedin"].map(byChannel);
    for (const step of [call, whatsapp, linkedin]) {
      db.rows("outreach_templates").push({ id: `t-${step!.id}`, campaign_id: id, step_id: step!.id, workspace_id: WORKSPACE, segment: "general", subject: null, body: "Draft", origin: "ai_generated" });
    }
    await launchCampaign(id);
    const enrollment = enrollments()[0]!;
    db.rows("outreach_sends").push(
      { enrollment_id: enrollment.id, step_id: email!.id, campaign_id: id, status: "sent", reason: null, bounced_at: null },
      { enrollment_id: enrollment.id, step_id: call!.id, campaign_id: id, status: "skipped", reason: "task_done", bounced_at: null },
      { enrollment_id: enrollment.id, step_id: whatsapp!.id, campaign_id: id, status: "skipped", reason: "no_phone", bounced_at: null },
      { enrollment_id: enrollment.id, step_id: linkedin!.id, campaign_id: id, status: "skipped", reason: "task_not_reached", bounced_at: null },
    );

    const results = await getCampaignResults(id);
    // One email was sent. The call and the LinkedIn message are a person's, not sent and not skipped.
    expect(results).toMatchObject({ sent: 1, skipped: 1, tasksDone: 1, tasksNotReached: 1 });
    expect(results.rows[0]).toMatchObject({
      stepsSent: 1,
      tasks: [{ position: 2, channel: "call", outcome: "done" }, { position: 4, channel: "linkedin", outcome: "not_reached" }],
      passedOver: [{ position: 3, reason: "no_phone" }],
    });
  });
});
