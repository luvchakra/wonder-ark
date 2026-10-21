import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { resolveCareersKey } from "./connection";
import type { ApplicationInput } from "./application-input";
import type { ApplicationStatus, CareerJob, CareerSite } from "./format";

/**
 * PLATFORM-P1-13.1 -- the server-only client for WonderJobs' career-site API
 * (https://jobs.wonderapps.biz/api/careers/v1). WonderJobs owns the jobs, the
 * applications, every email, reminders, decisions and deletion; this app shows its data
 * and forwards what an applicant submits, and stores none of it.
 *
 * - `import "server-only"` makes a client bundle that reaches this file fail the build; the
 *   key is read from `connection.ts` on the server immediately before each call and only
 *   ever leaves this process in the Authorization header.
 * - The base URL is fixed. `WONDERJOBS_BASE_URL` may point at another https
 *   `*.wonderapps.biz` host (tests, staging); anything else is refused, not followed.
 * - 8 s timeout per attempt. A GET is retried once on a network error or a 5xx; a POST is
 *   never retried (WonderJobs may already have acted). A 429 is "busy": nothing more is
 *   sent until its retry-after has passed.
 * - Every request is no-store. Only the job list is cached, in memory, for 60 s.
 * - Logs carry the operation, the job id, the status code and the time taken -- never a
 *   body, an email, a token or the key.
 */

export const WONDERJOBS_BASE_URL = "https://jobs.wonderapps.biz";
export const WONDERJOBS_TIMEOUT_MS = 8_000;
const JOBS_CACHE_MS = 60_000;
const DEFAULT_RETRY_AFTER_S = 30;

export type WonderJobsFailure =
  | { ok: false; kind: "not_configured"; reason: "no_key" | "bad_base_url" }
  | { ok: false; kind: "unauthorized" }
  | { ok: false; kind: "not_found" }
  | { ok: false; kind: "bad_request"; message: string }
  | { ok: false; kind: "conflict"; message: string }
  | { ok: false; kind: "busy"; retryAfterSeconds: number }
  | { ok: false; kind: "unavailable" };

export type WonderJobsResult<T> = { ok: true; data: T } | WonderJobsFailure;

/** What a person is told for each failure. 400 and 409 carry WonderJobs' own message. */
export function failureMessage(failure: WonderJobsFailure): string {
  switch (failure.kind) {
    case "bad_request":
    case "conflict":
      return failure.message;
    case "busy":
      return "We're busy right now. Please try again shortly.";
    case "not_found":
      return "This position is no longer open.";
    case "not_configured":
      return "Careers isn't set up yet.";
    default:
      return "Something went wrong on our side. Please try again in a few minutes.";
  }
}

/** The WonderJobs origin to call, or null when an override is not an https *.wonderapps.biz host. */
export function wonderJobsBaseUrl(override: string | undefined = process.env.WONDERJOBS_BASE_URL): string | null {
  const raw = override?.trim();
  if (!raw) return WONDERJOBS_BASE_URL;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    if (!url.hostname.endsWith(".wonderapps.biz")) return null;
    return url.origin;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------------------
// Response shapes. WonderJobs' data is untrusted input like any other: parsed, bounded,
// and a job that doesn't fit is dropped rather than shown half-broken.
// ---------------------------------------------------------------------------------------

const text = (max: number) => z.string().max(max);
const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .nullish()
    .transform((v) => (v && v.trim() ? v.trim() : null));
const optionalNumber = z
  .number()
  .finite()
  .nonnegative()
  .nullish()
  .transform((v) => v ?? null);

const jobSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
  title: text(300).trim().min(1),
  location: optionalText(300),
  workMode: z
    .enum(["remote", "hybrid", "onsite"])
    .nullish()
    .catch(null)
    .transform((v) => v ?? null),
  jobType: optionalText(60),
  salaryMin: optionalNumber,
  salaryMax: optionalNumber,
  currency: optionalText(3),
  description: text(50_000)
    .nullish()
    .transform((v) => v ?? ""),
  skills: z
    .array(z.string())
    .nullish()
    .catch(null)
    .transform((v) => (v ?? []).map((s) => s.trim()).filter((s) => s && s.length <= 80).slice(0, 40)),
  company: optionalText(200),
  updatedAt: optionalText(40),
});

const siteSchema = z
  .object({
    name: optionalText(200),
    retentionMonths: z.number().int().positive().max(240).nullish().catch(null).transform((v) => v ?? null),
  })
  .nullish()
  .transform((v) => v ?? { name: null, retentionMonths: null });

