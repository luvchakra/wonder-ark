/**
 * PLATFORM-P1-13.1 -- the shapes WonderJobs' career-site API returns, and how the public
 * Careers pages word them. Browser-safe: no key, no fetch, nothing server-only, so the
 * pages and their client components can share it with `wonderjobs.ts`.
 */

export type CareerWorkMode = "remote" | "hybrid" | "onsite";

export type CareerJob = {
  id: string;
  title: string;
  location: string | null;
  workMode: CareerWorkMode | null;
  jobType: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string | null;
  /** Plain text from WonderJobs -- untrusted data, rendered as text, never as HTML. */
  description: string;
  skills: string[];
  company: string | null;
  updatedAt: string | null;
};

export type CareerSite = {
  name: string | null;
  /** How long WonderJobs keeps an application after its last update; null when unset. */
  retentionMonths: number | null;
};

export type ApplicationStatusCode = "new" | "reviewing" | "interview" | "offer" | "hired" | "rejected" | "withdrawn";

export type ApplicationStatus = {
  status: ApplicationStatusCode | null;
  statusLabel: string;
  jobTitle: string;
  company: string | null;
  appliedAt: string | null;
  updatedAt: string | null;
  canWithdraw: boolean;
};

const WORK_MODE_LABELS: Record<CareerWorkMode, string> = { remote: "Remote", hybrid: "Hybrid", onsite: "On-site" };

const JOB_TYPE_LABELS: Record<string, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
  internship: "Internship",
  temporary: "Temporary",
  freelance: "Freelance",
};

export function workModeLabel(mode: CareerWorkMode | null): string | null {
  return mode ? WORK_MODE_LABELS[mode] : null;
}

/** "full_time" -> "Full-time"; an unknown type is shown as WonderJobs wrote it, tidied. */
export function jobTypeLabel(jobType: string | null): string | null {
  if (!jobType) return null;
  return JOB_TYPE_LABELS[jobType] ?? jobType.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

/** The salary range when the job gives one, null otherwise -- never a guessed figure. */
export function salaryLabel(job: Pick<CareerJob, "salaryMin" | "salaryMax" | "currency">): string | null {
  const { salaryMin: min, salaryMax: max } = job;
  if (min == null && max == null) return null;
  const currency = job.currency && /^[A-Z]{3}$/.test(job.currency) ? job.currency : "INR";
  const format = new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  });
  if (min != null && max != null) return min === max ? format.format(min) : `${format.format(min)} – ${format.format(max)}`;
  return min != null ? `From ${format.format(min)}` : `Up to ${format.format(max!)}`;
}

/** A job's description as paragraphs: blank lines split paragraphs, single newlines stay
 * line breaks (rendered with `whitespace-pre-line`). Text only -- React escapes it. */
export function descriptionParagraphs(text: string): string[] {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** The consent line on the apply form. With no retention period from WonderJobs, the
 * period is left out rather than invented. */
export function consentText(brandName: string, retentionMonths: number | null): string {
  const base = `I agree that ${brandName} stores my application to consider me for this and similar roles`;
  if (retentionMonths == null) return `${base}.`;
  return `${base}, and deletes it ${retentionMonths} ${retentionMonths === 1 ? "month" : "months"} after its last update.`;
}

export function formatCareerDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}
