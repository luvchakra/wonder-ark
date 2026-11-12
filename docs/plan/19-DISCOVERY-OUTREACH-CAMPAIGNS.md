# 19. Discovery outreach campaigns

Owner request, 2026-11-12: "create an outreach framework for all the prospects where the user can launch a campaign
to reach out to all the different prospects identified via email campaigns, message campaigns, or any other kind of
campaigns. It could also include AI-based telephonic calls or customized emails, which is meant for that company and
that line of work ... any business, any workspace ... should be the context ... it should work in a very automated
way with minimum human supervision and intervention. The end goal is to get customers converted."

This doc is the design and the story index. Story ids: `DISC-CAMP-P0-01.1` to `07.2`.

## What a user gets

1. On an offering's **Prospects** tab, a **Campaigns** page. "New campaign" opens with everything filled in from the
   workspace's own data: the audience (qualified prospects with a sendable email that no campaign has contacted), a
   three-step email sequence, and the daily limit. One primary action: **Write messages**.
2. WonderArk writes one message per step **per line of work** in the audience (plumbers, clinics, IT firms ...), from
   the offering, its Ideal customer and what the workspace knows about itself. The user can read and edit them.
3. **Launch**. The dialog says exactly what will happen: how many prospects, how many emails a day at most, that
   follow-ups stop when a prospect replies, bounces or unsubscribes, and that it can be paused at any time.
4. After that it runs without the user: sends each day inside the limit, follows up, stops on a reply, classifies
   replies, drafts an answer to interested ones, and puts only those on the Today list. New prospects approved later
   join the running campaign when "Add new prospects automatically" is on.
5. The campaign page shows the funnel with real counts: enrolled, sent, delivered, bounced, replied, interested, won.

## Owner-approved exception to "nothing AI produces executes on its own"

`CLAUDE.md` AI rule 3 gains: outreach campaign messages may send without a per-message approval when a user launched
the campaign, within this document. Everything else in that rule stands. The safeguards below are the conditions.

## Safeguards (all required; a failed check means do not send)

- **Opt-in.** Nothing sends until a user with permission presses Launch on that campaign. Default state is draft.
  Pause stops everything at once. A paused or completed campaign never sends.
- **Reviewed text by default.** What goes out is a template the user could read before launch, filled by code with a
  closed list of merge fields (`company`, `city`, `line_of_work`, `first_name`, `offering`, `sender_name`,
  `business_name`). The model never writes to a recipient unseen unless the user turns on "Personal opening line"
  (off by default), which adds one AI-written sentence per prospect, validated (length, no links, no instructions)
  and metered by the existing usage limit.
- **Claim before send.** `discovery.outreach_sends` holds one row per (enrollment, step), unique, written before the
  provider call under a per-workspace advisory lock, the way `crm.claim_ai_auto_reply()` does. A retry, an overlapping
  tick or a redelivered event finds the row and stops. `sendMessage` itself gains a compare-and-set on status so two
  clicks cannot both send.
- **Caps.** Per workspace per day (default 30, most 200), counted in the claim. A platform-wide daily cap from the
  environment protects the shared sender. At most 5 steps, at least 2 days apart. A prospect is in at most one active
  campaign per workspace.
- **Suppression and validity.** `prepareOutreachEmail()` before every send (unsubscribe link and RFC 8058 headers);
  `emailSendCheck()` blocks `invalid`; `risky` and `unverified` addresses are skipped in automatic sending unless the
  campaign's folded option "Include unverified addresses" is on. A sourced contact is an organisation mailbox only.
- **Stops.** A reply of any kind, a bounce, a complaint, an unsubscribe, a won or lost outcome, a deleted contact or
  prospect each stop that enrollment. Bounces, complaints and replies classified `unsubscribe` are added to
  `core.communication_suppressions` (they are not today).
- **Automatic pause.** After 20 sends, a bounce or complaint rate above 8% pauses the campaign with the reason shown.
- **Audit.** Launch, pause, resume, every claim and every outcome are written to `core.audit_log` by triggers.
  Addresses are stored hashed where matching is enough; no message body in the audit log.
- **Honest sender.** Every email carries the business's name and its postal address when the business profile has
  one, a truthful subject, and the unsubscribe link.
- **Licence and permission.** RLS `tenant AND licensed` on every new table; `requireModule('discovery')` and
  `requirePermission('discovery.manage')` in every action; the tick skips workspaces whose licence is not active.
- **Reporting.** A send is "requested", "sent", "failed" or "skipped" with its reason. Queued is never shown as sent.

## Data model (schema `discovery`, tenant `workspace_id`)

No row in the ownership map covers sequences; add one: "Outreach campaign / step / enrollment / send: `discovery`".
Messages stay in `discovery.messages` (each send creates one row there, linked from `outreach_sends`).

- `outreach_campaigns`: `id, workspace_id, product_id, name, status` (`draft`, `active`, `paused`, `completed`),
  `pause_reason, audience jsonb` (filters: kind, lines of work, minimum fit score), `daily_limit, send_days,
  send_from_hour, send_to_hour, timezone, auto_enroll boolean, personal_opening boolean, include_unverified boolean,
  launched_at, launched_by, created_by, created_at, updated_at`.
- `outreach_campaign_steps`: `id, campaign_id, workspace_id, position, channel` (`email`, `call`, `whatsapp`,
  `linkedin`), `delay_days, purpose` (`intro`, `follow_up`, `last_note`, `call`), unique `(campaign_id, position)`.
