/**
 * PLATFORM-P1-14.1 ("Platform Keys"): the registry of the platform's own keys and settings.
 *
 * Each entry is a value that used to exist only as a deployment environment variable. It
 * is now set on the Platform Admin portal's Keys page (`/platform/keys`), stored encrypted
 * in `platform.platform_keys`, and read by the application through
 * `platformKey(NAME)` (`platform-key-store.ts`): the value saved on the platform wins, and
 * the deployment's variable of the same name is the fallback, so nothing already set
 * breaks while values are moved over.
 *
 * Not here: the AI provider keys (the AI Providers page), the payment providers' keys
 * (Billing → Providers) and the WonderJobs career-site key (Careers) already have audited,
 * encrypted homes of their own on the portal.
 *
 * Pure data, no server import: the page's client components read the labels from here.
 * Adding an entry needs no migration (the table checks only the shape of a name).
 */

export type PlatformKeyGroup = "email" | "prospect_data" | "messaging";

export const PLATFORM_KEY_GROUP_LABEL: Record<PlatformKeyGroup, string> = {
  email: "Email",
  prospect_data: "Prospect data",
  messaging: "Messaging webhooks",
};

export interface PlatformKeySpec {
  name: string;
  label: string;
  group: PlatformKeyGroup;
  /** Not a secret (a host, an address, an id): shown in full, never masked. */
  plain?: boolean;
  /** What it unlocks, in words. */
  usedBy: string;
  /** Where the value comes from. */
  source: string;
}

export const PLATFORM_KEYS: readonly PlatformKeySpec[] = [
  // EMAIL-SMTP-01 (owner, 2026-11-24): the platform's own email goes out through one SMTP
  // mailbox (GoDaddy), set here. Resend is not used anywhere.
  {
    group: "email",
    name: "SMTP_HOST",
    label: "SMTP server",
    plain: true,
    usedBy:
      "Every email WonderArk sends itself: team invitations, billing notices, service reminders, invoices and estimates, GST reminders, alerts, and outreach when a business has no mailbox of its own.",
    source: "GoDaddy Workspace Email: smtpout.secureserver.net. Microsoft 365 from GoDaddy: smtp.office365.com",
  },
  {
    group: "email",
    name: "SMTP_PORT",
    label: "SMTP port",
    plain: true,
    usedBy: "465 (secure from the start) or 587 (upgraded with STARTTLS). Nothing is ever sent unencrypted.",
    source: "GoDaddy Workspace Email: 465. Microsoft 365: 587",
  },
  {
    group: "email",
    name: "SMTP_USERNAME",
    label: "SMTP username",
    plain: true,
    usedBy: "Signs in to the mailbox. Usually the full email address.",
    source: "The mailbox's own email address",
  },
  {
    group: "email",
    name: "SMTP_PASSWORD",
    label: "SMTP password",
    usedBy: "Signs in to the mailbox. Stored encrypted and never shown again.",
    source: "The mailbox's password (or an app password, where the mailbox asks for one)",
  },
  {
    group: "email",
    name: "SMTP_FROM_EMAIL",
    label: "From address",
    plain: true,
    usedBy: "The address those emails are sent from and replied to. Usually the same as the username.",
    source: "An address of the mailbox above",
  },
  {
    group: "email",
    name: "SMTP_FROM_NAME",
    label: "From name",
    plain: true,
    usedBy: "The name people see beside the from address. Left empty, the product name.",
    source: "Your choice, e.g. WonderArk",
  },
  {
    group: "email",
    name: "EMAIL_INBOUND_WEBHOOK_SECRET",
    label: "Inbound email webhook secret",
    usedBy: "Checks the x-webhook-secret header on replies arriving at /api/webhooks/email-inbound. Without it they are refused.",
    source: "A long random value you choose and also set on the inbound email service",
  },
  {
    group: "prospect_data",
    name: "WORKSLAKE_GATEWAY_URL",
    label: "WorksLake gateway address",
    plain: true,
    usedBy: "Where Discovery's Find reads business data, channels and hiring signals from.",
    source: "WonderWorks, e.g. https://works.wonderapps.biz",
  },
  {
    group: "prospect_data",
    name: "WORKSLAKE_GATEWAY_API_KEY",
    label: "WorksLake gateway key",
    usedBy: "WonderArk's key on the WorksLake gateway (starts wlg_). Without it Find says WorksLake needs setup.",
    source: "WonderWorks → Admin → Prospect data → Issue key",
  },
  {
    group: "messaging",
    name: "CRM_WHATSAPP_APP_SECRET",
    label: "WhatsApp app secret",
    usedBy: "Checks the signature on incoming WhatsApp messages at /api/webhooks/crm-whatsapp. Without it they are refused.",
    source: "Meta for Developers → your app → App settings → Basic → App secret",
  },
  {
    group: "messaging",
    name: "CRM_WHATSAPP_WEBHOOK_VERIFY_TOKEN",
    label: "WhatsApp webhook verify token",
    usedBy: "Answers Meta's one-time check when the WhatsApp webhook is connected.",
    source: "A value you choose and also enter in Meta's webhook settings",
  },
  {
    group: "messaging",
    name: "CRM_META_APP_SECRET",
    label: "Meta (Facebook and Instagram) app secret",
    usedBy: "Checks the signature on incoming Facebook and Instagram messages and leads at /api/webhooks/crm-meta. Without it they are refused.",
    source: "Meta for Developers → your app → App settings → Basic → App secret",
  },
  {
    group: "messaging",
    name: "CRM_META_WEBHOOK_VERIFY_TOKEN",
    label: "Meta webhook verify token",
    usedBy: "Answers Meta's one-time check when the Facebook and Instagram webhook is connected.",
    source: "A value you choose and also enter in Meta's webhook settings",
  },
];

