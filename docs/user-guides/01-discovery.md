# Discovery: Customer Acquisition, Marketing & Funding

Discovery is where a business finds its customers, markets to them and raises
money to grow. It has three working areas that share the same business,
offerings and data:

- **Customer Acquisition** — who to sell each offering to, finding them, and
  handing qualified opportunities to your sales process.
- **Marketing** — strategy, campaigns, content, assets, website & SEO and
  analytics.
- **Funding** — your funding profile, investor readiness, rounds, investors,
  outreach, data room and due diligence.

Last updated: 2026-11-12


## How Discovery is organised

Discovery's menu in the sidebar is four links, with nothing to unfold:

| Item | What it opens |
|---|---|
| **Overview** | The Discovery dashboard (below) |
| **Customer Acquisition** | The offering you last worked in. Its tabs — Setup, Find, Prospects, Results — are across the top of the page |
| **Marketing** | The Marketing dashboard. Strategy, Campaigns, Content, Assets, Website & SEO and Analytics are tabs across the top |
| **Funding** | The Funding dashboard. Funding Profile, Investor Readiness, Fundraising, Investors, Investor Outreach, Data Room, Due Diligence and Analytics are tabs across the top |

**Business** is not in Discovery's menu. It is a row of its own at the top of the sidebar,
above the modules, because it describes the business whichever module you are in. Its page
holds your business profile and the list of your offerings; open an offering from there.

**Switching offering.** When a business has more than one offering, the
header of every offering page has an **Offering** selector. Switching keeps
you on the same section — from Ideal customer to the other offering's Ideal customer,
from Prospects to its Prospects. The sidebar also remembers the offering you last
worked in, so going to Marketing and back to Customer Acquisition returns to
it rather than to the first offering. With no offering yet, Customer Acquisition opens
the Business page, where you add one.

## Before you start: business offerings

Discovery works **per offering** — each product or service line you market
gets its own ideal customer profile, prospect list, and AI usage allowance.
Set up your business's offerings first, from the **Business** page (at the top of the
sidebar):

1. Enter your business name, website and a short description.
2. Add offerings one of three ways:
   - **Let AI Auto-populate Offerings from website** (needs a website) — the AI reads your
     site and lists offerings it found, each with a name, description and website. Tick the
     ones you want and click **Add N offerings**; nothing is added until you do.
   - **Import offerings** — a CSV, Excel or PDF catalog, up to 500 rows.
   - Add them by hand.

If you created the business **From website**, the Business page also shows the website
review: each profile field is marked as stated on the site, the AI's interpretation, or not
found, and each suggested offering shows how confident the AI is. **Apply name &
description**, **Merge N selected** or **Create N Offerings** — again, only what you choose.

## Connecting an AI provider

Discovery's AI features (ICP generation, prospecting, scoring, research
briefs) need an AI provider. Go to avatar menu → **Billing → AI**:

- Pick **OpenAI**, **Anthropic**, or **Google Gemini** and paste your API
  key, or
- Pick **App Internal AI** to use WonderArk's shared credits instead — no
  key required.

WonderArk tests the connection live before saving. Your key is encrypted at
rest; only a fingerprint and connection status are ever shown back to you.
If you don't connect a key and the deployment has a platform-owned key, WonderArk uses that.
On the included credits, each offering has a monthly allowance of 200 AI runs or $20 of AI
cost, whichever comes first; with your own key connected there is no allowance, since your
provider bills you directly. A notification in the bell warns you at 80% and again at 100%;
at 100% AI features pause until next month unless you have bought credits. If WonderArk switches an AI feature off platform-wide,
it says "This AI feature is temporarily unavailable. Please try again later."

## AI approvals

On the **Business** page, **AI approvals** sets how Discovery's AI flows (Let AI
Auto-Populate Info and Run AI Discovery) treat their own results, for the whole business:
**Review each step** (the default) or **Approve automatically**. The **Setup** tab shows the
current choice ("AI suggestions wait for your review" or "AI approves steps automatically")
with a **Change in settings** link. Changing it needs `business.settings.manage` (owners and
admins by default); every change is recorded in the audit log.

## The Discovery Dashboard

