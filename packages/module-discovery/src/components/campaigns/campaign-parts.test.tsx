/**
 * DISC-CAMP-P0-05.1 / 05.2: what the Campaigns pages render. Pins that the copy says
 * what the code does (CLAUDE.md, AI rule 7), that the mailbox form never carries a
 * password back, that every text shows where it came from, that the funnel shows only
 * counted rows, and the control counts ("Minimal UI").
 *
 * DISC-CAMP-P0-06.1: a call, WhatsApp or LinkedIn step is shown everywhere as a task for
 * a person, and no line about one says it was, or will be, sent.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

const { AudienceForm, CampaignList, CampaignResultsView, MailboxForm, ScheduleForm, StepList, TemplateList, activateLines, leftOutText } = await import("./campaign-parts");
const { CampaignPreviewView } = await import("./preview-parts");
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
    expect(text(renderToStaticMarkup(<StepList steps={[steps[0]!, { ...steps[1]!, delay_days: 1 }]} />))).toBe("1. Introduction email, sent first 2. Follow-up email, 1 day after step 1");
  });

  const templates = [
    { id: "t1", campaign_id: "c1", step_id: "s1", workspace_id: "w1", segment: "plumber", subject: "For {{company}}", body: "Hello <b>there</b>", origin: "ai_generated" as const, ai_run_id: null },
    { id: "t0", campaign_id: "c1", step_id: "s1", workspace_id: "w1", segment: "general", subject: "Hi", body: "General text", origin: "user_modified" as const, ai_run_id: null },
  ];

  it("DISC-CAMP-P0-06.1: names a step a person does as theirs, and shows its draft with no subject", () => {
    const call = { id: "s3", campaign_id: "c1", workspace_id: "w1", position: 3, channel: "call" as const, delay_days: 2, purpose: "call" as const };
    expect(text(renderToStaticMarkup(<StepList steps={[steps[0]!, call]} />))).toBe(
      "1. Introduction email, sent first 3. Call, 2 days after step 2, for you to do from the Today list",
    );
    const draft = { id: "t3", campaign_id: "c1", step_id: "s3", workspace_id: "w1", segment: "general", subject: null, body: "Ask how they book jobs.", origin: "ai_generated" as const, ai_run_id: null };
    const html = renderToStaticMarkup(<TemplateList steps={[call]} templates={[draft]} editable saveAction={() => noop} />);
    expect(text(html)).toContain("Step 3: Call · a draft for you; nothing is sent for this step Everyone else AI-generated Ask how they book jobs.");
    expect(text(html)).not.toContain("Subject");
    expect(html).not.toContain('name="subject"');
    expect(controls(html)).toBe(1);
  });

  it("labels every text with where it came from, general first, and renders it as text", () => {
    const html = renderToStaticMarkup(<TemplateList steps={steps} templates={templates} editable={false} saveAction={() => noop} />);
    expect(text(html)).toBe(
      "Step 1: Introduction email Everyone else AI-generated, edited by you Subject: Hi General text Line of work: plumber AI-generated Subject: For {{company}} Hello &lt;b&gt;there&lt;/b&gt; Step 2: Follow-up email No text yet.",
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
    tasksDone: 0,
    tasksNotReached: 0,
    rows: [
      { enrollmentId: "e1", prospectId: "p1", company: "Shree Electricals", status: "replied", stopReason: "Replied", stepsSent: 2, nextDueAt: null, tasks: [], passedOver: [] },
      { enrollmentId: "e2", prospectId: "p2", company: "Beta Plumbing", status: "active", stopReason: null, stepsSent: 1, nextDueAt: "2026-11-15T06:05:00Z", tasks: [], passedOver: [] },
      { enrollmentId: "e3", prospectId: "p3", company: "Gamma", status: "stopped", stopReason: "Not sent: this prospect has no value for the first part of the prospect's location", stepsSent: 0, nextDueAt: null, tasks: [], passedOver: [] },
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

  it("DISC-CAMP-P0-06.1: shows what a person did, and what was passed over, apart from emails sent", () => {
    const html = renderToStaticMarkup(
      <CampaignResultsView
        results={{
          ...results,
          tasksDone: 1,
          tasksNotReached: 1,
          rows: [
            {
              ...results.rows[1]!,
              tasks: [{ position: 2, channel: "call", outcome: "done" }, { position: 4, channel: "linkedin", outcome: "not_reached" }],
              passedOver: [{ position: 3, reason: "no_phone" }],
            },
          ],
        }}
        prospectsPath="/x"
      />,
    );
    const shown = text(html);
    expect(shown).toContain("1 step was marked done by a person, and 1 was marked couldn't reach. Nothing was sent for them.");
    expect(shown).toContain("Emails sent: 1 Next step due 15 Nov 2026. Step 2, call: done. Step 4, linkedin: couldn't reach. Step 3 passed over: No phone number");
    expect(shown).not.toMatch(/call: sent|linkedin: sent/i);
  });

  it("says so when nobody is enrolled", () => {
    const html = renderToStaticMarkup(<CampaignResultsView results={{ ...results, enrolled: 0, failed: 0, skipped: 0, rows: [] }} prospectsPath="/x" />);
    expect(text(html)).toContain("Nobody is enrolled.");
  });
});

describe("the Activate dialog's lines", () => {
  it("state what activating does, in this campaign's numbers", () => {
    const lines = activateLines({ campaign, wouldEnrol: 12, mailbox, steps });
    expect(lines).toEqual([
      "12 prospects are enrolled now.",
      "Each gets the 2 emails you previewed, from asha@acme.example. Nobody approves each email first.",
      "Emails go out on Mon, Tue, Wed, Thu, Fri, between 9:00 and 18:00 (Asia/Kolkata), at the daily check at 11:35.",
      "At most 30 emails a day, the mailbox's limit, shared by all of this offering's campaigns.",
      "2 emails to each prospect: step 2 3 days after step 1.",
      "A few go straight away if it is within those hours now; the rest at the daily check.",
      "Follow-ups to a prospect stop when it replies, its email bounces, it unsubscribes, or you mark it won or lost.",
      "You can pause the campaign at any time, and nothing more is sent while it is paused.",
    ]);
    // DISC-CAMP-P0-06.1: a step for a person is not counted as an email, and is said to wait.
    const withCall = activateLines({ campaign, wouldEnrol: 2, mailbox, steps: [...steps, { ...steps[1]!, id: "s3", position: 3, channel: "call" as const, delay_days: 2, purpose: "call" as const }] });
    expect(withCall[1]).toBe("Each gets the 2 emails you previewed, from asha@acme.example. Nobody approves each email first.");
    expect(withCall[4]).toBe(
      "3 steps for each prospect: step 2 (an email) 3 days after step 1, step 3 (a call for you to make) 2 days after step 2. WonderArk sends the emails. A step for you appears on the Today list when it is due; nothing is sent or dialled for it, and the steps after it wait until you mark it done.",
    );
    expect(activateLines({ campaign: { ...campaign, auto_enroll: true }, wouldEnrol: 1, mailbox, steps: [steps[0]!] }).slice(0, 2)).toEqual([
      "1 prospect is enrolled now, and new prospects that fit are added as they appear.",
      "Each gets the email you previewed, from asha@acme.example. Nobody approves each email first.",
    ]);
  });
});

describe("Schedule and Audience", () => {
  it("fills the schedule from the campaign as it stands, with one Save", () => {
    const html = renderToStaticMarkup(<ScheduleForm campaign={{ ...campaign, daily_limit: 10 }} steps={steps} mailboxLimit={30} action={noop} />);
    expect(html).toMatch(/name="dailyLimit"[^>]*value="10"/);
    expect(html).toMatch(/name="delayDays2"[^>]*value="3"/);
    expect(html).toMatch(/name="delayDays3"[^>]*value=""/);
    expect(html.match(/name="sendDays"[^>]*checked=""/g) ?? html.match(/checked=""[^>]*name="sendDays"/g)).toHaveLength(5);
    expect(html.match(/type="submit"/g)).toHaveLength(1);
    expect(text(html)).toContain("blank for the mailbox's 30");
    expect(text(html)).toContain("Changing the schedule means previewing the campaign again before it can send.");
    expect(text(html)).toContain("One that has already been sent or done for someone can't be removed.");
    // DISC-CAMP-P0-06.1: each later step says what it is; an email unless chosen otherwise.
    expect(html.match(/<select[^>]*name="channel\d"/g)).toHaveLength(4);
    expect(html).toMatch(/name="channel2"[\s\S]*?<option value="email" selected="">Email<\/option><option value="call">Call<\/option><option value="whatsapp">WhatsApp<\/option><option value="linkedin">LinkedIn<\/option>/);
    expect(text(html)).toContain("nothing is sent or dialled for it, and the steps after it wait until you mark it done");
  });

  it("holds the name and who is enrolled, with one Save", () => {
    const html = renderToStaticMarkup(<AudienceForm campaign={campaign} action={noop} />);
    expect(html.match(/type="submit"/g)).toHaveLength(1);
    expect(html).toContain('name="onlyQualified"');
    expect(html).toContain('name="autoEnroll"');
    expect(html).not.toContain('name="sendDays"');
  });
});

describe("the preview", () => {
  const preview = {
    audience: 3,
    alreadyEnrolled: false,
    leftOut: { no_email: 2 },
    schedule: ["Emails go out on Mon, Tue.", "At most 30 emails a day."],
    steps: [{ position: 1, purpose: "intro" as const, channel: "email" as const }, { position: 2, purpose: "follow_up" as const, channel: "email" as const }],
    step: 1,
    index: 0,
    lastIndex: 1,
    confirmed: false,
    lines: [
      {
        segment: "general",
        prospects: 1,
        email: { ok: true as const, kind: "email" as const, prospectId: "p3", company: "Gamma <b>Dental</b>", from: "Asha <asha@acme.example>", to: "info@gamma.example", subject: "An idea for Gamma", text: "Hello Gamma.\n\n--\nUnsubscribe: https://app.example/u" },
      },
      { segment: "plumber", prospects: 2, email: { ok: false as const, prospectId: "p2", company: "Beta Plumbing", reason: "Not sent: this prospect has no value for the first part of the prospect's location" } },
    ],
  };
  const render = (overrides: Record<string, unknown> = {}) =>
    renderToStaticMarkup(<CampaignPreviewView preview={{ ...preview, ...overrides }} campaignPath="/acme/discovery/offerings/p1/campaigns/c1" confirmAction={noop} testAction={() => async () => null} />);

  it("shows who, when and the real emails, a skipped prospect as skipped, and ends in This looks right", () => {
    const html = render();
    const shown = text(html);
    expect(shown).toContain("3 prospects would be enrolled when you activate.");
    expect(shown).toContain("Left out: 2 have no email address.");
    expect(shown).toContain("Emails go out on Mon, Tue.");
    expect(shown).toContain("The emails: step 1, introduction, prospect 1 in each line of work");
    expect(shown).toContain("From Asha &lt;asha@acme.example&gt; To info@gamma.example (Gamma &lt;b&gt;Dental&lt;/b&gt;) Subject An idea for Gamma Hello Gamma. -- Unsubscribe: https://app.example/u");
    expect(shown).toContain("Beta Plumbing would be skipped. Not sent: this prospect has no value for the first part of the prospect's location.");
    expect(shown).toMatch(/This looks right$/);
    expect(html).not.toContain("<b>Dental</b>");
    // The step link, Next prospect, one test button (the skipped email has none) and the confirmation.
    expect(controls(html)).toBe(4);
    expect(html).toContain('href="/acme/discovery/offerings/p1/campaigns/c1?preview=1&amp;step=2&amp;n=0"');
    expect(html).toContain('href="/acme/discovery/offerings/p1/campaigns/c1?preview=1&amp;step=1&amp;n=1"');
    expect(shown).not.toContain("Previous prospect");
  });

  it("has no address field anywhere: a test can only go to the mailbox", () => {
    expect(render()).not.toMatch(/<input[^>]*type="(email|text)"/);
  });

  it("says so once it is confirmed, and for a paused campaign names the people it is still writing to", () => {
    const html = render({ confirmed: true, alreadyEnrolled: true, audience: 1 });
    expect(text(html)).toContain("1 prospect is enrolled and still in progress.");
    expect(text(html)).toContain("You confirmed this preview. Back to the campaign");
    expect(text(html)).not.toContain("This looks right");
  });

  it("says when a line of work has no further prospect, and when there is nobody at all", () => {
    expect(text(render({ index: 1, lines: [{ segment: "general", prospects: 1, email: null }] }))).toContain("No prospect 2 in this line of work.");
    expect(text(render({ audience: 0, lines: [] }))).toContain("Nobody would be written to, so there is nothing to show.");
  });

  it("DISC-CAMP-P0-06.1: shows a call step as a task for a person, with the draft, and no test to send", () => {
    const html = render({
      steps: [...preview.steps, { position: 3, purpose: "call" as const, channel: "call" as const }],
      step: 3,
      lines: [
        {
          segment: "general",
          prospects: 2,
          email: { ok: true as const, kind: "task" as const, channel: "call" as const, prospectId: "p1", company: "Beta <i>Plumbing</i>", detail: { text: "+91 98765 43210", href: "tel:+919876543210" }, text: "Ask how they book jobs.", origin: "ai_generated" as const },
        },
        { segment: "plumber", prospects: 1, email: { ok: false as const, prospectId: "p2", company: "Gamma", reason: "No phone number" } },
      ],
    });
    const shown = text(html);
    expect(shown).toContain("A task for you, not sent by WonderArk: step 3, call, prospect 1 in each line of work");
    expect(shown).toContain("Call Beta &lt;i&gt;Plumbing&lt;/i&gt;: +91 98765 43210. This would appear on your Today list when it is due. Nothing is sent or dialled.");
    expect(shown).toContain("Talking points · AI-generated Ask how they book jobs.");
    expect(shown).toContain("Gamma would be passed over for this step. No phone number.");
    expect(shown).not.toContain("Send me a test");
    expect(html).not.toContain("<i>Plumbing</i>");
    // Two step links, Next prospect and the confirmation: no control on the task itself.
    expect(controls(html)).toBe(4);
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
