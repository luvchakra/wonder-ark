/**
 * PLATFORM-P1-13.1 -- the Careers pages' states, rendered to HTML with WonderJobs mocked:
 * empty, unavailable and not set up (the reason for admins only), real jobs and nothing
 * else, the consent line with and without a retention period, the JSON-LD, and the
 * status page's noindex / no-referrer metadata.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listCareerJobs: vi.fn(),
  getCareerJob: vi.fn(),
  careerApplicationStatus: vi.fn(),
  viewerIsPlatformAdmin: vi.fn(),
  careersRateLimited: vi.fn(),
}));

vi.mock("@cofounderai/core/careers/wonderjobs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cofounderai/core/careers/wonderjobs")>();
  return {
    failureMessage: actual.failureMessage,
    listCareerJobs: mocks.listCareerJobs,
    getCareerJob: mocks.getCareerJob,
    careerApplicationStatus: mocks.careerApplicationStatus,
    submitCareerApplication: vi.fn(),
  };
});
vi.mock("./viewer", () => ({ viewerIsPlatformAdmin: mocks.viewerIsPlatformAdmin }));
vi.mock("@/lib/careers-rate-limit", () => ({ careersRateLimited: mocks.careersRateLimited }));

const CareersPage = (await import("./page")).default;
const jobPage = await import("./[id]/page");
const statusPage = await import("./status/page");

const JOB = {
  id: "job_1",
  title: "Field engineer",
  location: "Pune",
  workMode: "hybrid" as const,
  jobType: "full_time",
  salaryMin: 600000,
  salaryMax: 900000,
  currency: "INR",
  description: "You keep our customers' sites running.\n\n<script>alert(1)</script>",
  skills: ["HVAC", "Wiring"],
  company: "WonderArk",
  updatedAt: "2026-10-20T10:00:00Z",
};

async function html(node: Promise<unknown> | unknown): Promise<string> {
  return renderToStaticMarkup((await node) as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.viewerIsPlatformAdmin.mockResolvedValue(false);
  mocks.careersRateLimited.mockResolvedValue(false);
});

describe("/careers", () => {
  it("lists only the jobs WonderJobs returned, each linking to its page", async () => {
    mocks.listCareerJobs.mockResolvedValue({ ok: true, data: { site: { name: null, retentionMonths: 12 }, jobs: [JOB] } });
    const page = await html(CareersPage());
    expect(page).toContain("Field engineer");
    expect(page).toContain('href="/careers/job_1"');
    for (const fact of ["Pune", "Hybrid", "Full-time", "₹6,00,000 – ₹9,00,000", "HVAC", "Wiring"]) expect(page).toContain(fact);
    expect(page.match(/href="\/careers\/[^"]+"/g)).toHaveLength(1);
  });

  it("says there are no open positions rather than showing a placeholder", async () => {
    mocks.listCareerJobs.mockResolvedValue({ ok: true, data: { site: { name: null, retentionMonths: null }, jobs: [] } });
    const page = await html(CareersPage());
    expect(page).toContain("No open positions right now");
    expect(page).not.toContain('href="/careers/');
  });

  it("says careers isn't set up, with the reason for admins only", async () => {
    mocks.listCareerJobs.mockResolvedValue({ ok: false, kind: "not_configured", reason: "no_key" });
    const visitor = await html(CareersPage());
    expect(visitor).toContain("Careers isn&#x27;t set up yet");
    expect(visitor).not.toContain("Admins only");
    expect(visitor).not.toContain("/platform/careers");

    mocks.viewerIsPlatformAdmin.mockResolvedValue(true);
    const admin = await html(CareersPage());
    expect(admin).toContain("Admins only");
    expect(admin).toContain("/platform/careers");
  });

  it("says WonderJobs is unavailable and offers to try again", async () => {
    mocks.listCareerJobs.mockResolvedValue({ ok: false, kind: "unavailable" });
    const page = await html(CareersPage());
    expect(page).toContain("Careers is unavailable right now");
    expect(page).toContain("Try again");
  });

  it("does not tell visitors that the key was rejected", async () => {
    mocks.listCareerJobs.mockResolvedValue({ ok: false, kind: "unauthorized" });
    const page = await html(CareersPage());
    expect(page).toContain("Careers is unavailable right now");
    expect(page).not.toContain("401");
  });
});

describe("/careers/[id]", () => {
  const props = { params: Promise.resolve({ id: "job_1" }) };

  it("renders the description as text, never as HTML, with the apply form and JSON-LD", async () => {
    mocks.getCareerJob.mockResolvedValue({ ok: true, data: { site: { name: null, retentionMonths: 12 }, job: JOB } });
    const page = await html(jobPage.default(props));
    expect(page).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(page).not.toContain("<script>alert(1)</script>");
    expect(page).toContain('name="resumeUrl"');
    expect(page).toContain('name="website"');
    expect(page).toContain("and deletes it 12 months after its last update.");

    const ld = page.match(/<script type="application\/ld\+json">(.*?)<\/script>/)?.[1];
    expect(ld).toBeTruthy();
    const parsed = JSON.parse(ld!);
    expect(parsed).toMatchObject({ "@type": "JobPosting", title: "Field engineer", employmentType: "FULL_TIME" });
    expect(ld).not.toContain("<script>");
  });

  it("leaves the retention period out when WonderJobs gives none", async () => {
    mocks.getCareerJob.mockResolvedValue({ ok: true, data: { site: { name: null, retentionMonths: null }, job: JOB } });
    const page = await html(jobPage.default(props));
    expect(page).toContain("to consider me for this and similar roles.");
    expect(page).not.toContain("months after");
  });

  it("says a closed position is no longer open, with a link back", async () => {
    mocks.getCareerJob.mockResolvedValue({ ok: false, kind: "not_found" });
    const page = await html(jobPage.default(props));
    expect(page).toContain("This position is no longer open");
    expect(page).toContain('href="/careers"');
    expect(page).not.toContain('name="resumeUrl"');
  });
});

describe("/careers/status", () => {
  it("is never indexed and sends no referrer", () => {
    expect(statusPage.metadata.robots).toEqual({ index: false, follow: false });
    expect(statusPage.metadata.referrer).toBe("no-referrer");
  });

  it("shows the application and Withdraw when WonderJobs allows it", async () => {
    mocks.careerApplicationStatus.mockResolvedValue({
      ok: true,
      data: {
        status: "reviewing",
        statusLabel: "In review",
        jobTitle: "Field engineer",
        company: "WonderArk",
        appliedAt: "2026-10-01T00:00:00Z",
        updatedAt: "2026-10-05T00:00:00Z",
        canWithdraw: true,
      },
    });
    const page = await html(statusPage.default({ searchParams: Promise.resolve({ t: "wjst_token_1234567890" }) }));
    expect(mocks.careerApplicationStatus).toHaveBeenCalledWith("wjst_token_1234567890", "view");
    for (const text of ["Field engineer", "WonderArk", "In review", "1 Oct 2026", "5 Oct 2026", "Withdraw application"]) expect(page).toContain(text);
  });

  it("says it couldn't find a missing or unknown token", async () => {
    const missing = await html(statusPage.default({ searchParams: Promise.resolve({}) }));
    expect(missing).toContain("We couldn&#x27;t find that application. Use the link in your email.");
    expect(mocks.careerApplicationStatus).not.toHaveBeenCalled();

    mocks.careerApplicationStatus.mockResolvedValue({ ok: false, kind: "not_found" });
    const unknown = await html(statusPage.default({ searchParams: Promise.resolve({ t: "wjst_unknown_token_123" }) }));
    expect(unknown).toContain("We couldn&#x27;t find that application. Use the link in your email.");
  });
});