Your GTM home for the business: KPI tiles (offerings, prospects, reply rate,
AI credits used this month), a **Needs attention** checklist (add a website,
create an offering, generate a profile, define an ICP, discover prospects —
whichever step you haven't done yet), a conversion funnel once you have prospects, an
**Offering portfolio** table once you have more than one offering, and an "Accounts across
offerings" panel when the same company turns up under more than one of them.

## Working an offering

Once an offering has a profile, it has four tabs along the top: **Setup**, **Find**,
**Prospects** and **Results**. Each tab is one page. Its main content is open, and
everything else is a section with a title, a one-line summary and a chevron. Click a
section to open it.

| Tab | Open on the page | Sections |
|---|---|---|
| **Setup** | The next step | **Offering** (definition quality, who buys it, website, description, sources), **Ideal customer** (your ICP and buyer personas), **Discovery** (the AI discovery run, its schedule, saved criteria and definitions) |
| **Find** | Search, and what it found under **To review** | **Import**, **History** |
| **Prospects** | Your prospects (Companies, Channels and People) | **Campaigns**, **Opportunities**, **Watchlist** |
| **Results** | Performance, and discovery effectiveness once there are opportunities | **Conversions**, **What people say**, **Usage** |

They aren't a checklist: use them in any order. Every page keeps the address it had, so
old links and bookmarks still open it on its own. (Before a profile exists you instead get a
short step-by-step bar for setting the offering up: Overview, Ideal customer, Prospects,
Conversions.)

A prospect's own page works the same way: its steps (**Research**, **Score**, **Outreach
strategy**, **Messages**) and its **Research brief**, **Buyer intelligence** and
**Conversations** are sections, and the first step not done yet is open.

### Setup

The offering's hub page:

- **Next step** — the single next step WonderArk suggests
  (define your ideal customer, approve it, add buyer personas, find prospects, or
  review them).
- **Top Opportunity Gate** — one AI-recommended opportunity to act on now, with **Edit
  Recommendation**, **Send to CRM**, **Watch** and **Dismiss**.
- **Offering** section — **Definition quality**, a score out of 100 for how completely the
  offering, its ICP and its buyer personas are defined, and a "Less certain about" line
  with a **Research further** button that regenerates the ICP. Below it, who buys the
  offering and its website, description and sources.
- **Discovery effectiveness** — opportunities, how many led to a conversation, how many
  were sent to CRM, how many were won, and the win rate — is on **Results**.
