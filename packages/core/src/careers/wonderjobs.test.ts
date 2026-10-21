import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApplicationInput } from "./application-input";

const { resolveCareersKey } = vi.hoisted(() => ({ resolveCareersKey: vi.fn() }));
vi.mock("./connection", () => ({ resolveCareersKey }));

const {
  WONDERJOBS_TIMEOUT_MS,
  careerApplicationStatus,
  failureMessage,
  getCareerJob,
  listCareerJobs,
  resetWonderJobsClientState,
  submitCareerApplication,
  testWonderJobsConnection,
  wonderJobsBaseUrl,
} = await import("./wonderjobs");

/** PLATFORM-P1-13.1 -- the server-only WonderJobs client. WonderJobs is always mocked. */

const KEY = "wjcs_test_secret_key_abcd1234";

const JOB = {
  id: "job_1",
  title: "Field engineer",
  location: "Pune",
  workMode: "hybrid",
  jobType: "full_time",
  salaryMin: 600000,
  salaryMax: 900000,
  currency: "INR",
  description: "Line one\n\nLine two",
  skills: ["HVAC", "Wiring"],
  company: "WonderArk",
  updatedAt: "2026-10-20T10:00:00Z",
};

const APPLICATION: ApplicationInput = {
  name: "Asha Rao",
  email: "asha@example.com",
  phone: undefined,
  location: undefined,
  linkedinUrl: undefined,
  resumeUrl: "https://drive.google.com/file/d/abc",
  coverNote: undefined,
  consent: true,
};

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  resetWonderJobsClientState();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  resolveCareersKey.mockResolvedValue({ state: "ok", key: KEY, source: "saved" });
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  delete process.env.WONDERJOBS_BASE_URL;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function lastHeaders(): Record<string, string> {
  return fetchMock.mock.calls.at(-1)![1]!.headers as Record<string, string>;
}

