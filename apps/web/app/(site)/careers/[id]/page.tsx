import type { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { BRAND_NAME } from "@cofounderai/core/lib/brand";
import { SITE_URL } from "@cofounderai/core/site";
import { consentText, descriptionParagraphs } from "@cofounderai/core/careers/format";
import { getCareerJob } from "@cofounderai/core/careers/wonderjobs";
import { CareersNotice, CareersShell, FailureNotice, JobFacts, SkillChips } from "../careers-ui";
import { viewerIsPlatformAdmin } from "../viewer";
import { ApplyForm } from "./apply-form";
import { ShareButton } from "./share-button";
import { jobPostingLd, serializeLd } from "./job-posting-ld";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

// One WonderJobs read per request, shared by the metadata and the page.
const loadJob = cache((id: string) => getCareerJob(id));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const result = await loadJob(id);
  if (!result.ok) return { title: "Careers", robots: { index: false } };
  const path = `/careers/${encodeURIComponent(result.data.job.id)}`;
  const description = result.data.job.description.replace(/\s+/g, " ").trim().slice(0, 160);
  return {
    title: `${result.data.job.title} · Careers`,
    description,
    alternates: { canonical: path },
    openGraph: { title: `${result.data.job.title} · ${BRAND_NAME}`, description, url: path, type: "website" },
  };
}

/**
 * PLATFORM-P1-13.1 -- one open position: its description (WonderJobs' plain text, rendered
 * as text), a Share button and the Apply form. The form posts to this app's own server
 * action; the browser never talks to WonderJobs.
 */
export default async function CareerJobPage({ params }: Props) {
  const { id } = await params;
  const [result, isAdmin] = await Promise.all([loadJob(id), viewerIsPlatformAdmin()]);

  const back = (
    <Link href="/careers" className="inline-flex items-center gap-1 self-start text-sm text-landing-muted hover:text-landing-fg">
      <ArrowLeft className="size-4" aria-hidden="true" /> All positions
    </Link>
  );

  if (!result.ok) {
    return (
      <CareersShell>
        {back}
        {result.kind === "not_found" ? (
          <CareersNotice title="This position is no longer open" action={{ href: "/careers", label: "See open positions" }} />
        ) : (
          <FailureNotice failure={result} isAdmin={isAdmin} retryHref={`/careers/${encodeURIComponent(id)}`} />
        )}
      </CareersShell>
    );
  }

  const { job, site } = result.data;
  const path = `/careers/${encodeURIComponent(job.id)}`;
  const ld = jobPostingLd(job, { url: `${SITE_URL}${path}`, hiringOrganization: BRAND_NAME });

  return (
    <CareersShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeLd(ld) }} />
      {back}
      <header className="flex flex-col gap-4">
        <h1 className="text-3xl font-semibold tracking-tight break-words text-landing-fg sm:text-4xl">{job.title}</h1>
        <JobFacts job={job} />
        <div className="flex flex-wrap items-center gap-3">
          <a
            href="#apply"
            className="inline-flex h-10 items-center rounded-full bg-landing-accent px-6 text-sm font-medium text-landing-accent-foreground hover:bg-landing-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-landing-accent"
          >
            Apply
          </a>
          <ShareButton title={job.title} path={path} />
        </div>
      </header>

      <section aria-label="About the role" className="flex flex-col gap-4">
        {descriptionParagraphs(job.description).map((paragraph, i) => (
          <p key={i} className="leading-relaxed break-words whitespace-pre-line text-landing-muted">
            {paragraph}
          </p>
        ))}
        <SkillChips skills={job.skills} />
      </section>

      <section
        id="apply"
        aria-labelledby="apply-heading"
        className="scroll-mt-24 rounded-2xl border border-landing-surface-border bg-landing-surface p-5 sm:p-8"
      >
        <h2 id="apply-heading" className="text-xl font-semibold text-landing-fg">
          Apply for this position
        </h2>
        <ApplyForm jobId={job.id} consent={consentText(BRAND_NAME, site.retentionMonths)} />
      </section>
    </CareersShell>
  );
}
