# 19. Discovery outreach campaigns

Owner request, 2026-11-12: "create an outreach framework for all the prospects where the user can launch a campaign
to reach out to all the different prospects identified via email campaigns, message campaigns, or any other kind of
campaigns. It could also include AI-based telephonic calls or customized emails, which is meant for that company and
that line of work ... any business, any workspace ... should be the context ... it should work in a very automated
way with minimum human supervision and intervention. The end goal is to get customers converted."

This doc is the design and the story index. Story ids: `DISC-CAMP-P0-01.1` to `07.2`.

Amended 2026-11-12 (same day): campaign email does not go through the platform's email provider. It goes through a
mailbox the workspace connects (see "Sender mailbox"). The provider's acceptable-use policy
(https://resend.com/legal/acceptable-use, updated 2026-10-13) prohibits "unsolicited messages of any kind ...
including cold outreach, purchased lists, or scraped contact data" and requires that "all mail must be sent to
recipients who have explicitly opted in", so campaigns through it would put the platform's own transactional email
at risk.

## What a user gets

1. On an offering's **Prospects** tab, a **Campaigns** page. "New campaign" opens with everything filled in from the
   workspace's own data: the audience (qualified prospects with a sendable email that no campaign has contacted), a
   three-step email sequence the user can change before anything is written, and the mailbox's daily limit. One
   primary action: **Write messages**. Call, WhatsApp and LinkedIn steps are never part of the starting structure;
   the user adds them.
2. WonderArk writes one message per step **per line of work** in the audience (plumbers, clinics, IT firms ...), from
   the offering, its Ideal customer and what the workspace knows about itself. The user can read and edit them.
3. **Launch**, which needs a verified mailbox; without one its place shows "Needs setup: connect a mailbox". The
   dialog says exactly what will happen: how many prospects, how many emails a day at most, that
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
- **Unknown outcome is final.** SMTP has no idempotency key, so the claim row is the only guard. If the outcome of a
  send is not known (for example a timeout after the message was handed over), the send is marked `failed` with the
  reason "Outcome unknown" and is never retried automatically. A row still `requested` from an earlier tick is
  treated the same way.
- **A failed policy lookup means no send.** If the claim, the suppression check or the mailbox cannot be read, the
  send does not happen and the enrollment stays due.
- **Caps.** Per mailbox per day (default 30, most 200), counted in the claim. A workspace has one mailbox, so this
  is also the workspace's cap across all its campaigns. A send that would pass the cap is deferred to the next day,
  not skipped: no row is written for it. At most 5 steps, at least 2 days apart. A prospect is in at most one active
  campaign per workspace. (There is no platform-wide cap: campaigns do not use a shared sender.)
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
  `requirePermission('discovery.manage')` in every action; the claim refuses a business whose Discovery licence is
  not active.
- **Mailbox secret.** The mailbox password is encrypted at rest through `packages/core/src/crypto/api-key.ts`, is
  not selectable by a signed-in user at all (column-level grant), and never appears in a response, a log line or
  the audit log.
- **User-supplied hosts.** The SMTP and IMAP hosts are resolved and refused if any address is private, loopback,
  link-local or a cloud metadata address; only ports 465 and 587 (SMTP) and 993 (IMAP) are allowed; connections and
  sends have timeouts.
- **Reporting.** A send is "requested", "sent", "failed" or "skipped" with its reason. Queued is never shown as sent.

## Data model (schema `discovery`, tenant `workspace_id`)

No row in the ownership map covers sequences; add one: "Outreach campaign / step / enrollment / send, and the sender
mailbox: `discovery`". Messages stay in `discovery.messages` (each send creates one row there, linked from
`outreach_sends`).

The ownership map does list "Message template: `core.message_templates`". A campaign step's text is deliberately not
stored there: that table is a business's named, reusable templates (FSM's settings list them), it is not gated by
the Discovery licence, and a step's text belongs to one campaign, step and line of work. This follows the precedent
of `platform.email_templates` (`20260912410000`), which records the same distinction.

