import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { BRAND_NAME } from "@cofounderai/core/lib/brand";
import { listCareerJobs } from "@cofounderai/core/careers/wonderjobs";
import { CareersNotice, CareersShell, FailureNotice, JobFacts, SkillChips } from "./careers-ui";
import { viewerIsPlatformAdmin } from "./viewer";

export const metadata: Metadata = {
  title: "Careers",
  description: `Open positions at ${BRAND_NAME}.`,
  alternates: { canonical: "/careers" },
};

// Read per request: the job list comes from WonderJobs (no-store, cached in memory for at
// most 60 s by the client), and admins are told why careers isn't working.
export const dynamic = "force-dynamic";

/**
 * PLATFORM-P1-13.1 -- the open jobs WonderJobs has linked to this career site. Nothing
 * here is sample data: with no jobs the page says so, and when WonderJobs can't be read
 * the page says that instead.
 */
export default async function CareersPage() {
  const [result, isAdmin] = await Promise.all([listCareerJobs(), viewerIsPlatformAdmin()]);

  return (
    <CareersShell>
      <header className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight text-landing-fg sm:text-4xl">Careers</h1>
        <p className="mt-3 text-landing-muted">Open positions at {BRAND_NAME}.</p>
      </header>

      {!result.ok ? (
        <FailureNotice failure={result} isAdmin={isAdmin} retryHref="/careers" />
      ) : result.data.jobs.length === 0 ? (
        <CareersNotice title="No open positions right now">Check back later.</CareersNotice>
      ) : (
        <section aria-label="Open positions">
          <ul className="flex flex-col gap-4">
            {result.data.jobs.map((job) => (
              <li key={job.id}>
                <Link
                  href={`/careers/${encodeURIComponent(job.id)}`}
                  className="group flex flex-col gap-3 rounded-2xl border border-landing-surface-border bg-landing-surface p-6 transition-colors hover:border-landing-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-landing-accent"
                >
                  <div className="flex items-start justify-between gap-4">
                    <h2 className="text-lg font-medium break-words text-landing-fg group-hover:text-landing-accent">{job.title}</h2>
                    <ArrowRight className="mt-1 size-4 shrink-0 text-landing-muted group-hover:text-landing-accent" aria-hidden="true" />
                  </div>
                  <JobFacts job={job} />
                  <SkillChips skills={job.skills} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </CareersShell>
  );
}