function parseJobs(raw: unknown): CareerJob[] {
  const list = (raw as { jobs?: unknown } | null)?.jobs;
  if (!Array.isArray(list)) return [];
  return list.flatMap((item) => {
    const parsed = jobSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

const statusSchema = z.object({
  status: z
    .enum(["new", "reviewing", "interview", "offer", "hired", "rejected", "withdrawn"])
    .nullish()
    .catch(null)
    .transform((v) => v ?? null),
  statusLabel: text(80).trim().min(1),
  jobTitle: text(300).trim().min(1),
  company: optionalText(200),
  appliedAt: optionalText(40),
  updatedAt: optionalText(40),
  canWithdraw: z.boolean().catch(false),
});

// ---------------------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------------------

type Raw = { status: number; body: unknown; retryAfter: string | null };

/** Set by a 429; until then nothing is sent and callers are told WonderJobs is busy. */
let busyUntil = 0;
let jobsCache: { cacheKey: string; expiresAt: number; value: { site: CareerSite; jobs: CareerJob[] } } | null = null;

/** Test hook: forget the job-list cache and any 429 back-off. */
export function resetWonderJobsClientState(): void {
  busyUntil = 0;
  jobsCache = null;
}

function log(op: string, jobId: string | null, status: number | "timeout" | "network", startedAt: number): void {
  console.info("careers: wonderjobs", { op, jobId, status, ms: Date.now() - startedAt });
}

function retryAfterSeconds(header: string | null): number {
  if (!header) return DEFAULT_RETRY_AFTER_S;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.min(Math.max(Math.ceil(seconds), 1), 3600);
  const date = Date.parse(header);
  if (!Number.isNaN(date)) return Math.min(Math.max(Math.ceil((date - Date.now()) / 1000), 1), 3600);
  return DEFAULT_RETRY_AFTER_S;
}

/** One attempt, body included, inside the timeout. Throws on a network error or timeout. */
async function attempt(url: string, init: RequestInit): Promise<Raw> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WONDERJOBS_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal, cache: "no-store", redirect: "error" });
    const raw = await res.text();
    let body: unknown = null;
    try {
      body = raw ? JSON.parse(raw) : null;
    } catch {
      body = null;
    }
    return { status: res.status, body, retryAfter: res.headers.get("retry-after") };
  } finally {
    clearTimeout(timer);
  }
}

function peopleMessage(body: unknown, fallback: string): string {
  const error = (body as { error?: unknown } | null)?.error;
  if (typeof error !== "string") return fallback;
  const trimmed = error.replace(/\s+/g, " ").trim();
  return trimmed ? trimmed.slice(0, 300) : fallback;
}

type Request = { op: string; method: "GET" | "POST"; path: string; jobId?: string | null; body?: unknown };

type Connection = { base: string; key: string } | Extract<WonderJobsFailure, { kind: "not_configured" | "unavailable" }>;

async function connection(): Promise<Connection> {
  const base = wonderJobsBaseUrl();
  if (!base) {
    console.error("careers: WONDERJOBS_BASE_URL is not an https *.wonderapps.biz address; refusing to call it");
    return { ok: false, kind: "not_configured", reason: "bad_base_url" };
  }
  const resolved = await resolveCareersKey();
  if (resolved.state === "missing") return { ok: false, kind: "not_configured", reason: "no_key" };
  if (resolved.state === "unreadable") return { ok: false, kind: "unavailable" };
  return { base, key: resolved.key };
}

async function send(conn: { base: string; key: string }, req: Request): Promise<WonderJobsResult<Raw>> {
  if (Date.now() < busyUntil) {
    return { ok: false, kind: "busy", retryAfterSeconds: Math.ceil((busyUntil - Date.now()) / 1000) };
  }
  const url = `${conn.base}/api/careers/v1${req.path}`;
  const headers: Record<string, string> = { authorization: `Bearer ${conn.key}`, accept: "application/json" };
  if (req.body !== undefined) headers["content-type"] = "application/json";
  const init: RequestInit = { method: req.method, headers, body: req.body === undefined ? undefined : JSON.stringify(req.body) };
  const attempts = req.method === "GET" ? 2 : 1;

  for (let n = 1; n <= attempts; n++) {
    const startedAt = Date.now();
    let raw: Raw;
    try {
      raw = await attempt(url, init);
    } catch (error) {
      const timedOut = error instanceof Error && error.name === "AbortError";
      log(req.op, req.jobId ?? null, timedOut ? "timeout" : "network", startedAt);
      // A timeout has already used the whole budget; only a fast network failure is retried.
      if (!timedOut && n < attempts) continue;
      return { ok: false, kind: "unavailable" };
    }
    log(req.op, req.jobId ?? null, raw.status, startedAt);
    if (raw.status >= 500 && n < attempts) continue;

    if (raw.status >= 200 && raw.status < 300) return { ok: true, data: raw };
    switch (raw.status) {
      case 400:
        return { ok: false, kind: "bad_request", message: peopleMessage(raw.body, "Check your details and try again.") };
      case 401:
      case 403:
        return { ok: false, kind: "unauthorized" };
      case 404:
        return { ok: false, kind: "not_found" };
      case 409:
        return { ok: false, kind: "conflict", message: peopleMessage(raw.body, "You've already applied for this position.") };
      case 429: {
        const seconds = retryAfterSeconds(raw.retryAfter);
        busyUntil = Date.now() + seconds * 1000;
        return { ok: false, kind: "busy", retryAfterSeconds: seconds };
      }
      default:
        return { ok: false, kind: "unavailable" };
    }
  }
  return { ok: false, kind: "unavailable" };
}

