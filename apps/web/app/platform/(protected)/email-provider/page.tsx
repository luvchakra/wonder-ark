import type { ReactNode } from "react";
import Link from "next/link";
import { getEmailProviderConfig } from "@cofounderai/core/admin/platform-email-provider";
import { EmailProviderDialog } from "./email-provider-dialog";

/**
 * PLATFORM-P0-11.1 ("Email Provider", docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §15) --
 * CONFIG-ONLY. See `platform-email-provider.ts` and this feature's migration for the full
 * entity-ownership reasoning ("from name" is `platform.branding.email_from_name`, not a
 * second field here). No email routes through this table: every email the platform sends
 * goes through the SMTP mailbox set on Keys (EMAIL-SMTP-01, owner 2026-11-24).
 *
 * A single settings surface, not a list of rows -- singleton `platform.email_provider`, same
 * shape as `/platform/ai-feature-policies`, so no table/mobile-card split applies here
 * (CLAUDE.md development principle #12 targets a page whose *primary* content is a table of
 * many rows).
 */
export default async function PlatformEmailProviderPage() {
  const config = await getEmailProviderConfig();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Email Provider</h1>
        <p className="text-sm text-zinc-400">
          A record of the provider and reply-to address. Every change here is recorded with a reason.
        </p>
      </div>

      <div className="flex flex-col gap-4 rounded-2xl border border-amber-900/60 bg-amber-950/20 p-4 text-sm text-amber-200">
        <p>
          Every email the platform sends (invitations, billing notices, reminders, invoices and estimates, GST
          reminders, alerts, and outreach from businesses with no mailbox of their own) goes out through the SMTP
          mailbox set on{" "}
          <Link href="/platform/keys" className="underline hover:text-amber-100">
            Keys
          </Link>{" "}
          (Email: server, port, username, password and from address).
        </p>
      </div>

      <div className="flex flex-col gap-4 rounded-2xl border border-zinc-800 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-3 text-sm">
            <Field label="From name">
              <span className={config.fromName ? "text-zinc-100" : "text-zinc-500"}>
                {config.fromName ?? "Not configured"}
              </span>
              <p className="text-xs text-zinc-500">
                Edited on{" "}
                <Link href="/platform/branding" className="underline hover:text-zinc-300">
                  Platform Branding
                </Link>{" "}
                -- &quot;Email branding&quot; section, not here.
              </p>
            </Field>
            <Field label="Provider">
              <span className={config.provider ? "text-zinc-100" : "text-zinc-500"}>
                {config.provider ?? "Not configured"}
              </span>
            </Field>
            <Field label="From email">
              <span className={config.fromEmail ? "text-zinc-100" : "text-zinc-500"}>
                {config.fromEmail ?? "Not configured"}
              </span>
            </Field>
            <Field label="Reply-to">
              <span className={config.replyTo ? "text-zinc-100" : "text-zinc-500"}>
                {config.replyTo ?? "Not configured"}
              </span>
            </Field>
          </div>
          <EmailProviderDialog config={config} />
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs uppercase tracking-wide text-zinc-500">{label}</span>
      <div>{children}</div>
    </div>
  );
}