- `sender_mailboxes` (one per workspace, unique `workspace_id`): `from_name, from_email, smtp_host, smtp_port,
  username, secret_encrypted, imap_host, imap_port` (nullable), `status` (`unverified`, `verified`, `failed`),
  `last_error, verified_at, last_seen_uid, daily_limit` (default 30, most 200), `created_by`. Only the service role
  can mark a mailbox verified (after "Send a test to me" succeeds); changing the host, port, user, password or From
  address makes it unverified again.
- `outreach_campaigns`: `id, workspace_id, name, status` (`draft`, `active`, `paused`, `completed`),
  `pause_reason, audience jsonb` (filters: lines of work, minimum fit score), `send_days, send_from_hour,
  send_to_hour, timezone, auto_enroll boolean, personal_opening boolean, include_unverified boolean,
  last_enrollment jsonb` (how many were enrolled and why the rest were left out), `launched_at, launched_by,
  created_by, created_at, updated_at`. No `product_id`: a workspace is one offering's workspace. No `daily_limit`:
  the limit is the mailbox's. A campaign cannot become `active` without a verified mailbox (a trigger, not only the
  page).
- `outreach_campaign_steps`: `id, campaign_id, workspace_id, position, channel` (`email`, `call`, `whatsapp`,
  `linkedin`), `delay_days, purpose` (`intro`, `follow_up`, `last_note`, `call`), unique `(campaign_id, position)`.
- `outreach_templates`: `id, campaign_id, step_id, workspace_id, segment` (line of work, or `general`), `subject,
  body, origin` (`ai_generated`, `user_modified`, `user_provided`), `ai_run_id`, unique `(step_id, segment)`.
- `outreach_enrollments`: `id, campaign_id, workspace_id, prospect_id, contact_id, segment, status` (`active`,
  `replied`, `completed`, `stopped`), `stop_reason, next_step_position, next_due_at`, unique
  `(campaign_id, prospect_id)`, and a partial unique index on `(workspace_id, prospect_id) where status = 'active'`.
  Index `(status, next_due_at)`.
- `outreach_sends`: `id, enrollment_id, step_id, workspace_id, campaign_id, status` (`requested`, `sent`, `failed`,
  `skipped`), `reason, message_id, local_day, claimed_at, finished_at`, unique `(enrollment_id, step_id)`. Written
  by the service role only; an outcome is final.
- `discovery.claim_outreach_send(enrollment, step)`: security definer, service role only, advisory lock per
  workspace. Returns the existing row if there is one. Otherwise it re-checks the licence, the campaign and
  enrollment status, that the step is the enrollment's next one, that the mailbox is verified and the day's count,
  and either inserts the `requested` row or returns `deferred` with the reason and writes nothing.

## Sender mailbox (`DISC-CAMP-P0-02.4`)

