import { BRAND_NAME } from "@cofounderai/core/lib/brand";
import { CONTACT_EMAIL, WEBSITE_URL } from "./legal";

/**
 * The words on /terms and /privacy. Each document is a list of sections, rendered in
 * order with an anchor per section (so a support reply can link straight to "Your data")
 * by the same Markdown subset the user guides use (components/help/markdown.tsx):
 * paragraphs, bullet lists, **bold** and [links](...).
 *
 * Everything stated here is meant to be true of the product as built — the data-retention
 * wording follows ADR-9 (cancelling a module never deletes data), the security wording
 * follows the RLS/AES-256-GCM implementation, the service-provider list follows the
 * integrations that actually exist. Change the product, change this file; and bump
 * LEGAL_LAST_UPDATED in lib/legal.ts whenever the wording here changes.
 */
export type LegalSection = { id: string; title: string; body: string };

const email = `[${CONTACT_EMAIL}](mailto:${CONTACT_EMAIL})`;

export const TERMS_INTRO = `These Terms of Service ("Terms") govern your use of ${BRAND_NAME} — the website at ${WEBSITE_URL}, the ${BRAND_NAME} web application, and every module offered through it (together, the "Service"). The Service is provided by ${BRAND_NAME} ("${BRAND_NAME}", "we", "us"). By creating an account or using the Service you agree to these Terms. If you use the Service on behalf of a company or other organisation, you confirm that you are authorised to accept these Terms for it, and "you" means that organisation.`;

