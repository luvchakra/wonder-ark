import { redirect } from "next/navigation";
import { createClient } from "@cofounderai/core/db/server";
import { requireSuperadmin } from "@cofounderai/core/rbac/platform-admin";
import { Card, CardContent, CardHeader, CardTitle } from "@cofounderai/core/ui/card";
import { MfaVerifyForm } from "./mfa-verify-form";

/**
 * PLATFORM-P0-18.1: the TOTP enroll + verify flow SUPERADMIN accounts must complete
 * before `platform/(protected)/layout.tsx` lets them past AAL1. Deliberately a sibling of
 * `(protected)/`, not nested inside it -- nesting here would gate this very page behind
 * the AAL2 check it exists to satisfy, looping a not-yet-verified superadmin forever.
 * Still sits under `platform/layout.tsx`, so `requireSuperadmin()` (identity) still
 * applies -- only the AAL2 (possession-factor) layer is skipped for this one route.
 *
 * Two cases, both landing on the same `MfaVerifyForm` code-entry step:
 *
 * 1. No verified TOTP factor yet (first-time setup) -- any stale *unverified* factor from
 *    an abandoned earlier attempt is unenrolled first (Supabase caps factors per user, and
 *    the secret/QR from an old enroll() call can never be re-displayed once the page has
 *    moved on), then a fresh one is enrolled and its QR code + secret are shown.
 * 2. A verified TOTP factor already exists, but this session is still AAL1 (e.g. a
 *    superadmin who enrolled previously, signed out, and signed back in with just a
 *    password) -- no re-enrollment needed, just a fresh challenge against the existing
 *    factor.
 */
export default async function PlatformMfaPage() {
  // PLATFORM-P0-01.2: this page enrols a second factor on the caller's account as it
  // renders, so it checks who is asking itself. The layout's redirect would not stop it.
  try {
    await requireSuperadmin();
  } catch {
    redirect("/dashboard");
  }

  const supabase = await createClient();

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel === "aal2") {
    redirect("/platform");
  }

  const { data: factorsData, error: factorsError } = await supabase.auth.mfa.listFactors();
  if (factorsError) {
    throw new Error(`Could not load MFA factors: ${factorsError.message}`);
  }

  // `listFactors()`'s per-type `totp`/`phone` arrays are, by the SDK's own typing,
  // always-verified only -- unverified factors show up solely in `all`. So the presence
  // of any entry here already means "a verified factor exists", no extra status check.
  const verifiedFactor = factorsData?.totp[0];

  if (verifiedFactor) {
    return (
      <div className="mx-auto flex w-full max-w-sm flex-col gap-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Verify your identity</h1>
          <p className="text-sm text-zinc-400">
            Enter the current code from your authenticator app to continue to Platform
            Administration.
          </p>
        </div>
        <Card className="border-zinc-800 bg-zinc-900 text-zinc-50">
          <CardContent className="pt-6">
            <MfaVerifyForm factorId={verifiedFactor.id} />
          </CardContent>
        </Card>
      </div>
    );
  }

  // No verified factor -- first-time setup. Clear out any stale unverified factor from an
  // abandoned earlier attempt before enrolling a new one, since its secret/QR can't be
  // recovered once this render is gone. Unverified factors only appear in `all`.
  const staleUnverified = (factorsData?.all ?? []).filter(
    (f) => f.factor_type === "totp" && f.status === "unverified",
  );
  for (const factor of staleUnverified) {
    await supabase.auth.mfa.unenroll({ factorId: factor.id });
  }

  const { data: enrolled, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: "totp" });
  if (enrollError || !enrolled) {
    throw new Error(`Could not start MFA enrollment: ${enrollError?.message ?? "unknown error"}`);
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Set up two-factor authentication</h1>
        <p className="text-sm text-zinc-400">
          SUPERADMIN accounts require an authenticator app (TOTP). This is required before
          you can access Platform Administration.
        </p>
      </div>
      <Card className="border-zinc-800 bg-zinc-900 text-zinc-50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-normal text-zinc-400">
            1. Scan this QR code with your authenticator app
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- data: URI SVG from
              Supabase, not a static asset Next's image optimizer can process. */}
          <img
            src={enrolled.totp.qr_code}
            alt="Scan this QR code with your authenticator app"
            className="h-40 w-40 self-center rounded bg-white p-2"
          />
          <div className="text-xs text-zinc-400">
            <p>Can&apos;t scan? Enter this code manually:</p>
            <p className="mt-1 break-all rounded bg-zinc-950 px-2 py-1.5 font-mono text-zinc-200">
              {enrolled.totp.secret}
            </p>
          </div>
        </CardContent>
      </Card>
      <Card className="border-zinc-800 bg-zinc-900 text-zinc-50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-normal text-zinc-400">
            2. Enter the 6-digit code it generates
          </CardTitle>
        </CardHeader>
        <CardContent>
          <MfaVerifyForm factorId={enrolled.id} />
        </CardContent>
      </Card>
    </div>
  );
}
