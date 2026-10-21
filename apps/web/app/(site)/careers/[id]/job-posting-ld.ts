import type { CareerJob } from "@cofounderai/core/careers/format";

/** PLATFORM-P1-13.1 -- schema.org JobPosting for a job page, from WonderJobs' own fields only. */

const EMPLOYMENT_TYPE: Record<string, string> = {
  full_time: "FULL_TIME",
  part_time: "PART_TIME",
  contract: "CONTRACTOR",
  internship: "INTERN",
  temporary: "TEMPORARY",
  freelance: "CONTRACTOR",
};

export function jobPostingLd(job: CareerJob, opts: { url: string; hiringOrganization: string }): Record<string, unknown> {
  const ld: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: job.title,
    description: job.description,
    url: opts.url,
    hiringOrganization: { "@type": "Organization", name: job.company ?? opts.hiringOrganization },
  };
  if (job.updatedAt) ld.datePosted = job.updatedAt;
  if (job.jobType && EMPLOYMENT_TYPE[job.jobType]) ld.employmentType = EMPLOYMENT_TYPE[job.jobType];
  if (job.workMode === "remote") ld.jobLocationType = "TELECOMMUTE";
  if (job.location) ld.jobLocation = { "@type": "Place", address: { "@type": "PostalAddress", addressLocality: job.location } };
  if (job.skills.length > 0) ld.skills = job.skills.join(", ");
  if (job.salaryMin != null || job.salaryMax != null) {
    ld.baseSalary = {
      "@type": "MonetaryAmount",
      currency: job.currency ?? "INR",
      value: {
        "@type": "QuantitativeValue",
        ...(job.salaryMin != null ? { minValue: job.salaryMin } : {}),
        ...(job.salaryMax != null ? { maxValue: job.salaryMax } : {}),
        unitText: "YEAR",
      },
    };
  }
  return ld;
}

/** JSON for a `<script type="application/ld+json">`: `<` is escaped so a description can't close the tag. */
export function serializeLd(ld: Record<string, unknown>): string {
  return JSON.stringify(ld).replace(/</g, "\\u003c");
}
