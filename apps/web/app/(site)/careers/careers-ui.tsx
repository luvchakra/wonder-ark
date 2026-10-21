import type { ReactNode } from "react";
import Link from "next/link";
import { jobTypeLabel, salaryLabel, workModeLabel, type CareerJob } from "@cofounderai/core/careers/format";
import type { WonderJobsFailure } from "@cofounderai/core/careers/wonderjobs";

/**
 * PLATFORM-P1-13.1 -- the pieces the three Careers pages share. Every job value here came
 * from WonderJobs and is rendered as text (React escapes it), never as HTML.
 */

export function CareersShell({ children }: { children: ReactNode }) {
  return <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-4 py-12 sm:px-8 sm:py-16">{children}</main>;
}

/** An empty, unavailable or not-set-up state: a title, one line, at most one link. */
export function CareersNotice({
  title,
  children,
  action,
  adminNote,
}: {
  title: string;
  children?: ReactNode;
  action?: { href: string; label: string };
  /** Shown only when the viewer is a platform superadmin -- the reason behind the state. */
  adminNote?: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-landing-surface-border bg-landing-surface p-8 text-center">
      <h2 className="font-medium text-landing-fg">{title}</h2>
      {children ? <p className="mt-2 text-sm text-landing-muted">{children}</p> : null}
      {adminNote ? (
        <p className="mx-auto mt-4 max-w-lg rounded-lg border border-landing-surface-border bg-landing-bg px-4 py-3 text-left text-sm text-landing-muted">
          <span className="font-medium text-landing-fg">Admins only: </span>
          {adminNote}
        </p>
      ) : null}
      {action ? (
        <Link
          href={action.href}
          className="mt-6 inline-flex h-10 items-center rounded-full border border-landing-surface-border px-5 text-sm font-medium text-landing-fg hover:border-landing-accent hover:text-landing-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-landing-accent"
        >
          {action.label}
        </Link>
      ) : null}
    </section>
  );
}

/** The one line under a job's title: location, work mode, type and salary when given. */
export function jobFacts(job: CareerJob): string[] {
  return [job.location, workModeLabel(job.workMode), jobTypeLabel(job.jobType), salaryLabel(job)].filter((v): v is string => Boolean(v));
}

export function JobFacts({ job }: { job: CareerJob }) {
  const facts = jobFacts(job);
  if (facts.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-landing-muted" aria-label="Job details">
      {facts.map((fact, i) => (
        <li key={fact} className="flex items-center gap-3">
          {i > 0 ? <span aria-hidden="true">·</span> : null}
          {fact}
        </li>
      ))}
    </ul>
  );
}

export function SkillChips({ skills }: { skills: string[] }) {
  if (skills.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Skills">
      {skills.map((skill) => (
        <li key={skill} className="rounded-full border border-landing-surface-border px-3 py-1 text-xs text-landing-muted">
          {skill}
        </li>
      ))}
    </ul>
  );
}

/** What the admin note says for a failure, or null when there is nothing an admin can fix. */
export function adminReason(failure: WonderJobsFailure): ReactNode | null {
  const settings = (
    <Link href="/platform/careers" className="font-medium text-landing-accent underline-offset-2 hover:underline">
      Platform → Careers
    </Link>
  );
  if (failure.kind === "not_configured" && failure.reason === "no_key") {
    return <>No WonderJobs career-site key is saved and WONDERJOBS_CAREERS_KEY isn&apos;t set. Add the key in {settings}.</>;
  }
  if (failure.kind === "not_configured") {
    return <>WONDERJOBS_BASE_URL isn&apos;t an https *.wonderapps.biz address, so nothing is called. Remove or fix it.</>;
  }
  if (failure.kind === "unauthorized") return <>WonderJobs rejected the career-site key (401). Check it in {settings}.</>;
  return null;
}

/** The page-level state for a failed read: set-up, busy or unavailable. */
export function FailureNotice({ failure, isAdmin, retryHref }: { failure: WonderJobsFailure; isAdmin: boolean; retryHref: string }) {
  const adminNote = isAdmin ? adminReason(failure) : null;
  if (failure.kind === "not_configured") {
    return <CareersNotice title="Careers isn't set up yet" adminNote={adminNote} />;
  }
  if (failure.kind === "busy") {
    return (
      <CareersNotice title="We're busy right now" action={{ href: retryHref, label: "Try again" }}>
        Please try again shortly.
      </CareersNotice>
    );
  }
  return (
    <CareersNotice title="Careers is unavailable right now" action={{ href: retryHref, label: "Try again" }} adminNote={adminNote}>
      We couldn&apos;t load open positions. Please try again later.
    </CareersNotice>
  );
}