export const TERMS_SECTIONS: LegalSection[] = [
  {
    id: "accounts",
    title: "Your account",
    body: `- You must be at least 18 years old and able to enter into a binding contract to use the Service.
- Give us accurate information when you sign up, and keep it up to date.
- Keep your password and sign-in methods secure. You are responsible for everything done through your account, including by people you invite to your businesses.
- Tell us straight away at ${email} if you believe your account has been accessed without your permission.
- The Service is for business use. You may not resell it or give access to anyone outside your organisation other than the team members you invite through the product.`,
  },
  {
    id: "service",
    title: "The Service and its modules",
    body: `${BRAND_NAME} is one portal with separately licensed modules — currently Discovery (customer acquisition, marketing and funding), Inventory, Service (field service management), CRM and Finance/GST compliance. You can use only the modules licensed to your business.

We keep improving the Service, so features may be added, changed or retired over time. If we remove a feature you pay for in a way that materially reduces what you get, we will tell you in advance where we reasonably can.

Some features may be labelled beta or preview. They are provided for evaluation, may change without notice and may not be covered by support.`,
  },
  {
    id: "fees",
    title: "Plans, fees and payment",
    body: `- Current plans and prices are shown on our [pricing page](/pricing). Prices are in Indian Rupees (INR) and exclude applicable taxes such as GST, which are added where required.
- Paid plans are billed in advance for each billing period and renew automatically until cancelled. Fees are not refundable for a partly used period, except where the law requires otherwise.
- AI credit packs are prepaid. Purchased runs stay on your account until used and are not refundable or transferable.
- If a payment fails or is overdue, we may suspend paid features after giving you notice. Your data is kept while an account is suspended (see "Cancellation and your data").
- We may change our prices. A change will not affect a billing period you have already paid for, and we will give you at least 30 days' notice before it applies to you.`,
  },
  {
    id: "cancellation",
    title: "Cancellation and your data",
    body: `You can stop using a module or the whole Service at any time.

- **Cancelling a module never deletes its data.** For 30 days after a module licence ends, its data stays available to you read-only. After that, access to the module is paused but the data is kept, and reactivating the licence restores everything.
- **Closing your account.** Email ${email} from the account owner's address. We will delete or anonymise your data within 90 days of confirming the request, except for anything we must keep by law (for example, tax and invoicing records) or that remains in encrypted backups until they expire.
- **Getting a copy of your data.** Before you leave, you can export records wherever a module offers an export, or email us and we will provide a copy of your data.`,
  },
  {
    id: "your-data",
    title: "Your data",
    body: `"Customer Data" means everything you or your team put into the Service — businesses, contacts, prospects, customers, inventory, jobs, invoices, marketing content, investor records, uploaded files and messages.

- **You own your Customer Data.** You give us permission to host, copy, process and display it only as needed to run the Service for you, to keep it secure, and to meet our legal obligations.
- **You are responsible for having the right to use it.** When you add personal data about other people (for example prospects, customers, employees or investors), you are responsible for having a lawful basis to collect and use it, and for giving any notices the law requires. For that data we process it on your behalf and under your instructions.
- We do not sell your Customer Data, and we do not use it to train AI models.

Our [Privacy Policy](/privacy) explains how we handle personal data in more detail.`,
  },
  {
    id: "acceptable-use",
    title: "Acceptable use",
    body: `You agree not to use the Service to:

- send spam or unsolicited bulk messages, or contact people in breach of applicable anti-spam, telemarketing or data-protection laws — every outreach email you send must be lawful and honour opt-out requests;
- upload or share anything unlawful, infringing, defamatory, or that you do not have the right to share;
- break the terms of third-party services you connect (for example email providers, WhatsApp, Instagram or Facebook);
- try to access another business's data, probe or test the security of the Service without our written permission, or interfere with its operation;
- copy, reverse-engineer or resell the Service, or scrape it with automated tools;
- carry out any activity that is fraudulent or illegal.

We may remove content or suspend access that breaks these rules. Where it is reasonable to do so, we will tell you first and give you a chance to fix the problem.`,
  },
  {
    id: "ai",
    title: "AI features",
    body: `Several features use artificial intelligence to draft, summarise, research or suggest content. AI output can be incomplete or wrong. Review it before you rely on it or send it to anyone — you are responsible for what you publish or send.

When you use an AI feature, the content needed for that request is sent to the AI provider that serves it (OpenAI, Anthropic or Google). If you connect your own provider API key, your provider's terms and charges apply to that usage. AI usage is subject to the limits of your plan.`,
  },
  {
    id: "not-advice",
    title: "No professional advice",
    body: `The Service helps you run your business; it does not replace professional advice.

- **Tax and compliance.** GST, e-invoicing, e-way bill and other compliance features are tools to help you prepare and file. You remain responsible for the accuracy of your returns and filings and for meeting your deadlines.
- **Funding.** The Funding features help you organise a fundraise — your investor pipeline, outreach, data room and diligence. They are not investment, legal or securities advice, and ${BRAND_NAME} is not a broker, exchange or fundraising platform. You are responsible for complying with the laws that apply to any offer of securities you make.
- **Accounting and financial reports** are produced from the data you enter; check them with a qualified professional before relying on them.`,
  },
  {
    id: "third-parties",
    title: "Third-party services",
    body: `The Service works with third-party services — for example Google sign-in, email delivery, payment processing, messaging channels and AI providers. Your use of a third-party service is governed by that provider's own terms, and we are not responsible for the services they provide. If a third-party service changes or stops being available, the related feature of ${BRAND_NAME} may stop working.`,
  },
  {
    id: "availability",
    title: "Availability and support",
    body: `We work to keep the Service available and secure, but we do not promise that it will be uninterrupted or error-free. We may carry out maintenance, which we will try to schedule to keep disruption low. Support is provided by email at ${email} unless your plan includes something more.`,
  },
  {
    id: "ip",
    title: "Our intellectual property",
    body: `The Service, including its software, design, text and branding, belongs to ${BRAND_NAME} and its licensors. These Terms give you the right to use the Service while your account is active; they do not transfer any ownership to you. If you send us feedback or suggestions, we may use them without any obligation to you.`,
  },
  {
    id: "disclaimers",
    title: "Disclaimers",
    body: `To the extent the law allows, the Service is provided "as is" and "as available", without warranties of any kind, whether express or implied, including warranties of merchantability, fitness for a particular purpose and non-infringement.`,
  },
  {
    id: "liability",
    title: "Limitation of liability",
    body: `To the extent the law allows:

- neither party is liable to the other for indirect, incidental, special or consequential losses, or for loss of profits, revenue, goodwill or data, however caused;
- our total liability arising out of or relating to the Service or these Terms is limited to the amount you paid us for the Service in the 12 months before the event that gave rise to the claim.

Nothing in these Terms limits liability that cannot be limited by law, such as liability for fraud.`,
  },
  {
    id: "indemnity",
    title: "Indemnity",
    body: `You agree to indemnify ${BRAND_NAME} against claims, losses and reasonable costs arising from your Customer Data, from your breach of these Terms, or from your breach of any law or third-party right in your use of the Service.`,
  },
  {
    id: "termination",
    title: "Suspension and termination",
    body: `We may suspend or end your access if you seriously or repeatedly break these Terms, if you do not pay fees that are due, or if we are required to by law. Where it is reasonable to do so, we will give you notice and time to put things right first. Your data is then handled as described in "Cancellation and your data".`,
  },
  {
    id: "changes",
    title: "Changes to these Terms",
    body: `We may update these Terms from time to time. The date at the top of this page shows when they last changed. If a change materially affects your rights, we will tell you by email or in the product at least 30 days before it takes effect. If you keep using the Service after that, the updated Terms apply.`,
  },
  {
    id: "law",
    title: "Governing law",
    body: `These Terms are governed by the laws of India. Any dispute will be subject to the exclusive jurisdiction of the competent courts in India. Before starting any formal proceedings, both parties agree to try to resolve the dispute in good faith by contacting each other.`,
  },
  {
    id: "contact",
    title: "Contact",
    body: `Questions about these Terms? Email us at ${email}.`,
  },
];