export type PlatformKeyName = (typeof PLATFORM_KEYS)[number]["name"];

const SPEC = new Map(PLATFORM_KEYS.map((spec) => [spec.name, spec]));

export function platformKeySpec(name: string): PlatformKeySpec | null {
  return SPEC.get(name) ?? null;
}

/**
 * The platform's AI key is the one moved value with a home of its own: the AI Providers
 * page (`platform.ai_provider_keys`, PLATFORM-P0-09.2), which also tests a key against the
 * provider before saving it. The Keys page links there and "Import from deployment" copies
 * `PLATFORM_AI_API_KEY` into it.
 */
export const PLATFORM_AI_KEY_ENV = "PLATFORM_AI_API_KEY";

/**
 * Variables that stay in the deployment, each with the reason. Shown on the Keys page so
 * the page is the one list of what the platform is configured with.
 */
export const DEPLOYMENT_ONLY_VARIABLES: readonly { name: string; reason: string }[] = [
  { name: "NEXT_PUBLIC_SUPABASE_URL", reason: "Where the database is. The platform's keys are stored in that database, so this cannot be." },
  { name: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", reason: "The database's public key, built into the pages the browser loads." },
  { name: "SUPABASE_SERVICE_ROLE_KEY", reason: "The key the server reads the platform's keys with." },
  { name: "API_KEY_ENCRYPTION_SECRET", reason: "The secret that encrypts every stored key. Kept apart from the database it protects." },
  { name: "CRON_SECRET", reason: "The hosting provider's scheduler sends this itself with each scheduled job, and can only read it from the deployment." },
  { name: "BASE_APP_HOST", reason: "Read on every request, before the database, to tell an organization's address from the main one." },
  { name: "ORG_ADDRESS_REQUIRED", reason: "Read on every request with BASE_APP_HOST." },
  { name: "PLATFORM_ADMIN_EMAILS", reason: "Who may open this portal. Kept outside the portal it protects, so a mistake here cannot lock everyone out." },
  { name: "BUSINESS_ADMIN_EMAILS", reason: "Who may use the demo-data tool on business accounts without opening this portal. Kept beside PLATFORM_ADMIN_EMAILS." },
];

/** "••••abcd" for a secret; the value itself for one that is not. Never the whole secret. */
export function platformKeyHint(spec: Pick<PlatformKeySpec, "plain">, value: string): string {
  if (spec.plain) return value;
  return value.length >= 12 ? `••••${value.slice(-4)}` : "••••";
}

/** A reason a value cannot be saved, or null. */
export function platformKeyProblem(spec: PlatformKeySpec, value: string): string | null {
  if (!value) return "Enter a value.";
  if (value.length > 4096) return "That value is too long.";
  if (/[\r\n]/.test(value)) return "A value is one line.";
  if (spec.name === "WORKSLAKE_GATEWAY_URL") {
    try {
      const url = new URL(value);
      if (url.protocol !== "https:") return "The gateway address starts with https://.";
    } catch {
      return "Enter the gateway's full address, starting with https://.";
    }
  }
  if (spec.name === "SMTP_FROM_EMAIL" && !/^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/.test(value)) return "Enter an email address.";
  if (spec.name === "SMTP_PORT" && value !== "465" && value !== "587") return "Use 465 or 587.";
  if (spec.name === "SMTP_HOST" && !/^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(value)) {
    return "Enter the server's host name only, e.g. smtpout.secureserver.net.";
  }
  return null;
}
