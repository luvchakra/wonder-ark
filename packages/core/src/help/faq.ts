import type { HelpGuide } from "./types";

/**
 * The questions people actually arrive with, answered in a couple of sentences and then
 * pointed at the section that covers them properly.
 *
 * Hand-written rather than generated: a FAQ is not a summary of the documentation, it is
 * the set of things the documentation's structure makes hard to find. Every entry has to
 * point at a real section -- `faq.test.ts` fails the build if one doesn't, so a renamed
 * heading can't quietly leave a dead answer behind.
 */

export type FaqCategory =
  | "Account & access"
  | "Businesses & modules"
  | "Billing & AI"
  | "Day to day"
  | "For administrators";

export type FaqEntry = {
  question: string;
  answer: string;
  guideSlug: HelpGuide["slug"];
  sectionId: string;
  category: FaqCategory;
};

export const FAQ: FaqEntry[] = [
  {
    category: "Account & access",
    question: "I forgot my password. How do I get back in?",
    answer:
      "Use the \"Forgot password?\" link next to the password box on the login page. You'll get an email with a link to set a new one. If the link says it's invalid or expired, request a fresh one — a reset link is single-use, and it has to be opened in the same browser that asked for it unless your deployment uses the token-based email template.",
    guideSlug: "getting-started",
    sectionId: "creating-an-account",
  },
  {
    category: "Account & access",
    question: "Can I sign in with Google, Microsoft or LinkedIn instead of a password?",
    answer:
      "Yes, when the deployment you're using has them switched on: the login and sign-up pages then show Continue with Google, Continue with Microsoft and Continue with LinkedIn. There is no separate sign-up step — your first sign-in creates the account and takes you to your dashboard (or back to your invitation, if you came from one). You can add a password later with \"Forgot password?\".",
    guideSlug: "getting-started",
    sectionId: "creating-an-account",
  },
  {
    category: "Account & access",
    question: "Why can't I see the \"Continue with Google\", \"Microsoft\" or \"LinkedIn\" button?",
    answer:
      "A button only appears when that sign-in method has been switched on for this deployment, so you are never shown one that can't work. Use your email and password in the meantime. Whoever operates the deployment can switch each one on with a configuration change — no redeploy needed, and the button appears within a few minutes.",
    guideSlug: "getting-started",
    sectionId: "creating-an-account",
  },
  {
    category: "Account & access",
    question: "How do I download a copy of my own personal data?",
    answer:
      "Open the avatar menu → Profile and choose Download my data at the bottom. You get a JSON file with your sign-in details, profile, memberships and the actions recorded under your name. Records you created for a business, such as its customers or invoices, belong to that business and are exported from each module with its Export button.",
    guideSlug: "getting-started",
    sectionId: "your-profile-your-data-and-appearance",
  },
  {
    category: "Account & access",
    question: "Can I see what I'm typing in the password box?",
    answer:
      "Yes — the eye icon at the right-hand end of any password box reveals what you've typed, and hides it again. It always starts hidden, on every page and every visit.",
    guideSlug: "getting-started",
    sectionId: "creating-an-account",
  },
  {
    category: "Account & access",
    question: "Someone on my team can't see a page I can see. Why?",
    answer:
      "Two things gate every page: whether the business has that module licensed, and whether the person's role carries the permission. In the sidebar both look the same — the module is locked. An unlicensed module's page says it \"isn't part of your plan yet\"; opening a page their role doesn't allow says they don't have permission. Check the member's role under avatar menu → Admin → your business → Users & access.",
    guideSlug: "getting-started",
    sectionId: "users-roles-and-invitations",
  },
  {
    category: "Account & access",
    question: "How do I invite someone to my business?",
    answer:
      "Avatar menu → Admin → your business → Users & access → Invite user. Enter their email and choose a role. The invitation link works for 7 days, only for that email address, and only once; someone without an account can sign up from the link and is brought straight back to accept it.",
    guideSlug: "getting-started",
    sectionId: "users-roles-and-invitations",
  },
  {
    category: "Account & access",
    question: "Can I create a role that fits my team exactly?",
    answer:
      "Yes. Under Users & access → Roles, Create role starts a custom role, blank or from a template (Business Admin, Sales Manager, Finance Manager, Field Technician and others), that you then adjust. You can't grant permissions you don't hold yourself.",
    guideSlug: "getting-started",
    sectionId: "users-roles-and-invitations",
  },
  {
    category: "Businesses & modules",
    question: "What's the difference between a business and an offering?",
    answer:
      "A business is the company — one inventory, one tax registration, one crew, one customer ledger. An offering is a product or service line you market, and only Discovery works per-offering. Most modules are per-business; Discovery is the exception.",
    guideSlug: "getting-started",
    sectionId: "businesses-offerings-and-why-there-are-two-concepts",
  },
  {
    category: "Businesses & modules",
    question: "How do I switch between businesses?",
    answer:
      "Use the business switcher in the top bar. It shows each business's own logo (or a generic icon) and your role on it, and chips switch between an organization's environments. The sidebar and everything in it reloads for the business you pick.",
    guideSlug: "getting-started",
    sectionId: "switching-between-businesses-and-modules",
  },
  {
    category: "Businesses & modules",
    question: "How do I turn a module on or off for a business?",
    answer:
      "Open avatar menu → Admin (or Licenses on the Executive Dashboard), expand the business's Licenses chip and use Activate, Cancel or Reactivate on the module. You need permission to manage billing, and once online checkout is available a module can only be switched on if your plan includes it — otherwise choose a plan that does. Cancelling never deletes data: you get a read-only grace period (30 days unless the platform sets longer), after which access stops but every row is kept. Reactivating restores everything, including events that were parked while it was off.",
    guideSlug: "getting-started",
    sectionId: "licensing-a-module",
  },
  {
    category: "Businesses & modules",
    question: "Do I have to license every module for the platform to work?",
    answer:
      "No. Nothing hard-depends on anything else. A feature that would normally show another module's data just leaves that section out when it isn't licensed, rather than failing. Finance works with hand-entered bills whether or not Inventory or Service is on.",
    guideSlug: "finance",
    sectionId: "working-without-the-other-modules",
  },
  {
    category: "Billing & AI",
    question: "Do I need my own AI API key?",
    answer:
      "Only if you want your AI usage billed to your own provider account. Otherwise the included credits are used automatically. Connect your own OpenAI, Anthropic or Google Gemini key from avatar menu → Billing if you'd rather use it; your own key always wins when one is connected. With your own key there's no monthly allowance; on the included credits it's 200 AI runs or $20 per offering.",
    guideSlug: "discovery",
    sectionId: "connecting-an-ai-provider",
  },
  {
    category: "Billing & AI",
    question: "Where do I see what AI has cost me?",
    answer:
      "Avatar menu → Usage breaks down AI runs and credit consumption per business and offering (each business's Business page also has an AI usage button). Repeatable AI operations are cached, so asking for the same thing twice doesn't bill twice.",
    guideSlug: "getting-started",
    sectionId: "plans-billing-and-ai-credits",
  },
  {
    category: "Billing & AI",
    question: "How do I change or cancel my plan?",
    answer:
      "Open your business's Billing page. Change plan (Upgrade plan on a free plan) takes you through choosing a plan, reviewing it and paying securely; Cancel subscription keeps full access until the end of the paid period, then the modules become read-only for 30 days. Your data is never deleted.",
    guideSlug: "getting-started",
    sectionId: "plans-billing-and-ai-credits",
  },
  {
    category: "Billing & AI",
    question: "What happens when I use up the free AI allowance, and how do I buy more?",
    answer:
      "Each offering has a monthly allowance of 200 AI runs or $20 of AI cost, whichever comes first. When it is used up, credits you have bought are spent automatically, one run at a time; with none left, AI features pause until next month. To buy more, open avatar menu → Billing and choose a credit pack — Starter, Growth or Scale. Credits are shared by every business and offering on your account. If you connect your own provider key there is no cap from WonderArk.",
    guideSlug: "getting-started",
    sectionId: "plans-billing-and-ai-credits",
  },
  {
    category: "Billing & AI",
    question: "My payment didn't go through. Was I charged?",
    answer:
      "No. A checkout that is cancelled or fails changes nothing: you stay on your current plan and the page says \"Checkout cancelled\" or \"Payment didn't go through\", with a Try again button. If your plan renewal is what failed, the Billing page shows a \"Payment needs attention\" banner and Update payment method. Your subscription only shows as active once the payment is confirmed.",
    guideSlug: "getting-started",
    sectionId: "plans-billing-and-ai-credits",
  },
  {
    category: "Day to day",
    question: "My balance sheet doesn't balance. What's wrong?",
    answer:
      "Almost always a missing line rather than a broken ledger: until the year is closed, the period's own profit hasn't moved into retained earnings. WonderArk shows it as its own equity line for exactly this reason — check you're reading that line, and check the trial balance agrees.",
    guideSlug: "finance",
    sectionId: "financial-reports",
  },
  {
    category: "Day to day",
    question: "I made a mistake in a journal entry. Can I edit it?",
    answer:
      "No, and that's deliberate. Correction is by reversal: reverse the entry and post a correct one, so both halves stay in the account's history where an audit can see them. A locked period can be reopened; a filed or closed one can't.",
    guideSlug: "finance",
    sectionId: "accounting-periods",
  },
  {
    category: "Day to day",
    question: "An invoice didn't show up in my ledger. Why not?",
    answer:
      "Check the Finance dashboard's unposted documents list — it names the reason. The two common ones are a chart of accounts that hasn't been set up yet, and a document with no accounting consequence. Neither is a retryable error, so they surface on screen instead of being retried silently.",
    guideSlug: "finance",
    sectionId: "the-journal-and-automatic-posting",
  },
  {
    category: "Day to day",
    question: "Does WonderArk file my tax return for me?",
    answer:
      "No. It prepares the return — the sales and purchase registers, the reconciliation against GSTR-2B, and a readiness check across the ledger, bank and period lock. Submitting to the tax authority is still something you or your accountant do.",
    guideSlug: "finance",
    sectionId: "tax-day-to-day-workflows",
  },
  {
    category: "Day to day",
    question: "Why won't the bank import match my transactions automatically?",
    answer:
      "It suggests, it never decides. A wrong automatic match hides a real missing entry behind a plausible one, and nobody re-checks a transaction already ticked off. The amount is a gate, candidates come back ranked with reasons, and you confirm each one.",
    guideSlug: "finance",
    sectionId: "banking",
  },
  {
    category: "Day to day",
    question: "How do I import my products or my prospect list?",
    answer:
      "Both have a bulk import. Inventory takes pasted CSV text with at least `sku` and `name` (Products → Import); Discovery accepts CSV, Excel or PDF and uses AI to map whatever columns your file has onto its own fields.",
    guideSlug: "inventory",
    sectionId: "setup-order",
  },
  {
    category: "Day to day",
    question: "A payment was recorded by mistake. Can I edit or delete it?",
    answer:
      "No — recorded payments are never edited or deleted. Void it instead: on the Service invoice, choose Void payment on that payment, give a reason, and confirm. What it paid becomes owed again, Finance reverses the entries it posted, and the payment stays in the history marked Voided. You need the permission to void payments (Owner, Admin and Accountant by default), and the person who recorded the payment can't void it themselves unless they are an Owner or Admin.",
    guideSlug: "service-fsm",
    sectionId: "correcting-a-payment-void-never-edit",
  },
  {
    category: "Day to day",
    question: "Why did my outreach email fail with \"unsubscribed\"?",
    answer:
      "The recipient used the unsubscribe link (or their mail app's one-click unsubscribe) in an earlier email from your business, so WonderArk will not email that address again. The message is not sent and shows as failed with that reason. Opt-outs apply to all of the business's outreach, prospects and investors alike.",
    guideSlug: "discovery",
    sectionId: "outreach-replies-and-unsubscribes",
  },
  {
    category: "Day to day",
    question: "Why did Run AI Discovery stop and leave my ICP as a draft?",
    answer:
      "Your business's AI approvals setting is Review each step (the default), so the AI's own results wait for you: approve the ICP on the ICP page, add the accounts it found on the Discover page, then click Resume AI Discovery. An owner or admin can switch to Approve automatically on the Business page under AI approvals. Nothing is sent to anyone in either mode.",
    guideSlug: "discovery",
    sectionId: "ai-approvals",
  },
  {
    category: "Day to day",
    question: "How do I keep an eye on one particular account?",
    answer:
      "Open the account from Prospects and use Watch this account, with a reason and, if you like, a next review date. The offering's Watchlist tab then lists it with its watch reason, current score, latest signal and next review date. This is separate from the Watch action on an opportunity, which only changes that opportunity's status.",
    guideSlug: "discovery",
    sectionId: "watchlist",
  },
  {
    category: "Day to day",
    question: "How can customers request service or approve an estimate without an account?",
    answer:
      "Through links. Estimates and invoices are sent as links to a page where the customer can approve or decline (estimates) or see what they owe (invoices). If you switch on the customer center in Service Settings, a customer you send access to (an emailed link that works for 30 days) can see their upcoming work, estimates and invoices in one place. Switch on the contact form and your business gets a public request form; each submission arrives as a new Service opportunity.",
    guideSlug: "service-fsm",
    sectionId: "customer-facing-pages",
  },
  {
    category: "Day to day",
    question: "How do I enter a budget?",
    answer:
      "Finance → Budget → Set budget. Pick the fiscal year, type a monthly amount for each income, cost of sales and expense account you want to track, and click Save. A blank month means no budget. You need permission to edit the chart of accounts (Owner, Admin, Accountant and Finance Manager have it).",
    guideSlug: "finance",
    sectionId: "budget-and-recurring-entries",
  },
  {
    category: "Day to day",
    question: "Can WonderArk reply to customers automatically?",
    answer:
      "Only with one fixed acknowledgement, and only if you turn it on: set Instant reply to \"Instant acknowledgment, then human\" (CRM → WhatsApp for WhatsApp, CRM → Channels for Instagram and Messenger). The first message from a contact in 24 hours gets your acknowledgement text; a person still answers. AI never sends anything on its own.",
    guideSlug: "crm",
    sectionId: "instant-acknowledgement",
  },
  {
    category: "Day to day",
    question: "How do I see how quickly we respond to customers?",
    answer:
      "CRM → Analytics shows the last 30 days: median first response, SLA compliance, unresolved interactions by age, and response time per channel and per team member. CRM → Potential Lost Business lists the unanswered commercial messages that might be lost if nobody replies.",
    guideSlug: "crm",
    sectionId: "daily-workflows",
  },
  {
    category: "Day to day",
    question: "A page shows a table on my laptop but cards on my phone. Is that a bug?",
    answer:
      "No, that's the intended behaviour platform-wide. Below the tablet breakpoint every table becomes one card per row with labelled fields, rather than a table you'd have to scroll sideways through or squint at.",
    guideSlug: "getting-started",
    sectionId: "switching-between-businesses-and-modules",
  },
  {
    category: "Day to day",
    question: "How do I export a list to Excel?",
    answer:
      "Use the Export button in the page header and choose CSV or Excel. A list gives you exactly what you're looking at, with your filters applied (long lists also let you export all matching records); a report gives the main table as CSV or the full workbook as Excel. Large exports run in the background: you'll see \"Export queued\", and the bell shows \"Export ready\" with a download link when the file is done.",
    guideSlug: "getting-started",
    sectionId: "exporting-your-data",
  },
  {
    category: "Day to day",
    question: "Why can't I publish the content I wrote?",
    answer:
      "Publishing and approving need the marketing.approve permission, and only approved content can be published. Editing approved content sends it back to Draft, so what goes out is always what was approved.",
    guideSlug: "discovery",
    sectionId: "marketing",
  },
  {
    category: "Day to day",
    question: "How do I share our data room with an investor?",
    answer:
      "In Funding → Data Room, upload the documents and mark them Ready (new uploads start as drafts), then share with the investor. The link lasts 1–90 days (14 by default), is shown once, and can be revoked at any time. Sharing needs the funding.approve and funding.data_room.share permissions.",
    guideSlug: "discovery",
    sectionId: "funding",
  },
  {
    category: "Day to day",
    question: "How do I see the transactions behind a figure on a report?",
    answer:
      "Click the line. Every figure on the Profit & Loss, Balance Sheet, Cash Flow and Trial Balance opens that account for the same period, and the entries listed add up to the number you clicked.",
    guideSlug: "finance",
    sectionId: "financial-reports",
  },
  {
    category: "Day to day",
    question: "Can Finance remember how I categorise recurring bank lines?",
    answer:
      "Yes — add a bank rule under Banking → Rules (for example, \"description contains AWS → Software\"). Matching lines then show the rule, and Post and match posts and matches in one click. Rules only suggest; nothing posts until you confirm.",
    guideSlug: "finance",
    sectionId: "banking",
  },
  {
    category: "For administrators",
    question: "Can I release a feature to a few businesses first, and undo it?",
    answer:
      "Yes, if you're a platform superadmin. On Platform → Feature Flags, open a flag's Rollout and pick a stage: Internal, Pilot, Selected Plans or All Customers. Roll back returns it to the previous rollout, or turns it off when there is none. Each change needs a reason and is recorded.",
    guideSlug: "getting-started",
    sectionId: "the-superadmin-platform-portal",
  },
  {
    category: "For administrators",
    question: "What's the difference between Admin and the Platform portal?",
    answer:
      "Admin (in the avatar menu) is your own account's business and module configuration. The Platform portal is the superadmin control plane for the whole deployment — branding, plans, feature flags, AI providers — and only platform superadmins can reach it.",
    guideSlug: "getting-started",
    sectionId: "the-superadmin-platform-portal",
  },
  {
    category: "For administrators",
    question: "Where do I set the AI key for the whole deployment?",
    answer:
      "The Platform portal's AI Providers page. A key set there is used by every account that hasn't connected its own, and you can change it without a redeploy.",
    guideSlug: "getting-started",
    sectionId: "the-superadmin-platform-portal",
  },
  {
    category: "Day to day",
    question: "Can WhatsApp AI replies be sent without a person?",
    answer:
      "Only if you turn it on: CRM → WhatsApp → AI replies → Send automatically (needs the channel-connections permission). The default, Draft for review, never sends on its own. Automatic replies answer only from your business details and products and prices, only when the AI is confident and the topic isn't a complaint, refund, payment, cancellation, order change or opt-out, inside WhatsApp's 24-hour window, at most 100 a day per business and 3 a day per conversation, never to a customer who sent STOP, and at most once per message. Anything not sent automatically stays for a person, as in Draft for review.",
    guideSlug: "crm",
    sectionId: "ai-drafted-whatsapp-replies",
  },
  {
    category: "For administrators",
    question: "How do I connect WhatsApp or Instagram to the shared inbox?",
    answer:
      "WhatsApp connects on CRM → WhatsApp (phone number ID and access token); Instagram and Facebook Messenger connect on CRM → Channels. Connecting checks the token with Meta straight away; incoming messages also need the Meta app's webhook secrets set as environment variables on the deployment. The WhatsApp screen also holds your message templates and click-to-chat links, which count the conversations each link brings in.",
    guideSlug: "crm",
    sectionId: "connecting-a-channel-whatsapp-instagram-facebook",
  },
  {
    category: "For administrators",
    question: "Can I call WonderArk from my own systems?",
    answer:
      "Yes — create an API key from a business's Admin → API Keys screen. A key belongs to one business and can do what its creator's role could do when it was created. The same key connects an AI agent through WonderArk's MCP server (/api/mcp).",
    guideSlug: "getting-started",
    sectionId: "api-keys",
  },
];

export const FAQ_CATEGORIES: FaqCategory[] = [
  "Account & access",
  "Businesses & modules",
  "Billing & AI",
  "Day to day",
  "For administrators",
];
