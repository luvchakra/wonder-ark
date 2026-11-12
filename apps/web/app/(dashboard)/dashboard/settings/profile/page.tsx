import { redirect } from "next/navigation";
import { createClient } from "@cofounderai/core/db/server";
import Link from "next/link";
import { buttonVariants } from "@cofounderai/core/ui/button-variants";
import { ProfileCard } from "@/components/settings/profile-card";
import { CONTACT_EMAIL } from "@/lib/legal";
import { updateAvatarAction, updateProfileAction } from "./actions";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const metadata = user.user_metadata ?? {};
  const fullName = (metadata.full_name || metadata.name || "") as string;
  const avatarUrl = (metadata.avatar_url || metadata.picture || null) as string | null;

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 p-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your personal details -- visible only to you.
        </p>
      </div>

      <ProfileCard
        avatarUrl={avatarUrl}
        fullName={fullName}
        email={user.email ?? ""}
        bio={(metadata.bio ?? "") as string}
        phone={(metadata.phone ?? "") as string}
        jobTitle={(metadata.job_title ?? "") as string}
        location={(metadata.location ?? "") as string}
        timezone={(metadata.timezone ?? "") as string}
        updateProfileAction={updateProfileAction}
        updateAvatarAction={updateAvatarAction}
      />

      {/* PRIV-2: the user's own data rights, next to the details they describe. */}
      <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:p-6">
        <div>
          <h2 className="text-base font-semibold">Your data</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Download a copy of the personal data we hold about you: your sign-in details, profile, memberships and the
            actions recorded under your name. Business records are exported from each module.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <a href="/dashboard/settings/profile/export" download className={buttonVariants({ variant: "outline", size: "sm" })}>
            Download my data
          </a>
          <p className="text-xs text-muted-foreground">
            To correct or delete your data or close your account, email{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="underline">
              {CONTACT_EMAIL}
            </a>{" "}
            (<Link href="/privacy#rights" className="underline">your rights</Link>).
          </p>
        </div>
      </section>
    </main>
  );
}