- **Discovery** section — saved discovery criteria (minimum score, geography, industries,
  buyer roles, exclusions), a rediscovery schedule (Off, Daily or Weekly; WonderArk records
  the next date but doesn't start runs on its own yet) and a **Run AI Discovery** panel with
  live progress. What it may approve depends on your [AI approvals](#ai-approvals) setting,
  shown under the panel. With **Review each step** it stops when the ICP it generates needs
  your approval, and again when it finds accounts: they wait under **Find**, in **To review**, and
  become prospects only when you add them; click **Resume AI Discovery** after each review.
  With **Approve automatically** it approves the ICP and adds up to 10 accounts as prospects
  without asking. Nothing is sent to anyone either way.
- **Offering setup & sources** — website and description, knowledge sources (up to 20 MB
  each, including DOCX), and **Let AI Auto-Populate Info** (**Regenerate** once a profile
  exists). Expanded until a profile exists.

**Let AI Auto-Populate Info does several steps for you,** following your
[AI approvals](#ai-approvals) setting (shown under the button):

- **Review each step** (the default): it writes the offering profile and generates an ICP,
  which stays a draft until you approve it. If the ICP was already approved, it also finds
  one company and leaves it under **Find**, in **To review**, for you to add or discard.
- **Approve automatically**: it writes the offering profile, generates and approves an ICP,
  finds one prospect and adds it, researches and scores it, approves an outreach strategy
  for it and drafts a first message.

Review what it produced either way — it's all AI-generated. Nothing is sent: a message stays
a draft until you send it.

### Discovery (definitions)

**Setup → Discovery** holds your *discovery definitions*: what to look for, for this
offering. A definition has a name, a monitoring frequency (**Daily, Weekly, Monthly** or
**Manual only** — recorded for now; definitions don't run on a schedule yet), a minimum score, target
geographies and industries, buyer roles, **desired signals**, **excluded
signals** and **disqualifiers**. Switch a definition on or off without
deleting it. **Start from a play** gives you ready-made starting points —
Recently Funded, Rapid Growth, Hiring Relevant Roles, New Executive,
Technology Migration, Competitor Customers, Regulatory Pressure, Negative
Reviews, Expansion and Multiple Buying Signals — which you can then edit.

### Who buys this: companies, consumers or both

**Who buys this?** asks whether an offering is sold to **Companies**, **Consumers** or
**Both**. Until you answer, it sits at the top of the offering's **Setup** tab, with the
answer your offering profile suggests already chosen; press **Confirm** to keep it or pick
another. Afterwards you can change it under **Offering setup & sources**. The answer
decides what the rest of the offering offers: an **Ideal user** on the ideal customer page,
channels on **Find**, and a **Channels** list on **Prospects**.

### ICP & Buyer Personas

**Setup → Ideal customer** is where you generate (or regenerate, clone, or approve) an
Ideal Customer Profile (ICP):
industries, company sizes, geographies, roles, pain points, buying signals,
exclusions, revenue range, business model, tech stack, growth stage, and
existing tools. The ICP has one overall **Confidence** percentage and an **Evidence** list.
It needs an offering profile first. **Save changes** only saves; **Save & Run Downstream**
also re-runs prospecting and scoring. Earlier versions are under **Version history**. Buyer
Personas are managed on the same page, whether or not an ICP exists yet.

For an offering sold to consumers (or to both), the page also has an **Ideal user**: who
they are, what they are trying to get done, what triggers the need, what they use today,
their interests, where they spend time online and offline, and the words they use.
**Regenerate** writes it with AI from your offering profile, marked **AI-generated** until
you edit it; regenerating with nothing changed reuses the last draft instead of asking the AI
again. It is saved, versioned and approved with the rest of the page. For an offering sold
only to consumers the company fields are folded under **Company fields**.

### Finding prospects

Everything that brings companies in is under the **Find** tab.

- **Search** opens one search form. **What** (keywords or categories) and **Where** arrive
  filled in from your approved ICP, **Source** chooses where to look, and **Find** runs the
  search. Company size and other filters are under **More filters**. The sources:
  - **WorksLake business data** searches stored business listings. If the connection isn't
    set up it is listed as **Needs setup**, and if it doesn't answer, **Unavailable**;
    nothing is shown in its place. A line under the form shows how many searches and paid
    lookups your business has left this month, and a source that uses paid lookups says so
    on the **Find** button.
  - **Web search (AI)** (needs an approved ICP) runs an AI web search for up to 10 companies.
  - **Companies hiring for…** is listed when hiring signals are available. It searches by
    job-title keywords, filled in from your ICP's buying signals and existing tools.

  After a search, a summary says how many results came back, how many were added, and how
  many were left out because they are already prospects, already waiting for review, or
  outside your approved ICP. What was found waits under **To review**, each with its place,
  category, why it fits and a badge naming its source. Untick any you don't want, then
  click **Approve selected** to add the rest to your prospects, or **Discard selected** to
  remove them. Running the same search again doesn't add the same company twice.
  **Run this weekly**, shown in the result of a search on a free WorksLake source, saves that
  search to run again every 7 days. A weekly run uses free sources only, never paid lookups,
  counts toward your monthly run allowance like any other search, and adds only companies
  that are new; they wait under **To review** for you to approve, as always. An offering has
  one weekly search: saving another asks before it replaces the first. A line under the
  search form shows what the weekly search looks for, when it last ran and what that run
  found (or that it failed, and why), and when it runs next. **Pause** stops it until you
  press **Resume**. Searches are checked once a day, so a run can start up to a day after
  it falls due.
- **Channels and places they gather.** For an offering sold to consumers, Find looks for
  **Channels** (YouTube channels, podcasts, communities, newsletters, forums and other
  public outlets) or **Places they gather** (schools, colleges, coaching centres, gyms,
  clubs, community centres and coworking spaces). For an offering sold to both, a switch
  above the form chooses **Companies**, **Channels** or **Places they gather**. **What** is
  filled in from your approved Ideal user's interests and online places (or, for places,
  its offline places). Only sources that list channels or places are offered; if none is
  available yet, the form says **Needs setup**. A channel waiting under **To review** shows
  its type, its audience with the date the source measured it, its topics, why it fits and
  its source. Approving it adds it to your prospects as a channel. Channels are never
  people's own profiles.
- **Import** loads a list from CSV, Excel or PDF, or pasted CSV. `company_name` is
  required; a file in another layout is restructured by AI for you to check before import.
- **Add**, on the **Prospects** tab, creates one prospect by hand.

### Today

The **Prospects** tab opens with a short **Today** list of what is waiting for you, counted
from your own prospects and suggestions:

- **Replies waiting for your answer** — prospects whose latest conversation needs a
  response. **Answer** opens the list filtered to them.
- **Follow-ups due** — prospects you sent a message to, with no reply and no activity for
  7 days. **Follow up** opens the list filtered to them.
- **Suggestions waiting for review** — what a search found and you haven't approved or
  discarded yet. **Review** opens **To review** under Find.

- **Campaign tasks** — a running campaign's calls, WhatsApp messages and
  LinkedIn messages that are due, one line per prospect, oldest first and five at a time.
  Each shows who, the number or page to use, and the draft with that prospect's details
  filled in. **Mark done** records how it went.

A line appears only when it has something in it. When nothing is waiting, the list says
so.

### A prospect's details and contacts

A prospect's page opens with what is known about the company. Beside each value a source
supplied is where it came from, for example "Industry: Software, from Wikidata"; a value
with no source beside it was typed by a person. **Source** names where the prospect itself
was found, with a link to the record when there is one. **Edit details** unfolds the form
for changing any of it. If you change a value a source filled in, it is no longer credited
to that source.

**Filling in blanks.** When a company is approved, by you under **To review** or by AI
Discovery when your business uses **Approve automatically**, WonderArk looks up
the details it is missing (industry, company size, description, phone, general email,
LinkedIn page, location) from free sources. It fills only what is blank and never changes a
value you typed. If the lookup fails, the page says **Enrichment unavailable** and nothing
is changed; **Retry** runs it again. **Fill missing details** does the same lookup and may
also use paid sources: it first shows how many paid lookups your business has left this
month, and runs only when you confirm. Afterwards it says what was filled and how many paid
lookups it used.

**Finding contacts.** **Find contacts** looks for up to three people at the company in the
roles of your approved ideal customer, and checks each address. It always uses paid
lookups, so it too shows how many are left and runs only when you confirm; pressing it
twice by accident does not spend twice. It needs the company's website and an approved
ideal customer with at least one role. Each person found is added under **Contacts** with
who found them, when, and a mark for the address: **Verified**, **Risky**, **Invalid** or
**Not verified**. If the search finds the company's general mailbox (such as `info@`) and
the prospect has no general email yet, it is filled in. When no contact provider is
connected, the result says "No named contacts: the contact providers need setup." Nothing
is sent to anyone by a lookup. **Add a contact** unfolds the form for adding one by hand;
a contact you type has no mark. If you change a found contact's address, its mark is
cleared, because the new address has not been checked.

If the WorksLake connection isn't set up, the page says **Needs setup** in place of these
lookups; if it doesn't answer, the lookup reports **Unavailable** and changes nothing.

**Removing a contact.** **Delete** removes a contact. If the person asked you to stop
contacting them, tick **They asked not to be contacted**: WonderArk then adds the address to
your business's do-not-contact list, so no later email from your business is sent to it
(even if someone adds the address again), and asks WorksLake to leave it out of later
contact lookups. If the request to WorksLake can't be passed on, the address is still
blocked for your business, the contact is not deleted, and the page says why, so you can
try again.

### Channels: drafts, posts and Live

For an offering sold to consumers, **Prospects** lists your channels, with each one's type,
audience and location. An offering sold to both has a switch between **Companies** and
**Channels**. A channel's page shows its type, its audience (with the date the source
measured it), its topics and its source.

**Drafts for this channel** writes one draft at a time with AI: a **Partnership pitch to
the owner**, a **Sponsorship or listing enquiry**, or a **Community post**. The two emails
are saved as drafts under **Messages**. The community post is saved as marketing content,
marked **AI-generated**, and listed under the drafts with **Copy**. WonderArk never posts
to a community, group or channel, and never sends these drafts by itself: you copy the post
and publish it yourself. Then open **Mark as posted**, paste the link to your post and
press **Save**; the post then shows the date and the link. A draft with a link, an email
address or a placeholder in it is not saved.

A channel uses the same stages as a company. Closing a conversation as won shows the
channel as **Live**.

### People: sign-ups, conversations and what people say

An offering sold to consumers (or to both) has a **People** list on **Prospects**: the
people who chose to hear from you. WonderArk never builds lists of private individuals;
everyone here signed up on your page or was on a list you imported and confirmed.

- **Sign-up page.** Open **Sign-up page** above the People list to create it: one line
  about the offering, up to two questions, and the consent line people agree to (you can
  edit it). **Copy link** copies its address. The page shows the offering's name, asks for
  an email and an optional name, names your business as the one collecting the details,
  and says "Powered by WonderArk". Joining records the person with the consent line they
  saw and sends them a confirmation email with an unsubscribe link and their own referral
  link. Someone who signs up through a referral link is credited to the person who shared
  it; the People list shows each person's referrals. The page shows the same thank-you
  whether or not the address was already on the list, and limits how often it can be used.
- **Import people.** On **Find**, in the **Import** section, an offering sold to consumers imports a
  CSV or Excel list with an `email` column (and optionally `name` and `tags`). You must
  tick **These people agreed to hear from me**; that sentence is saved as each person's
  consent. An address already on the list is skipped. Nobody is emailed.
- **A person's page** shows their status, source, consent, referrals and answers.
  **Log a conversation** saves what they told you, with tags. **Send questions** emails them
  up to two questions with a link to answer; their answers appear under **What they said**.
  **Send an email** sends one message. Both sends go only to someone who agreed to hear
  from you and hasn't unsubscribed; otherwise the page says why. Unsubscribing, from the
  link in any of these emails, stops every later email to them, and only they can undo it
  by signing up again. The first time you contact someone they are added to your business's
  contacts as a person.
- **What people say**, under **Results**, summarises your feedback into themes with AI.
  **Summarise** writes it, marked **AI-generated**; summarising the same feedback again
  reuses the last summary. Each theme links to the entries behind it. When a theme suggests
  something your Ideal user is missing, **Update Ideal user** opens the ideal customer page
  with the suggestion: **Accept** adds it as your edit (the ideal customer goes back to
  draft for you to approve), **Reject** changes nothing.
- **Today** shows how many new sign-ups haven't been contacted yet.

### Campaigns

The **Campaigns** section of **Prospects** sends a short sequence of emails to your prospects from your own
mailbox. Nothing is written or sent until you ask for it.

- **New campaign** makes a draft with a starting structure of three emails (an introduction,
  a follow-up 3 days later and a last note 5 days after that). It holds no text yet.
- **Schedule** sets how often the campaign sends: how many emails a day this campaign may
  send (blank uses the mailbox's limit), the days and hours emails go out, and how many
  steps the sequence has (one to five) with the days between each (1 to 30). Each step
  after the first is an email unless you choose **Call**, **WhatsApp** or **LinkedIn** for
  it (see **Steps you do yourself** below). A step you add needs its text written before
  the preview; one that has already been sent or done for someone can't be removed.
  **Audience** renames the campaign and sets who is enrolled. Both can be changed only
  while the campaign is a draft or paused.
- **Audience** shows how many prospects would be enrolled now and why the rest are left
  out, with a count for each reason: no email address, an address marked invalid, already
  in a campaign, asked not to be emailed, and so on. A contact that **Find contacts** found
  is written to only at a company mailbox such as `info@`; otherwise the prospect's general
  company email is used.
- **Write messages** drafts every step from your offering's profile, once for each line of
  work in the audience (the twelve most common) and once for everyone else. Each text is
  labelled **AI-generated**; **Edit** changes it, and it is then labelled as edited by you.
  A message can use the merge fields `{{company}}`, `{{city}}`, `{{line_of_work}}`,
  `{{first_name}}`, `{{offering}}`, `{{sender_name}}` and `{{business_name}}`. A prospect
  with no value for a field a message uses is skipped for that step, with the reason shown;
  it is never sent a message with a gap in it.
- **Sending from** is where you connect the mailbox. Enter its email address and its
  password (or app password) and click **Connect**: that saves them and sends one test
  message to your own account address, and the mailbox is verified only when your mail
  server accepts that message. For a GoDaddy, Google, Microsoft 365 or Zoho mailbox the
  mail servers are filled in from the address, including the incoming server used to read
  replies; a Google mailbox needs an app password. For any other provider, or to change
  what was filled in, open **Server settings**: the outgoing server (SMTP) and its port
  (587 or 465), the incoming server for replies (IMAP), the username, the name emails come
  from, and how many emails a day may go out (30 unless you change it, 200 at most). The
  password is stored encrypted and is never shown again. Your mail provider's own terms
  apply to what you send from the mailbox.
- **Preview** is shown once every step has text and the mailbox is verified; until then its
  place says **Needs setup: connect a mailbox**. The preview shows what activating would
  do: how many prospects would be enrolled and why the rest are left out, the schedule in
  words, and the actual email for a real prospect in each line of work, with the From
  line, the subject, the text with that prospect's own details and the unsubscribe footer.
  The step links and **Previous prospect** / **Next prospect** show the later emails and a
  few more prospects. A prospect whose email would be skipped is shown as skipped, with the
  reason. **Send me a test** sends the email you are looking at to your mailbox's own
  address, marked "[Test]"; it is never sent to the prospect, and you can send five an
  hour. At the bottom, **This looks right** confirms the preview.
- **Personal opening line** (in the Audience fold, off unless you turn it on) starts the
  first email to each prospect with one sentence about that company, written by AI from
  the prospect's record. The rest of the email is your text. The sentence is checked
  before use: one sentence, no links, addresses or phone numbers. The preview shows it,
  marked "The first sentence is AI-generated for this company". If there is no usable
  sentence (for example, your AI usage limit for the month is reached), the preview
  says why and the email goes with your text alone. Each sentence is written once per
  prospect and counts towards your AI usage. Turning it on or off means the preview must
  be confirmed again.
- **Activate** appears only after you confirm the preview. Its confirmation says how many
  prospects are enrolled, how many emails a day go out at most and when, and what stops
  follow-ups. After you confirm, emails are sent without you approving each one: a few
  straight away if it is within the campaign's hours, the rest at the daily check. If you
  change the audience, the schedule, a step or a message after confirming, the preview
  must be confirmed again before the campaign can be activated or resumed.
- **The daily limit** is the mailbox's, shared by all the offering's campaigns. What is
  over it waits for the next day.
- **What stops follow-ups to a prospect:** a reply, a bounce, an unsubscribe, a complaint,
  marking the prospect won or lost, or deleting the contact. Someone who unsubscribes,
  bounces or complains is also added to your do-not-contact list, so no later email from
  your business is sent to that address. If you give an incoming mail server (IMAP) under
  **Sending from**, WonderArk checks the mailbox before each round of sending: it reads
  only replies from people the campaign wrote to and delivery-failure notices about those
  addresses, and leaves the rest of your mail unread and untouched. If the mailbox can't be
  read, nothing is sent until it can, and the page says why. Without an incoming mail
  server, replies are not detected automatically: log the reply on the prospect's page and
  its follow-ups stop.
- **Pause** stops all sending at once; **Resume** starts it again and, like **Activate**, sends up to 5 emails that are already due within your sending days and hours straight away. To change a running
  campaign's messages, schedule or audience, pause it first. A campaign pauses itself
  and says why if more than 8% of at least 20 sent emails bounce, or if your mailbox can't
  be signed in to. **Finish campaign** ends it for good.
- **Results** counts enrolled, sent, bounced, replied, interested and won, and lists each
  prospect with its status, emails sent, and its next step or the reason it stopped. There
  is no "delivered" figure: your own mailbox doesn't report delivery. A send whose outcome
  isn't known is shown as failed with "Outcome unknown" and is never sent again
  automatically.
- A prospect in a running campaign is not also listed under **Follow-ups due** on Today.
- **Steps you do yourself.** A **Call**, **WhatsApp** or **LinkedIn** step is never sent or
  dialled by WonderArk. **Write messages** drafts it with the emails: talking points for a
  call, a short message for WhatsApp or LinkedIn, labelled and editable like any other
  text. When the step is due for a prospect it appears on **Today** with the draft
  and the phone number or LinkedIn page. A WhatsApp number opens a chat with the draft
  filled in only when it is stored with its country code (starting with "+"); if no
  LinkedIn page is stored, the line says so. Do the step yourself, then press **Mark done**
  and choose **Done** or **Couldn't reach**: either is recorded and the prospect moves to
  its next step. The steps after it wait until you do. A call or WhatsApp step for a
  prospect with no phone number is passed over, with the reason shown in **Results**, and
  the prospect moves on to its next step. A reply, an unsubscribe, or marking the prospect
  won or lost stops these steps too. The preview shows each such step as a task for you,
  with the draft for a real prospect. **Results** counts the steps you marked apart from
  emails sent.

Campaigns send only email. Calls and WhatsApp or LinkedIn messages are yours to make.
Sales calls to people who haven't asked for them are regulated in India, including calls to
business numbers, and WhatsApp's policy requires a person's opt-in before a business
messages them first.

### Opportunities (Today's Opportunities)

The **Opportunities** section of **Prospects** sorts the offering's active opportunities into bins,
and shows a bin only when it has something in it: **Hot**, **Needs Review**,
**New**, **Watching** and **Insufficient Evidence**. Each row shows the
company, score, priority, why the offering fits, why now, the primary contact,
confidence, the top signal and the recommended action. Open an opportunity
for its full detail, or use the row's menu: **Edit**, **Research Again**,
**Watch** (moves it to *Watching*), **Exclude** (dismisses it) and **Send to
CRM**.

### Opportunity Intelligence

Each prospect that clears your bar becomes a scored opportunity, with:

- **Signals** — buying-signal events and a correlation record explaining the
  opportunity's signal-strength score.
- **Research** and a synthesized **Research Brief**.
- **Buyer Intelligence** — per-contact seniority/relevance/contactability
  scoring, computing a "primary contact" for you automatically.
- **Prospect score history**, under **History** — recent scoring snapshots.
- **Evidence** — each item tagged First-party or External; **Set override** lets you
  overrule the score.
- A **Recommended Action** (research more, find a better contact, draft a
  message, send to CRM, watch, wait, or dismiss) — AI-suggested, always
  user-overridable.

### Handing off to CRM

From an opportunity, **Send to CRM** hands the lead to the CRM module; on a prospect's page
the button is **Promote to CRM**. WonderArk checks first whether the contact is already
there ("Already promoted to CRM", or an **Already in CRM** badge) instead of creating a
duplicate. If CRM isn't licensed, the button still shows and says "CRM module not licensed
for this business."; nothing else changes.

### Conversions and handing off to Service

Tracks your funnel from prospect to won customer. A won customer can be handed to field
service with **Create opportunity**, which creates a Service opportunity (New, Estimate
scheduled, Estimate sent, Won or Lost); its job and invoice status show on the prospect's
page. If Service isn't licensed, the button says so and offers **Go to licenses**.

## Outreach, replies and unsubscribes

Every outreach message written for one prospect is drafted by AI and sent only when a
person sends it. (A [campaign](#working-an-offering) is the one exception: once you activate it, its
emails go out without you approving each one.) With
[AI approvals](#ai-approvals) set to **Approve automatically**, **Let AI Auto-Populate Info**
approves the outreach strategy for the one prospect it adds so it can draft a message; with
**Review each step** it approves no strategy — see Setup.

On a prospect's page you generate an **Outreach strategy** (why, channel, key message, call
to action), edit it and **Approve strategy**; only then can you **Generate message**. An email
draft is sent with **Approve & send email**; a LinkedIn or WhatsApp draft has **Approve** and
then **Mark sent** once you've sent it yourself. Sending email needs a contact with an email
address and email set up for the deployment. An address a contact lookup marked **Invalid**
can't be sent to; one marked **Risky** or **Not verified** asks you to confirm once before
it sends. If a send fails, the message shows "Send failed"
with the reason, and you can **Retry send**. Emails can use a saved template ("No template
(AI writes freely)" is the default). Pressing send twice sends the email once. When the
offering has a verified mailbox under **Campaigns → Sending from**, these emails go out
from that mailbox too. If a send's outcome can't be confirmed, the message shows as failed
with "Outcome unknown" and is not sent again unless you choose to.

Sending a message (or marking it sent) starts a **Conversation** thread. Use
**Log reply** to record what the prospect said, **Generate reply** for an AI
draft of your response, and **Won** or **Lost** to close the conversation.

The **Feedback** box on a prospect lets you record how it went — Good
prospect, Bad prospect, Wrong person, Wrong timing, Good message, Bad message,
Interested, Not interested, Already customer, Not relevant or Spam — with an
optional note. Feedback is kept as a history, newest first. Replies that arrive by email
are matched to the contact and classified by AI automatically. A reply that asks to
unsubscribe, a bounce and a spam complaint each add the address to your business's
do-not-contact list.

**Unsubscribe and opt-outs.** Every outreach email to a prospect or investor
is sent with a one-click unsubscribe option that mail apps can offer, and
emails written in WonderArk (not template sends) also carry an **Unsubscribe** link in the
footer.
When a recipient unsubscribes, WonderArk records the opt-out for your
business — it keeps only a one-way fingerprint of the address, not the address
itself — and will not email that address again from your business. If you try,
the message is not sent and shows as failed with the reason "This contact
unsubscribed from your emails, so it wasn't sent." (for an investor: "This
investor unsubscribed from your emails, so it wasn't sent."). Opt-outs apply to
all of the business's outreach, including Funding.

## Watchlist

Watching an *opportunity* (the **Watch** action on the Opportunities page) just
changes that opportunity's status. The **Watchlist** section of **Prospects** is a separate,
deliberate list of *accounts* you want to keep an eye on.

1. Open an account from **Prospects**.
2. Use **Watch this account**, giving a **Watch reason** (for example "Close
   to budget approval") and, optionally, a **Next review** date.
3. Come back to **Watchlist**: each watched account shows its watch
   reason, current score, latest signal and next review date. The score and
   signal are read live from the account, so they are never out of date.

On the account, **Update watch** changes the reason or review date and **Stop
watching** removes it. The list can be exported. A watch belongs to the
offering you set it in.

## Performance analysis and run history

**Results** answers "what's actually working for this offering?"
from everything discovered so far: which signals produce conversations, which
ICP attributes produce conversions, which buyer roles respond, and whether a
higher score really correlates with better outcomes, and which Discovery Plays perform
best. It can be exported as a report.

The **History** section of **Find** is the audit list of every AI Discovery run for the
offering — what started it (Run AI Discovery, Retry failed stage, or Save &
Run Downstream), its status (Running, Completed, Failed, or Waiting for review when it
stopped for your approval) and how long it
took. Open a run for the stages it executed and the full error text if it
failed.

## Marketing

Marketing works across the whole business, not per offering, and uses the
same customers, offerings and prospects as the rest of Discovery.

- **Dashboard** — campaign performance, content in flight, and a list of
  what needs attention (content awaiting approval, campaigns ending soon,
  metrics to update).
- **Strategy** — your positioning, audiences, channels and goals. Saving keeps a version
  history; **Activate** makes a version the live one.
- **Campaigns** — plan a campaign with its channels, budget and dates, track its metrics
  (on the campaign's page, **Import from a CSV export** of your ad or analytics tool — up to
  1,000 rows with a `date` column; rows that can't be read are listed, not dropped), and see
  which prospects and customers it influenced.
- **Content** — write posts, emails and pages, or use the AI: **Generate from brief**,
  **Rewrite**, **Suggest SEO** and **Repurpose**. Content moves **Idea → Draft → In review →
  Approved → Scheduled / Published**; scheduling needs a date. Approving and publishing need
  the `marketing.approve` permission, and editing approved content sends it back to Draft.
  **Mark as published** records that you published it — WonderArk doesn't post to any
  channel. Published content can't be edited; duplicate it to write a new version. A
  **calendar** view shows what's scheduled when.
- **Assets** — upload images and files (up to 4 MB each) to reuse.
- **Website & SEO** — a summary of your crawled website, plus SEO opportunities and AI-search
  observations you record yourself. It doesn't track rankings or keywords.
- **Analytics** — channel and campaign figures in one place.

Nothing is ever published or sent automatically: AI drafts, a person approves.

## Funding

Funding helps you get ready for and run a raise.

- **Dashboard** — your round's progress, the investor pipeline and what
  needs attention next.
- **Funding Profile** — the company story investors ask for: stage, traction,
  team, use of funds. If Finance is licensed, key figures (revenue, burn,
  cash) are read from your books and shown as "From Finance"; otherwise you enter them.
- **Investor Readiness** — a checklist score across the areas investors check, with what's
  missing. **Add standard checklist** adds the usual items, each Missing until reviewed.
- **Fundraising** — create a round (target, instrument, dates) and move it through its
  stages. A round needs a target amount before it can open.
- **Investors** — your investor list, with research on each (labelled Source-backed,
  User-entered or AI-inferred). Investors move
  through the pipeline **Identified → Researched → Target → Contacted →
  Meeting → Partner review → Due diligence → Term discussion → Committed →
  Invested** (or **Passed**). Forward moves can skip stages; amounts are
  required once an investor commits, and **Invested** needs the amount received.
- **Investor Outreach** — draft outreach (the AI can help) and log replies. **Submit for
  approval** → **Approve** → **Send to <email>**; approving and sending need
  `funding.approve`. If a send fails, move it back to draft, fix it and approve again. Emails carry an unsubscribe
  option, and an investor who unsubscribes is not emailed again — the send
  shows as failed with that reason (see "Outreach, replies and unsubscribes").
- **Data Room** — upload documents (pitch deck, financials, legal; up to 4 MB each) by
  category; a new version keeps the old one. New uploads start as drafts, and only
  documents marked **Ready** can be shared. A share link lasts 1–90 days (14 by default), is
  shown once, and can be revoked at any time. Uploading needs `funding.manage` and
  `funding.data_room.manage`; sharing needs `funding.approve` and `funding.data_room.share`.
- **Due Diligence** — track each investor's requests: Open, In progress, Submitted,
  Accepted, Needs clarification or Closed. Accepting needs `funding.approve`.
- **Analytics** — conversion through the pipeline and how the round is
  tracking.

## Who can do what

| Permission | Allows |
|---|---|
| `discovery.view` | Open Discovery and read everything in it |
| `discovery.manage` | Create and edit offerings, prospects, research and outreach |
| `marketing.view` / `funding.view` | Read Marketing / Funding |
| `marketing.manage` / `marketing.approve` | Work on marketing / approve and publish it |
| `funding.manage` / `funding.approve` | Work on funding / approve and send investor outreach, share the data room, accept diligence |
| `funding.data_room.manage` / `funding.data_room.share` | Upload to / share the data room |
| `discovery.export`, `marketing.export`, `funding.export` | Export lists to CSV or Excel |

A **Viewer** can read all of Discovery but change nothing. See [Users, roles and
invitations](/help/getting-started#users-roles-and-invitations).

## Licensing

Discovery is licensed like every other module — see [Licensing a
module](/help/getting-started#licensing-a-module). There's no Discovery-specific activation
step.