export const PRIVACY_INTRO = `This Privacy Policy explains how ${BRAND_NAME} ("we", "us") collects, uses, shares and protects personal data when you visit ${WEBSITE_URL} or use the ${BRAND_NAME} application (the "Service"), and the choices you have. It is written to meet India's Digital Personal Data Protection Act, 2023 and the Information Technology Act, 2000 and its rules.`;

export const PRIVACY_SECTIONS: LegalSection[] = [
  {
    id: "roles",
    title: "Who is responsible for your data",
    body: `- **Your account information** — your name, email address and how you use ${BRAND_NAME} — is handled by us, and we decide how it is used. This policy covers it.
- **Customer Data** — the records a business puts into the Service, such as its prospects, customers, contacts, employees and investors — belongs to that business. We process it on the business's behalf and only under its instructions. If your details are held in a business's ${BRAND_NAME} account and you want to access, correct or delete them, please contact that business; we will help them respond.
- **Emails a business sends you through ${BRAND_NAME}** — such as outreach to prospects or investors — carry an unsubscribe link. One click stops further emails from that business through the Service; we keep only a one-way fingerprint of your address so the opt-out is honoured, not the address itself.`,
  },
  {
    id: "collect",
    title: "What we collect",
    body: `- **Account details:** your name, email address and password (stored only as a secure hash by our authentication provider). If you sign in with Google, we receive your name, email address and profile picture from Google.
- **Business details:** your business name, address, contact details and registration details such as a GSTIN, and the team members you invite.
- **Content you add:** the records, messages and files you and your team enter or upload — for example prospects, contacts, inventory, jobs, invoices, marketing content, investor records and data-room documents.
- **Messages sent through the Service:** emails you send from ${BRAND_NAME} and the replies they receive, and — if you connect them — messages from channels such as WhatsApp, Instagram or Facebook.
- **Payment details:** when you buy something, our payment provider (Razorpay) collects your card or bank details. We receive only the payment status, amount and reference numbers — never your full card number.
- **AI provider keys:** if you connect your own AI provider API key, we store it encrypted.
- **Technical information:** your IP address, browser and device type, and logs of requests and errors, which our hosting providers record so the Service can run securely.`,
  },
  {
    id: "use",
    title: "How we use it",
    body: `We use personal data to:

- create and secure your account and sign you in;
- provide the Service and its features, including the modules your business licenses;
- send service messages, such as sign-up confirmation, password resets, security notices and messages you ask the Service to send;
- process payments and keep billing and tax records;
- provide support and respond to your requests;
- monitor, protect and improve the Service, including preventing fraud and abuse;
- meet our legal obligations.

We do not sell personal data, we do not show advertising in the Service, and we do not use your Customer Data to train AI models.`,
  },
  {
    id: "ai",
    title: "AI features",
    body: `When you use an AI feature, the content that request needs (for example your product description, a prospect's company details or a draft) is sent to the AI provider that serves it — OpenAI, Anthropic or Google — to generate the result. If you connect your own API key, the request is made under your account with that provider and its terms apply. Some Discovery features search the public web for information about companies. AI results are stored in your account so you do not pay for the same request twice.`,
  },
  {
    id: "sharing",
    title: "Who we share it with",
    body: `We share personal data only with service providers who help us run the Service, under contracts that require them to protect it and use it only for that purpose:

- **Supabase** — database, authentication and file storage (hosted in Mumbai, India)
- **Vercel** — application hosting and content delivery
- **GoDaddy** — sending email
- **Razorpay** — payment processing
- **OpenAI, Anthropic and Google** — AI features, only when you use them
- **Google** — sign-in, only if you choose to sign in with Google
- **Meta (WhatsApp, Instagram, Facebook)** — only if your business connects those channels

We may also disclose personal data if the law requires it, to protect the rights, safety or property of our users or others, or as part of a merger, acquisition or sale of our business, in which case this policy will continue to apply to your data.`,
  },
  {
    id: "location",
    title: "Where your data is stored",
    body: `Our database and file storage are hosted in India (Mumbai). Some of our service providers — for example the AI providers and email delivery — may process data in other countries when you use their features. Where that happens we rely on providers with strong security and contractual safeguards, and we transfer data only as permitted by Indian law.`,
  },
  {
    id: "retention",
    title: "How long we keep it",
    body: `- We keep your account and Customer Data for as long as your account is active.
- **Cancelling a module does not delete its data.** It stays read-only for 30 days, is then kept but inaccessible, and is restored if you reactivate the module.
- If you ask us to close your account, we delete or anonymise your data within 90 days of confirming the request, except for records we must keep by law (such as invoices and tax records) and copies in encrypted backups, which are deleted as the backups expire.
- Technical logs are kept for a limited period for security and troubleshooting.`,
  },
  {
    id: "security",
    title: "How we protect it",
    body: `- Every business's data is isolated at the database level: each request can only reach the records of businesses the signed-in user belongs to.
- Data is encrypted in transit (TLS). AI provider keys you connect are additionally encrypted with AES-256-GCM before they are stored.
- Access within a business is controlled by roles and permissions, and important changes are recorded in an audit log.
- Shared data-room links can be set to expire and can be revoked at any time.

No system is perfectly secure. If we become aware of a personal data breach that affects you, we will notify you and the relevant authorities as the law requires.`,
  },
  {
    id: "rights",
    title: "Your rights",
    body: `Subject to applicable law, you have the right to:

- ask for a summary of the personal data we hold about you and how we use it;
- have inaccurate or incomplete data corrected and updated;
- have your data erased when it is no longer needed for the purpose it was collected for;
- withdraw your consent, where we rely on consent (this does not affect processing that already took place);
- nominate another person to exercise your rights if you die or become incapacitated;
- have a grievance about our handling of your data addressed.

You can download a copy of the personal data we hold about you at any time from **Settings → Profile → Download my data**. To exercise any other right, email ${email} from the address on your account. We will respond within 30 days. If you are not satisfied with our response, you may complain to the Data Protection Board of India.`,
  },
  {
    id: "cookies",
    title: "Cookies and similar technologies",
    body: `We use only the cookies and browser storage the Service needs to work: authentication cookies that keep you signed in, and preferences stored in your browser such as your light or dark theme and which menu sections you have collapsed. We do not use advertising or cross-site tracking cookies.`,
  },
  {
    id: "children",
    title: "Children",
    body: `The Service is for businesses and is not intended for anyone under 18. We do not knowingly collect personal data from children. If you believe a child has given us personal data, contact us and we will delete it.`,
  },
  {
    id: "changes",
    title: "Changes to this policy",
    body: `We may update this policy from time to time. The date at the top of this page shows when it last changed. If we make a material change, we will tell you by email or in the product before it takes effect.`,
  },
  {
    id: "contact",
    title: "Contact and grievance officer",
    body: `For any question or complaint about privacy or this policy, contact our Grievance Officer at ${email}. We will acknowledge your complaint within 24 hours and aim to resolve it within 15 days.`,
  },
];
