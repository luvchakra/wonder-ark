/**
 * DISC-CAMP-P0-05.1 / 05.2: what the Campaigns pages render. Pins that the copy says
 * what the code does (CLAUDE.md, AI rule 7), that the mailbox form never carries a
 * password back, that every text shows where it came from, that the funnel shows only
 * counted rows, and the control counts ("Minimal UI").
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

const { CampaignList, CampaignResultsView, MailboxForm, StepList, TemplateList, launchLines, leftOutText } = await import("./campaign-parts");
const { dailyCheckIn } = await import("../../lib/campaigns/types");

function controls(html: string): number {
  const all = html.match(/<(input|select|textarea|button|a|summary)\b/g) ?? [];
  const hidden = html.match(/<input[^>]*type="hidden"/g) ?? [];
  return all.length - hidden.length;
}
const text = (html: string) =>
  html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ").replace(/ ([.,;:])/g, "$1").trim();

const campaign = {
  id: "c1",
  workspace_id: "w1",
  name: "FieldDesk, 12 Nov 2026",
  status: "draft" as const,
  pause_reason: null,
  audience: {},
  send_days: [1, 2, 3, 4, 5],
  send_from_hour: 9,
  send_to_hour: 18,
  timezone: "Asia/Kolkata",
  auto_enroll: false,
  personal_opening: false,
  include_unverified: false,
  last_enrollment: null,
  launched_at: null,
  created_at: "2026-11-12T00:00:00Z",
};
const steps = [
  { id: "s1", campaign_id: "c1", workspace_id: "w1", position: 1, channel: "email" as const, delay_days: 0, purpose: "intro" as const },
  { id: "s2", campaign_id: "c1", workspace_id: "w1", position: 2, channel: "email" as const, delay_days: 3, purpose: "follow_up" as const },
];
const mailbox = {
  id: "mb1",
  fromName: "Asha",
  fromEmail: "asha@acme.example",
  smtpHost: "smtp.acme.example",
  smtpPort: 587,
  username: "asha@acme.example",
  imapHost: null,
  status: "verified" as const,
  lastError: null,
  verifiedAt: "2026-11-12T08:00:00Z",
  dailyLimit: 30,
};
const noop = async () => null;

describe("the campaign list", () => {
  it("shows each campaign's status and counts, with one link per campaign", () => {
    const html = renderToStaticMarkup(
      <CampaignList
        basePath="/acme/discovery/offerings/p1/campaigns"
        campaigns={[
          { ...campaign, status: "active", enrolled: 12, sent: 7, replied: 2 },
          { ...campaign, id: "c2", name: "Second", status: "paused", pause_reason: "Paused by a person", enrolled: 0, sent: 0, replied: 0 },
        ]}
      />,
    );
    expect(text(html)).toBe("FieldDesk, 12 Nov 2026 Running Enrolled 12 Sent 7 Replied 2 Second Paused by a person Paused Enrolled 0 Sent 0 Replied 0");
    expect(controls(html)).toBe(2);
    expect(html).toContain('href="/acme/discovery/offerings/p1/campaigns/c1"');
  });
});

describe("Sending from", () => {
  it("needs only the address and the password, with one action and the servers folded away", () => {
    const html = renderToStaticMarkup(<MailboxForm mailbox={null} action={noop} defaultLimit={30} />);
    // Two fields, the fold and Connect.
    expect(controls(html)).toBe(4);
    expect(html.match(/<input\b/g)).toHaveLength(2);
    expect(html).toContain('name="fromEmail"');
    expect(html).not.toContain('name="smtpHost"');
    expect(text(html)).toContain("Server settings");
    expect(text(html)).toMatch(/Connect$/);
    expect(text(html)).toContain("Connect saves these and sends one test email to your own address.");
  });

  it("has one action, shows the mailbox's state, and never puts a password in the form", () => {
    const html = renderToStaticMarkup(<MailboxForm mailbox={mailbox} action={noop} defaultLimit={30} />);
    expect(text(html)).toContain("Verified on 12 Nov 2026. Emails go out from asha@acme.example.");
    expect(text(html)).toContain("Your mail provider's own terms apply");
    expect(html.match(/type="submit"/g)).toHaveLength(1);
    const password = html.match(/<input[^>]*name="password"[^>]*>/)![0];
    expect(password).toContain('type="password"');
    expect(password).not.toContain("value=");
  });

  it("says Needs setup when there is no mailbox, and why when the last test failed", () => {
    expect(text(renderToStaticMarkup(<MailboxForm mailbox={null} action={noop} defaultLimit={30} />))).toContain("Needs setup: no mailbox is connected.");
    const failed = renderToStaticMarkup(<MailboxForm mailbox={{ ...mailbox, status: "failed", lastError: "The mail server refused the sign-in." }} action={noop} defaultLimit={30} />);
    expect(text(failed)).toContain("The last test failed: The mail server refused the sign-in.");
    expect(text(renderToStaticMarkup(<MailboxForm mailbox={{ ...mailbox, status: "unverified" }} action={noop} defaultLimit={30} />))).toContain("Not verified yet.");
    const unreadable = renderToStaticMarkup(<MailboxForm mailbox={{ ...mailbox, lastError: "Replies couldn't be read, so nothing was sent. The mailbox couldn't be read." }} action={noop} defaultLimit={30} />);
    expect(text(unreadable)).toContain("Replies couldn't be read, so nothing was sent.");
  });
});

describe("steps and messages", () => {
  it("lists the sequence as it will run", () => {
    expect(text(renderToStaticMarkup(<StepList steps={steps} />))).toBe("1. Introduction email, sent first 2. Follow-up email, 3 days after step 1");
  });

  const templates = [
    { id: "t1", campaign_id: "c1", step_id: "s1", workspace_id: "w1", segment: "plumber", subject: "For {{company}}", body: "Hello <b>there</b>", origin: "ai_generated" as const, ai_run_id: null },
    { id: "t0", campaign_id: "c1", step_id: "s1", workspace_id: "w1", segment: "general", subject: "Hi", body: "General text", origin: "user_modified" as const, ai_run_id: null },
  ];

  it("labels every text with where it came from, general first, and renders it as text", () => {
    const html = renderToStaticMarkup(<TemplateList steps={steps} templates={templates} editable={false} saveAction={() => noop} />);
    expect(text(html)).toBe(
      "Step 1: Introduction Everyone else AI-generated, edited by you Subject: Hi General text Line of work: plumber AI-generated Subject: For {{company}} Hello &lt;b&gt;there&lt;/b&gt; Step 2: Follow-up No text yet.",
    );
    expect(html).not.toContain("<b>there</b>");
    expect(controls(html)).toBe(0);
  });

  it("offers one Edit per message while it can still be changed", () => {
    const html = renderToStaticMarkup(<TemplateList steps={steps} templates={templates} editable saveAction={() => noop} />);
    expect(controls(html)).toBe(2);
  });
});

describe("results", () => {
  const results = {
    enrolled: 3,
    sent: 4,
    failed: 1,
    skipped: 1,
    bounced: 1,
    replied: 1,
    interested: 1,
    won: 0,
    inProgress: 1,
    rows: [
      { enrollmentId: "e1", prospectId: "p1", company: "Shree Electricals", status: "replied", stopReason: "Replied", stepsSent: 2, nextDueAt: null },
      { enrollmentId: "e2", prospectId: "p2", company: "Beta Plumbing", status: "active", stopReason: null, stepsSent: 1, nextDueAt: "2026-11-15T06:05:00Z" },
      { enrollmentId: "e3", prospectId: "p3", company: "Gamma", status: "stopped", stopReason: "Not sent: this prospect has no value for the first part of the prospect's location", stepsSent: 0, nextDueAt: null },
    ],
  };

  it("shows the funnel from counted rows, with no delivered figure, and each prospect's reason", () => {
    const html = renderToStaticMarkup(<CampaignResultsView results={results} prospectsPath="/acme/discovery/offerings/p1/prospects" />);
    const shown = text(html);
    expect(shown).toContain("Enrolled 3 Sent 4 Bounced 1 Replied 1 Interested 1 Won 0");
    expect(shown).not.toMatch(/Delivered|Opened/i);
    expect(shown).toContain("1 step was skipped. 1 email could not be sent or has an unknown outcome.");
    expect(shown).toContain("Next step due 15 Nov 2026");
    expect(shown).toContain("Not sent: this prospect has no value for the first part of the prospect's location");
    expect(controls(html)).toBe(3);
  });

  it("says so when nobody is enrolled", () => {
    const html = renderToStaticMarkup(<CampaignResultsView results={{ ...results, enrolled: 0, failed: 0, skipped: 0, rows: [] }} prospectsPath="/x" />);
    expect(text(html)).toContain("Nobody is enrolled.");
  });
});

describe("the Launch dialog's lines", () => {
  it("state what launching does, in this campaign's numbers", () => {
    const lines = launchLines({ campaign, wouldEnrol: 12, mailbox, steps });
    expect(lines).toEqual([
      "12 prospects are enrolled now.",
      "Each gets up to 2 emails, from asha@acme.example, with the text shown on this page. Nobody approves each email first.",
      "At most 30 emails a day go out, on Mon, Tue, Wed, Thu, Fri, between 9:00 and 18:00 (Asia/Kolkata). A few go straight away if that is now; the rest at the daily check, 11:35.",
      "Follow-ups to a prospect stop when it replies, its email bounces, it unsubscribes, or you mark it won or lost.",
      "You can pause the campaign at any time, and nothing more is sent while it is paused.",
    ]);
    expect(launchLines({ campaign: { ...campaign, auto_enroll: true }, wouldEnrol: 1, mailbox, steps })[0]).toBe(
      "1 prospect is enrolled now, and new prospects that fit are added as they appear.",
    );
  });
});

describe("helpers", () => {
  it("lists why prospects were left out, most common first, or nothing", () => {
    expect(leftOutText({ no_email: 3, already_in_a_campaign: 5, suppressed: 0 })).toBe("5 are already in a campaign; 3 have no email address");
    expect(leftOutText({})).toBeNull();
  });

  it("knows when the daily check falls outside a campaign's hours", () => {
    expect(dailyCheckIn(campaign)).toEqual({ time: "11:35", hour: 11, inHours: true });
    expect(dailyCheckIn({ ...campaign, timezone: "America/New_York" })).toMatchObject({ time: "01:05", inHours: false });
    expect(dailyCheckIn({ ...campaign, timezone: "Not/AZone" })).toMatchObject({ time: "06:05", inHours: false });
  });
});
