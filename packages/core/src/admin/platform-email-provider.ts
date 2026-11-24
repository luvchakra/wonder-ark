import { z } from "zod";
import { createClient } from "../db/server";
import { requireSuperadmin } from "../rbac/platform-admin";
import { getPlatformBranding } from "./platform-branding";

/**
 * PLATFORM-P0-11.1 ("Email Provider", docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §15).
 * See the migration's own docstring (`20260912400000_platform_email_provider.sql`) for the
 * full entity-ownership and scope reasoning. Two things worth restating here, close to the
 * code that has to get them right:
 *
 * 1. **"From name" has no field on `platform.email_provider` at all.** §15's "from name" is
 *    `platform.branding.email_from_name` (PLATFORM-P0-03.1's own "Email Branding" column,
 *    built explicitly "waiting for PLATFORM-P0-11 to plug into") -- not a second, duplicate
 *    column here. `getEmailProviderConfig()` below reads it via the existing
 *    `getPlatformBranding()` and returns it alongside this table's own three fields so the
 *    admin page can show all four together, but every *write* to that value still goes
 *    through `platform.branding`'s own draft/publish workflow (`/platform/branding`,
 *    PLATFORM-P0-03.5) -- this file has no `emailFromName` write path, deliberately, so
 *    there is never a second place that writes it.
 * 2. **This is configuration only -- no email routes through it.** Every email the
 *    platform sends goes through the SMTP mailbox set on the Keys page (EMAIL-SMTP-01,
 *    `email/platform-mailer.ts`, owner 2026-11-24: GoDaddy over SMTP; Resend is not used
 *    anywhere). This table only records the provider name and reply-to shown here.
 */

export type EmailProviderConfig = {
  provider: string | null;
  fromEmail: string | null;
  replyTo: string | null;
  updatedAt: string;
  updatedBy: string | null;
  /** Read-only here -- see this file's own top-of-file docstring point 1. Edited only via
   * `/platform/branding`'s own form. */
  fromName: string | null;
};

type EmailProviderRow = {
  provider: string | null;
  from_email: string | null;
  reply_to: string | null;
  updated_at: string;
  updated_by: string | null;
};

export async function getEmailProviderConfig(): Promise<EmailProviderConfig> {
  await requireSuperadmin();
  const supabase = await createClient({ schema: "platform" });
  const [{ data, error }, branding] = await Promise.all([
    supabase.from("email_provider").select("*").eq("id", true).single(),
    getPlatformBranding(),
  ]);
  if (error) throw error;
  const row = data as EmailProviderRow;
  return {
    provider: row.provider,
    fromEmail: row.from_email,
    replyTo: row.reply_to,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
    fromName: branding.emailFromName,
  };
}

const reasonSchema = z
  .string()
  .trim()
  .min(1, "A reason is required.")
  .max(500, "Reason must be 500 characters or fewer.");

/** Free text, not a closed enum -- see the migration's own docstring for why (no existing
 * closed union or SDK integration for "email provider" exists anywhere in this codebase to
 * validate against, unlike `platform.ai_providers.provider`). Empty clears the field. */
const optionalProviderLabel = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .pipe(z.string().max(120, "Provider name must be 120 characters or fewer.").nullable());

const optionalEmail = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .pipe(z.string().email("Enter a valid email address").nullable());

export const updateEmailProviderConfigSchema = z.object({
  provider: optionalProviderLabel,
  fromEmail: optionalEmail,
  replyTo: optionalEmail,
  reason: reasonSchema,
});
export type UpdateEmailProviderConfigInput = z.input<typeof updateEmailProviderConfigSchema>;

function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !(key in fieldErrors)) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

export async function updateEmailProviderConfig(
  input: UpdateEmailProviderConfigInput,
): Promise<{ ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> }> {
  await requireSuperadmin();
  const parsed = updateEmailProviderConfigSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors = fieldErrorsFrom(parsed.error);
    return { ok: false, error: Object.values(fieldErrors)[0] ?? "Invalid input.", fieldErrors };
  }

  const supabase = await createClient({ schema: "platform" });
  const { error } = await supabase.rpc("update_email_provider_config", {
    p_provider: parsed.data.provider,
    p_from_email: parsed.data.fromEmail,
    p_reply_to: parsed.data.replyTo,
    p_reason: parsed.data.reason,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