describe("base URL", () => {
  it("is fixed to jobs.wonderapps.biz by default", () => {
    expect(wonderJobsBaseUrl(undefined)).toBe("https://jobs.wonderapps.biz");
  });

  it("accepts an https *.wonderapps.biz override and keeps only its origin", () => {
    expect(wonderJobsBaseUrl("https://jobs-test.wonderapps.biz/some/path")).toBe("https://jobs-test.wonderapps.biz");
  });

  it.each([
    "http://jobs.wonderapps.biz",
    "https://wonderapps.biz.evil.example",
    "https://evil.example/jobs.wonderapps.biz",
    "https://user:pass@jobs.wonderapps.biz",
    "https://jobs.wonderapps.biz:8443",
    "not a url",
  ])("rejects %s", (override) => {
    expect(wonderJobsBaseUrl(override)).toBeNull();
  });

  it("refuses to call anything when the override is rejected", async () => {
    process.env.WONDERJOBS_BASE_URL = "https://evil.example";
    expect(await listCareerJobs()).toEqual({ ok: false, kind: "not_configured", reason: "bad_base_url" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("requests", () => {
  it("sends the key as a Bearer token, no-store, to the fixed host", async () => {
    fetchMock.mockResolvedValue(json(200, { site: { name: "Careers", retentionMonths: 12 }, jobs: [JOB] }));
    const result = await listCareerJobs();
    expect(result.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://jobs.wonderapps.biz/api/careers/v1/jobs");
    expect(lastHeaders().authorization).toBe(`Bearer ${KEY}`);
    expect(init?.cache).toBe("no-store");
  });

  it("reports not configured, without calling WonderJobs, when there is no key", async () => {
    resolveCareersKey.mockResolvedValue({ state: "missing" });
    expect(await listCareerJobs()).toEqual({ ok: false, kind: "not_configured", reason: "no_key" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never puts the key in a result, a message or a log line", async () => {
    fetchMock.mockRejectedValue(new TypeError(`connect failed for Bearer ${KEY}`));
    const result = await getCareerJob("job_1");
    expect(JSON.stringify(result)).not.toContain(KEY);
    expect(result.ok ? "" : failureMessage(result)).not.toContain(KEY);
    const logged = JSON.stringify([...vi.mocked(console.info).mock.calls, ...vi.mocked(console.error).mock.calls]);
    expect(logged).not.toContain(KEY);
  });

  it("logs only the operation, job id, status and time taken", async () => {
    fetchMock.mockResolvedValue(json(409, { error: "You already applied." }));
    await submitCareerApplication("job_1", APPLICATION);
    const logged = vi.mocked(console.info).mock.calls.map((c) => c[1]);
    expect(logged).toEqual([{ op: "apply", jobId: "job_1", status: 409, ms: expect.any(Number) }]);
    expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toContain("asha@example.com");
  });

  it("gives up after 8 seconds", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init!.signal!.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
        }),
    );
    const pending = getCareerJob("job_1");
    await vi.advanceTimersByTimeAsync(WONDERJOBS_TIMEOUT_MS - 1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toEqual({ ok: false, kind: "unavailable" });
    // A timeout already used the whole budget, so it is not retried.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a GET once on a 5xx", async () => {
    fetchMock.mockResolvedValueOnce(json(502, {})).mockResolvedValueOnce(json(200, { job: JOB, site: { name: "x", retentionMonths: 6 } }));
    const result = await getCareerJob("job_1");
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries a GET once on a network error, then reports unavailable", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    expect(await getCareerJob("job_1")).toEqual({ ok: false, kind: "unavailable" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("never retries a POST", async () => {
    fetchMock.mockResolvedValue(json(503, {}));
    expect(await submitCareerApplication("job_1", APPLICATION)).toEqual({ ok: false, kind: "unavailable" });
    fetchMock.mockReset();
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    expect(await submitCareerApplication("job_1", APPLICATION)).toEqual({ ok: false, kind: "unavailable" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("status codes", () => {
  it("maps 401 to a wrong key", async () => {
    fetchMock.mockImplementation(async () => json(401, { error: "Invalid key" }));
    expect(await getCareerJob("job_1")).toEqual({ ok: false, kind: "unauthorized" });
    expect(await testWonderJobsConnection()).toEqual({ state: "wrong_key" });
  });

  it("maps 404 to a closed position", async () => {
    fetchMock.mockResolvedValue(json(404, { error: "Not found" }));
    const result = await getCareerJob("job_1");
    expect(result).toEqual({ ok: false, kind: "not_found" });
    expect(result.ok ? "" : failureMessage(result)).toBe("This position is no longer open.");
  });

  it("passes on 400 and 409 messages as WonderJobs wrote them", async () => {
    fetchMock.mockResolvedValueOnce(json(400, { error: "Résumé link must be https." }));
    const bad = await submitCareerApplication("job_1", APPLICATION);
    expect(bad).toEqual({ ok: false, kind: "bad_request", message: "Résumé link must be https." });
    fetchMock.mockResolvedValueOnce(json(409, { error: "You've already applied for this job." }));
    const dup = await submitCareerApplication("job_1", APPLICATION);
    expect(dup.ok ? "" : failureMessage(dup)).toBe("You've already applied for this job.");
  });

  it("treats 429 as busy and sends nothing more until retry-after passes", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(json(429, { error: "Slow down" }, { "retry-after": "20" }));
    const busy = await getCareerJob("job_1");
    expect(busy).toEqual({ ok: false, kind: "busy", retryAfterSeconds: 20 });
    expect(busy.ok ? "" : failureMessage(busy)).toMatch(/try again shortly/);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    expect((await getCareerJob("job_1")).ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(20_000);
    fetchMock.mockResolvedValue(json(200, { job: JOB, site: null }));
    expect((await getCareerJob("job_1")).ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("counts an application as sent only on a 200 that says ok", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { ok: true, id: "app_1" }));
    expect(await submitCareerApplication("job_1", APPLICATION)).toEqual({ ok: true, data: { id: "app_1" } });
    fetchMock.mockResolvedValueOnce(json(202, { ok: true }));
    expect((await submitCareerApplication("job_1", APPLICATION)).ok).toBe(false);
    fetchMock.mockResolvedValueOnce(json(200, { ok: false }));
    expect((await submitCareerApplication("job_1", APPLICATION)).ok).toBe(false);
  });
});

describe("job list", () => {
  it("drops malformed jobs and keeps the rest", async () => {
    fetchMock.mockResolvedValue(json(200, { site: { name: "Careers", retentionMonths: null }, jobs: [JOB, { id: "<script>", title: "" }] }));
    const result = await listCareerJobs();
    expect(result.ok && result.data.jobs.map((j) => j.id)).toEqual(["job_1"]);
    expect(result.ok && result.data.site).toEqual({ name: "Careers", retentionMonths: null });
  });

  it("is cached in memory for up to 60 seconds", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(async () => json(200, { site: null, jobs: [JOB] }));
    await listCareerJobs();
    await listCareerJobs();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60_001);
    await listCareerJobs();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("is not reused after the key changes", async () => {
    fetchMock.mockImplementation(async () => json(200, { site: null, jobs: [JOB] }));
    await listCareerJobs();
    resolveCareersKey.mockResolvedValue({ state: "ok", key: "wjcs_another_key_zzzz", source: "saved" });
    await listCareerJobs();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not cache a failure", async () => {
    fetchMock.mockResolvedValueOnce(json(500, {})).mockResolvedValueOnce(json(500, {}));
    expect((await listCareerJobs()).ok).toBe(false);
    fetchMock.mockResolvedValue(json(200, { site: null, jobs: [] }));
    expect(await listCareerJobs()).toEqual({ ok: true, data: { site: { name: null, retentionMonths: null }, jobs: [] } });
  });
});

describe("application status", () => {
  const TOKEN = "wjst_abcdefghijklmnopqrstuvwxyz012345";

  it("puts the token in the body, never in the URL it requests", async () => {
    fetchMock.mockResolvedValue(
      json(200, {
        application: {
          status: "reviewing",
          statusLabel: "In review",
          jobTitle: "Field engineer",
          company: "WonderArk",
          appliedAt: "2026-10-01T00:00:00Z",
          updatedAt: "2026-10-02T00:00:00Z",
          canWithdraw: true,
        },
      }),
    );
    const result = await careerApplicationStatus(TOKEN, "view");
    expect(result.ok && result.data.statusLabel).toBe("In review");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://jobs.wonderapps.biz/api/careers/v1/applications/status");
    expect(String(url)).not.toContain(TOKEN);
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ token: TOKEN, action: "view" });
  });

  it("never calls WonderJobs with a malformed token", async () => {
    expect(await careerApplicationStatus("../../x?y")).toEqual({ ok: false, kind: "not_found" });
    expect(await careerApplicationStatus("")).toEqual({ ok: false, kind: "not_found" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never logs the token", async () => {
    fetchMock.mockResolvedValue(json(404, {}));
    await careerApplicationStatus(TOKEN, "withdraw");
    expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toContain(TOKEN);
  });
});

describe("test connection", () => {
  it("reports the job count when connected", async () => {
    fetchMock.mockResolvedValue(json(200, { site: null, jobs: [JOB, { ...JOB, id: "job_2" }] }));
    expect(await testWonderJobsConnection()).toEqual({ state: "connected", jobs: 2 });
  });

  it("reports unavailable on a 5xx", async () => {
    fetchMock.mockResolvedValue(json(503, {}));
    expect(await testWonderJobsConnection()).toEqual({ state: "unavailable" });
  });
});