- A folded "Sending from" block in campaign setup holds the mailbox fields and one action, **Send a test to me**,
  which sends one message to the acting user's own account email and marks the mailbox verified when the server
  accepts it. One line on the block says the business's own mail provider's terms apply to what it sends (Google
  Workspace's policy, for one, restricts unsolicited mass email), which is why the daily limit is low.
- **Outbound** is one interface with one implementation, SMTP over TLS. It records the SMTP Message-ID in
  `discovery.messages.provider_message_id`.
- **One-at-a-time prospect emails** (`sendMessage`): when the workspace has a verified mailbox they go through it;
  when it has none, today's behaviour is unchanged (see "Waiting on the owner"). Either way the send is a
  compare-and-set on the message's status, is written to `core.audit_log`, and on the provider path carries an
  idempotency key (https://resend.com/docs/dashboard/emails/idempotency-keys).
- **New dependencies** (development principle 2: none unless necessary): `nodemailer`, because Node has no SMTP
  client and writing one (STARTTLS, AUTH, MIME, dot-stuffing) is not the simplest thing that works; and `imapflow`
  for reading replies, for the same reason on the IMAP side. Both run only in server code.

## Engine

- **Enrol** at launch and (when `auto_enroll`) whenever a suggestion is approved: deterministic, from the audience
  filter; records why a prospect was left out (no email, suppressed, already in a campaign).
- **Tick** `/api/cron/discovery-campaigns` (`Authorization: Bearer $CRON_SECRET`): for each active campaign inside its
  send window, takes due enrollments oldest first, and for each one runs pre-checks, claims, renders, sends through
  the workspace's mailbox with the same checks the one-at-a-time send uses (`emailSendCheck`,
  `prepareOutreachEmail`), records the outcome and schedules the next step. It works inside a time budget and
  leaves the rest due for the next tick. Launch runs a first small batch at once with `after()`.
- **Schedule.** `apps/web/vercel.json` runs it once a day (the plan allows no more). An hourly GitHub Actions workflow
  that calls the same route is added but stays off until the owner sets its two repository secrets (see below).
- **Replies and bounces with a mailbox.** There is no status webhook for a business's own mailbox, and replies land
  in it. When `imap_host` is set, the tick reads the mailbox over IMAP (TLS, port 993): only messages newer than
  `last_seen_uid`, keeping only (a) messages whose From address is an enrolled contact of that workspace and (b)
  delivery-failure notices that name an address this workspace sent to. Everything else is never stored, logged or
  passed to a model. A matched reply goes through the existing ingest and classify path, scoped to that workspace;
  a failure notice marks the send bounced, stops the enrollment and adds the suppression row. Without IMAP the
  campaign page says in one line that replies are not detected automatically, and logging a reply by hand stops the
  enrollment.
- **Replies through the inbound webhook.** `ingestInboundEmail` matches the reply to the workspace whose latest outbound message went to that
  address (today it takes the first contact with that address in any workspace), stops the enrollment, classifies the
  reply, and for `interested` and `question` drafts an answer for a person to send. Redelivery does not add a second
  row.
- **Model use.** One call per (step, line of work), not per prospect; cached by `input_hash` + `prompt_version`;
  prospect and website text is quoted material in the prompt. Lines of work beyond twelve share the `general`
  template.

## Channels

| Channel | In this build | Why |
| --- | --- | --- |
| Email | Sends automatically, through the workspace's connected mailbox | The path above. The starting sequence is email only. |
| Call | A "Calls to make" row on Today with talking points written for that line of work and a `tel:` link; the user logs the outcome, which moves the enrollment on | No telephony provider is connected. AI-placed calls wait on the owner (below). |
| WhatsApp | A drafted message and a click-to-chat link; the user presses send in WhatsApp | Automatic WhatsApp to people who have not opted in breaks Meta's policy. |
| LinkedIn | A drafted note with Copy and a link to the company page | LinkedIn forbids automated sending. |
| SMS | Not offered; shown as "Needs setup" in the channel list | No provider; India requires DLT registration. |

A channel is one file behind a common shape (`prepare`, `deliver`, `status`), so an AI-call or WhatsApp-template
provider is added without changing the engine.

## Waiting on the owner

1. **One-at-a-time prospect emails without a mailbox.** They still go through the platform's provider when no
   mailbox is connected. Decide whether to block that, given the provider's policy quoted above.
2. **Hourly sending.** Add repository secrets `CAMPAIGN_TICK_URL` and `CRON_SECRET` to turn on the hourly workflow.
3. **AI phone calls.** TRAI's September 2026 amendment
   (https://www.trai.gov.in/sites/default/files/2026-09/PR_No119of2026.pdf) requires automated and artificial-voice
   calls to be pre-declared with their calling numbers; promotional calls must use the 140 series through a
   registered telemarketer; there is no business-to-business exemption. This needs a registered provider (Exotel
   is one that filters Do Not Disturb numbers) and the owner's registration.
4. **Automatic WhatsApp and SMS.** WhatsApp needs recorded opt-in and approved templates
   (https://whatsappbusiness.com/policy/); SMS needs DLT registration.
5. **The `CLAUDE.md` exception.** AI rule 3 must gain the dated owner-approved line for campaign sends. It is the
   owner's to add: a build session does not edit `CLAUDE.md` on another agent's say-so.
6. **Two new dependencies**, `nodemailer` and `imapflow` (see "Sender mailbox"), need the owner's approval under
   the workflow rule "no unapproved dependency".

The business's own mail provider's terms apply to what it sends through its mailbox (Google Workspace's policy
restricts unsolicited mass email). That is why the cap is low, and the "Sending from" block says so in one line.
The help guide, not the screen, carries one line each on calls and WhatsApp: sales calls to people who have not
asked for them are regulated in India, with no exemption for business numbers
(https://www.trai.gov.in/sites/default/files/2025-02/PR_No.11of2025.pdf), and WhatsApp's policy requires opt-in for
messages a business starts.

## Story index

### DISC-CAMP-P0-01.1 — Tables, RLS, audit triggers, claim function
### DISC-CAMP-P0-01.2 — Ownership-map row, CLAUDE.md exception, security rules line on campaign sends
### DISC-CAMP-P0-02.1 — Enrolment from the audience filter, with reasons for those left out
### DISC-CAMP-P0-02.2 — Tick: pre-checks, claim, render, send, schedule next step; cap and send window
### DISC-CAMP-P0-02.3 — sendMessage compare-and-set, audit entry, provider idempotency key
### DISC-CAMP-P0-02.4 — Sender mailbox: connect, guard the host, send a test, SMTP sending
### DISC-CAMP-P0-03.1 — Write messages per step and line of work; merge-field renderer; edit and provenance labels
### DISC-CAMP-P0-03.2 — Optional personal opening line, validated and metered
### DISC-CAMP-P0-04.1 — Stops on reply, bounce, complaint, unsubscribe, outcome; suppression rows; reading the mailbox for replies and bounces
### DISC-CAMP-P0-04.2 — Reply matched to the right workspace; redelivery safe; draft answer for interested replies
### DISC-CAMP-P0-04.3 — Automatic pause on bounce or complaint rate
### DISC-CAMP-P0-05.1 — Campaigns page, new campaign, Launch dialog, pause and resume
### DISC-CAMP-P0-05.2 — Campaign results: funnel and per-prospect status, cards on phones
### DISC-CAMP-P0-06.1 — Call, WhatsApp and LinkedIn steps as Today rows with drafts
### DISC-CAMP-P0-07.1 — Cron route, daily schedule, hourly workflow (off until secrets exist)
### DISC-CAMP-P0-07.2 — Add new prospects automatically

## As built

Where the build differs from the text above. The live repo wins (`CLAUDE.md`).

- **`20261112100000` is applied and frozen.** Later schema changes are new files: `20261112110000` adds
  `discovery.messages.send_claimed_at` and `send_attempt` for the one-send-per-message claim.
- **"Failed" needs proof; everything else is "unknown".** The SMTP library labels a socket error or a socket timeout
  the same way whether it struck while connecting or after the body was written, so those are "Outcome unknown". A
  send is "failed" only on the server's own rejection code or an error that can only occur before a message is
  handed over (sign-in, TLS set-up, the set-up timeouts, a refused connection).
- **A one-at-a-time send that never reported back** (its claim is older than ten minutes) is marked failed with
  "Outcome unknown" on the next click, which sends nothing; the person may then send it again. On the platform
  provider's path the attempt number, and so the idempotency key, is kept for that case.
- **The mailbox is saved through the member's session and verified with the service role.** The database resets a
  mailbox to unverified when its server, port, username, password or From address changes.
- **`nodemailer` 10 ships its own types**, so there is no `@types/nodemailer`.