async function call(req: Request): Promise<WonderJobsResult<Raw>> {
  const conn = await connection();
  if ("ok" in conn) return conn;
  return send(conn, req);
}

const JOB_ID = /^[A-Za-z0-9_-]{1,128}$/;

// ---------------------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------------------

/** The open jobs linked to this career site. Cached in memory for up to 60 s per key. */
export async function listCareerJobs(): Promise<WonderJobsResult<{ site: CareerSite; jobs: CareerJob[] }>> {
  const conn = await connection();
  if ("ok" in conn) return conn;
  const cacheKey = createHash("sha256").update(`${conn.base}\n${conn.key}`).digest("hex");
  if (jobsCache && jobsCache.cacheKey === cacheKey && jobsCache.expiresAt > Date.now()) {
    return { ok: true, data: jobsCache.value };
  }
  const result = await send(conn, { op: "list_jobs", method: "GET", path: "/jobs" });
  if (!result.ok) return result;
  const value = { site: siteSchema.parse((result.data.body as { site?: unknown } | null)?.site), jobs: parseJobs(result.data.body) };
  jobsCache = { cacheKey, expiresAt: Date.now() + JOBS_CACHE_MS, value };
  return { ok: true, data: value };
}

export async function getCareerJob(id: string): Promise<WonderJobsResult<{ site: CareerSite; job: CareerJob }>> {
  if (!JOB_ID.test(id)) return { ok: false, kind: "not_found" };
  const result = await call({ op: "get_job", method: "GET", path: `/jobs/${encodeURIComponent(id)}`, jobId: id });
  if (!result.ok) return result;
  const body = result.data.body as { job?: unknown; site?: unknown } | null;
  const job = jobSchema.safeParse(body?.job);
  if (!job.success) return { ok: false, kind: "unavailable" };
  return { ok: true, data: { site: siteSchema.parse(body?.site), job: job.data } };
}

/**
 * Forwards an application. Success only on a 200 that says `ok: true` -- WonderJobs has
 * then stored it and emailed the applicant and the hiring team. Never retried.
 */
export async function submitCareerApplication(jobId: string, input: ApplicationInput): Promise<WonderJobsResult<{ id: string | null }>> {
  if (!JOB_ID.test(jobId)) return { ok: false, kind: "not_found" };
  const result = await call({
    op: "apply",
    method: "POST",
    path: `/jobs/${encodeURIComponent(jobId)}/applications`,
    jobId,
    body: { ...input, consent: true },
  });
  if (!result.ok) return result;
  const body = result.data.body as { ok?: unknown; id?: unknown } | null;
  if (result.data.status !== 200 || body?.ok !== true) return { ok: false, kind: "unavailable" };
  return { ok: true, data: { id: typeof body.id === "string" ? body.id : null } };
}

const TOKEN = /^[A-Za-z0-9._~-]{8,512}$/;

/**
 * An applicant's own status, from the token in their email. The token travels in the
 * request body, never in a URL this server requests, so it stays out of access logs.
 */
export async function careerApplicationStatus(
  token: string,
  action: "view" | "withdraw" = "view",
): Promise<WonderJobsResult<ApplicationStatus>> {
  if (!TOKEN.test(token)) return { ok: false, kind: "not_found" };
  const result = await call({ op: `status_${action}`, method: "POST", path: "/applications/status", body: { token, action } });
  if (!result.ok) return result;
  const parsed = statusSchema.safeParse((result.data.body as { application?: unknown } | null)?.application);
  if (!parsed.success) return { ok: false, kind: "unavailable" };
  return { ok: true, data: parsed.data };
}

export type ConnectionTest =
  | { state: "connected"; jobs: number }
  | { state: "wrong_key" }
  | { state: "not_configured"; reason: "no_key" | "bad_base_url" }
  | { state: "unavailable" };

/** The console's "Test connection": one uncached GET /jobs with the key in use. */
export async function testWonderJobsConnection(): Promise<ConnectionTest> {
  const result = await call({ op: "test_connection", method: "GET", path: "/jobs" });
  if (result.ok) return { state: "connected", jobs: parseJobs(result.data.body).length };
  if (result.kind === "unauthorized") return { state: "wrong_key" };
  if (result.kind === "not_configured") return { state: "not_configured", reason: result.reason };
  return { state: "unavailable" };
}
