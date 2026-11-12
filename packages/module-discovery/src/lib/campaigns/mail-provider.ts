import { resolveMx as dnsResolveMx } from "node:dns/promises";

/**
 * DISC-CAMP-P0-02.4: working out a mailbox's servers from its address, so connecting
 * one needs only the address and the password.
 *
 * The address's domain says where its mail is hosted (its MX records). When that is one
 * of the providers in the fixed table below, the table's own SMTP and IMAP hosts are
 * used. The lookup is only ever a suggestion:
 *  - what DNS returns is used to pick a row and for nothing else. No name from DNS is
 *    stored, shown or connected to; only a host written in this file is;
 *  - the suggested host still goes through `resolveSafeHost` before any connection, like
 *    one a person typed;
 *  - with no match, or a lookup that fails, nothing is suggested and the person enters
 *    the servers themselves.
 */

export type MailProviderSettings = {
  provider: "godaddy" | "google" | "microsoft" | "zoho";
  label: string;
  smtpHost: string;
  smtpPort: 465 | 587;
  imapHost: string;
  /** Shown only when a sign-in to this provider is refused. */
  signInHint?: string;
};

const endsWith = (exchange: string, ...suffixes: string[]) => suffixes.some((suffix) => exchange === suffix || exchange.endsWith(`.${suffix}`));

/** The fixed table. Pure: picks a row from MX host names, or none. */
export function settingsForMx(exchanges: readonly string[]): MailProviderSettings | null {
  const hosts = exchanges.map((exchange) => exchange.trim().toLowerCase().replace(/\.$/, "")).filter(Boolean);
  for (const host of hosts) {
    if (endsWith(host, "secureserver.net")) {
      return { provider: "godaddy", label: "GoDaddy", smtpHost: "smtpout.secureserver.net", smtpPort: 465, imapHost: "imap.secureserver.net" };
    }
    if (endsWith(host, "google.com", "googlemail.com")) {
      return {
        provider: "google",
        label: "Google",
        smtpHost: "smtp.gmail.com",
        smtpPort: 465,
        imapHost: "imap.gmail.com",
        signInHint: "Google mailboxes need an app password here, not your usual password.",
      };
    }
    if (endsWith(host, "outlook.com", "protection.outlook.com")) {
      return { provider: "microsoft", label: "Microsoft 365", smtpHost: "smtp.office365.com", smtpPort: 587, imapHost: "outlook.office365.com" };
    }
    if (endsWith(host, "zoho.in")) {
      return { provider: "zoho", label: "Zoho", smtpHost: "smtp.zoho.in", smtpPort: 465, imapHost: "imap.zoho.in" };
    }
    if (endsWith(host, "zoho.com")) {
      return { provider: "zoho", label: "Zoho", smtpHost: "smtp.zoho.com", smtpPort: 465, imapHost: "imap.zoho.com" };
    }
  }
  return null;
}

export type MxResolver = (domain: string) => Promise<{ exchange: string; priority: number }[]>;

const DOMAIN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/**
 * The servers for an address, from its domain's MX records, or null when the provider is
 * not in the table or the lookup fails. Never throws.
 */
export async function suggestMailSettings(email: string, resolveMx: MxResolver = dnsResolveMx): Promise<MailProviderSettings | null> {
  const domain = email.trim().toLowerCase().split("@")[1] ?? "";
  if (!DOMAIN.test(domain)) return null;
  try {
    const records = await resolveMx(domain);
    return settingsForMx([...records].sort((a, b) => a.priority - b.priority).map((record) => record.exchange));
  } catch {
    return null;
  }
}
