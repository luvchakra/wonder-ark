import { Suspense } from "react";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthError } from "@/components/auth/auth-error";
import { login } from "@/app/(auth)/actions";
import { getPublicLoginBranding } from "@cofounderai/core/admin/platform-branding";
import { getEnabledOAuthProviders } from "@cofounderai/core/auth/oauth-providers";
import { signInReturnPath } from "@cofounderai/core/help/access";

/**
 * PLATFORM-P0-03.3: `login_headline`/`login_support_text` (added by PLATFORM-P0-03.1)
 * override this page's default copy when a superadmin has set them; both default to
 * `null`, so an unconfigured platform shows exactly the same "Welcome back, Founder." /
 * "Your next customer is waiting." copy it always has. The Terms/Privacy links always
 * render: a superadmin-configured URL wins, otherwise they point at the platform's own
 * /terms and /privacy pages.
 */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const [branding, providers, { next }] = await Promise.all([
    getPublicLoginBranding(),
    getEnabledOAuthProviders(),
    searchParams,
  ]);
  // Sent here from a help page, or to a new organization's Business page: sign-in brings
  // them back to it.
  const returnTo = signInReturnPath(typeof next === "string" ? next : null);
  const termsUrl = branding.loginTermsUrl || "/terms";
  const privacyUrl = branding.loginPrivacyUrl || "/privacy";

  return (
    <div className="w-full max-w-sm rounded-2xl border border-landing-surface-border bg-landing-surface p-8">
      <h1 className="text-2xl font-semibold text-landing-fg">{branding.loginHeadline || "Welcome back, Founder."}</h1>
      <p className="mt-2 text-sm text-landing-muted">
        {branding.loginSupportText || "Your next customer is waiting."}
      </p>
      <Suspense fallback={null}>
        <AuthError />
      </Suspense>
      <div className="mt-8">
        <AuthForm mode="login" action={login} providers={providers} returnTo={returnTo} />
      </div>
      <p className="mt-6 text-center text-xs text-landing-muted">
        <a href={termsUrl} className="underline hover:text-landing-fg">
          Terms
        </a>
        {" · "}
        <a href={privacyUrl} className="underline hover:text-landing-fg">
          Privacy
        </a>
      </p>
    </div>
  );
}