- `outreach_templates`: `id, campaign_id, step_id, workspace_id, segment` (line of work, or `general`), `subject,
  body, origin` (`ai_generated`, `user_modified`, `user_provided`), `ai_run_id`, unique `(step_id, segment)`.
- `outreach_enrollments`: `id, campaign_id, workspace_id, prospect_id, contact_id, segment, status` (`active`,
  `replied`, `completed`, `stopped`), `stop_reason, next_step_position, next_due_at`, unique
  `(campaign_id, prospect_id)`, and a partial unique index on `(workspace_id, prospect_id) where status = 'active'`.
  Index `(status, next_due_at)`.
- `outreach_sends`: `id, enrollment_id, step_id, workspace_id, campaign_id, status` (`requested`, `sent`, `failed`,
  `skipped`), `reason, message_id, claimed_at, finished_at`, unique `(enrollment_id, step_id)`.
- `discovery.claim_outreach_send(enrollment, step)`: security definer, advisory lock per workspace, re-checks campaign
  status and the day's count, inserts the `requested` row or returns the existing one.

## Engine

- **Enrol** at launch and (when `auto_enroll`) whenever a suggestion is approved: deterministic, from the audience
  filter; records why a prospect was left out (no email, suppressed, already in a campaign).
- **Tick** `/api/cron/discovery-campaigns` (`Authorization: Bearer $CRON_SECRET`): for each active campaign inside its
  send window, takes due enrollments oldest first, and for each one runs pre-checks, claims, renders, sends through
  the existing `sendMessage` path, records the outcome and schedules the next step. It works inside a time budget and
  leaves the rest due for the next tick. Launch runs a first small batch at once with `after()`.
- **Schedule.** `apps/web/vercel.json` runs it once a day (the plan allows no more). An hourly GitHub Actions workflow
  that calls the same route is added but stays off until the owner sets its two repository secrets (see below).
- **Replies.** `ingestInboundEmail` matches the reply to the workspace whose latest outbound message went to that
  address (today it takes the first contact with that address in any workspace), stops the enrollment, classifies the
  reply, and for `interested` and `question` drafts an answer for a person to send. Redelivery does not add a second
  row.
- **Model use.** One call per (step, line of work), not per prospect; cached by `input_hash` + `prompt_version`;
  prospect and website text is quoted material in the prompt. Lines of work beyond twelve share the `general`
  template.

## Channels

| Channel | In this build | Why |
| --- | --- | --- |
| Email | Sends automatically | The path above. |
| Call | A "Calls to make" row on Today with talking points written for that line of work and a `tel:` link; the user logs the outcome, which moves the enrollment on | No telephony provider is connected. AI-placed calls wait on the owner (below). |
| WhatsApp | A drafted message and a click-to-chat link; the user presses send in WhatsApp | Automatic WhatsApp to people who have not opted in breaks Meta's policy. |
| LinkedIn | A drafted note with Copy and a link to the company page | LinkedIn forbids automated sending. |
| SMS | Not offered; shown as "Needs setup" in the channel list | No provider; India requires DLT registration. |

A channel is one file behind a common shape (`prepare`, `deliver`, `status`), so an AI-call or WhatsApp-template
provider is added without changing the engine.

## Waiting on the owner

1. **Sender.** Email goes from the platform address (`RESEND_FROM_EMAIL`) with the business as reply-to. Confirm the
   provider's terms allow unsolicited business email, or choose "each business connects its own mailbox" as the next
   story.
2. **Hourly sending.** Add repository secrets `CAMPAIGN_TICK_URL` and `CRON_SECRET` to turn on the hourly workflow.
3. **AI phone calls.** Choose a telephony and voice provider and confirm the calling rules for each country
   (India: TRAI registration and Do Not Disturb scrubbing).
4. **Automatic WhatsApp and SMS.** Need opt-in records and approved templates (WhatsApp) and DLT registration (SMS).

## Story index

| Id | Story |
| --- | --- |
| `DISC-CAMP-P0-01.1` | Tables, RLS, audit triggers, claim function |
| `DISC-CAMP-P0-01.2` | Ownership-map row, `CLAUDE.md` exception, security rules line on campaign sends |
| `DISC-CAMP-P0-02.1` | Enrolment from the audience filter, with reasons for those left out |
| `DISC-CAMP-P0-02.2` | Tick: pre-checks, claim, render, send, schedule next step; caps and send window |
| `DISC-CAMP-P0-02.3` | `sendMessage` compare-and-set, audit entry, provider idempotency key |
| `DISC-CAMP-P0-03.1` | Write messages per step and line of work; merge-field renderer; edit and provenance labels |
| `DISC-CAMP-P0-03.2` | Optional personal opening line, validated and metered |
| `DISC-CAMP-P0-04.1` | Stops on reply, bounce, complaint, unsubscribe, outcome; suppression rows for bounce, complaint, unsubscribe reply |
| `DISC-CAMP-P0-04.2` | Reply matched to the right workspace; redelivery safe; draft answer for interested replies |
| `DISC-CAMP-P0-04.3` | Automatic pause on bounce or complaint rate |
| `DISC-CAMP-P0-05.1` | Campaigns page, new campaign, Launch dialog, pause and resume |
| `DISC-CAMP-P0-05.2` | Campaign results: funnel and per-prospect status, cards on phones |
| `DISC-CAMP-P0-06.1` | Call, WhatsApp and LinkedIn steps as Today rows with drafts |
| `DISC-CAMP-P0-07.1` | Cron route, daily schedule, hourly workflow (off until secrets exist) |
| `DISC-CAMP-P0-07.2` | Add new prospects automatically |
