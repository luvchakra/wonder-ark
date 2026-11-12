import type { Metadata } from "next";
import { resolveSignupPage } from "@cofounderai/module-discovery/lib/audience/signup";
import { SignupForm } from "@cofounderai/module-discovery/components/audience/signup-form";
import { signupAction } from "./actions";

export const metadata: Metadata = { robots: { index: false } };

function first(value: string | string[] | undefined): string | null {
  return typeof value === "string" ? value : Array.isArray(value) ? (value[0] ?? null) : null;
}

/**
 * DISC-CONS-P0-03.2/03.4/03.8: an offering's public sign-up page. The offering's name,
 * one line of value, the form, the business named as who collects the data, and
 * "Powered by WonderArk". `?ref=` is a person's referral link.
 */
export default async function SignupPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  const query = await searchParams;
  const page = await resolveSignupPage(token).catch(() => null);

  if (!page) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-2 p-10 text-center">
        <h1 className="text-lg font-semibold">Sign-up unavailable</h1>
        <p className="text-sm text-muted-foreground">This sign-up page isn&apos;t available right now.</p>
      </div>
    );
  }

  const utm: Record<string, string> = {};
  for (const key of ["source", "medium", "campaign", "term", "content"]) {
    const value = first(query[`utm_${key}`]);
    if (value) utm[key] = value;
  }

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <main className="mx-auto flex max-w-md flex-col gap-6 rounded-xl border bg-card p-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold">{page.offeringName}</h1>
          {page.valueLine ? <p className="text-sm text-muted-foreground">{page.valueLine}</p> : null}
        </div>
        <SignupForm
          action={signupAction.bind(null, token, { ref: first(query.ref), utm })}
          questions={page.questions}
          consentText={page.consentText}
        />
        <p className="text-xs text-muted-foreground">
          {page.businessName} collects what you enter here to contact you about {page.offeringName}, and keeps it until you
          unsubscribe or ask them to delete it.
        </p>
        <p className="text-center text-xs text-muted-foreground">Powered by WonderArk</p>
      </main>
    </div>
  );
}
