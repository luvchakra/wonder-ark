/**
 * PLATFORM-P1-13.1 -- the public apply and withdraw actions. WonderJobs is mocked: these
 * prove what reaches it (validated input only, nothing from a bot, nothing once the
 * address is over its limit) and that "sent" appears only when WonderJobs said so.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { submitCareerApplication, careerApplicationStatus, careersRateLimited } = vi.hoisted(() => ({
  submitCareerApplication: vi.fn(),
  careerApplicationStatus: vi.fn(),
  careersRateLimited: vi.fn(),
}));

vi.mock("@cofounderai/core/careers/wonderjobs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cofounderai/core/careers/wonderjobs")>();
  return { failureMessage: actual.failureMessage, submitCareerApplication, careerApplicationStatus };
});
vi.mock("@/lib/careers-rate-limit", () => ({ careersRateLimited }));

const { applyForJobAction, withdrawApplicationAction } = await import("./actions");

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
}

const VALID = {
  jobId: "job_1",
  name: "Asha Rao",
  email: "asha@example.com",
  resumeUrl: "https://drive.google.com/file/d/abc",
  consent: "on",
};

beforeEach(() => {
  vi.clearAllMocks();
  careersRateLimited.mockResolvedValue(false);
  submitCareerApplication.mockResolvedValue({ ok: true, data: { id: "app_1" } });
});

describe("applyForJobAction", () => {
  it("forwards a valid application, trimmed, and reports it sent", async () => {
    const result = await applyForJobAction({ status: "idle" }, form({ ...VALID, name: "  Asha Rao  " }));
    expect(result).toEqual({ status: "sent" });
    expect(submitCareerApplication).toHaveBeenCalledWith("job_1", expect.objectContaining({ name: "Asha Rao", consent: true }));
    expect(careersRateLimited).toHaveBeenCalledWith("apply", 10);
  });

  it("validates before forwarding anything", async () => {
    const result = await applyForJobAction({ status: "idle" }, form({ ...VALID, resumeUrl: "http://insecure.example/cv", consent: "" }));
    expect(result.status).toBe("invalid");
    if (result.status === "invalid") {
      expect(result.fieldErrors.resumeUrl).toMatch(/https/);
      expect(result.fieldErrors.consent).toBeTruthy();
      expect(result.values.name).toBe("Asha Rao");
    }
    expect(submitCareerApplication).not.toHaveBeenCalled();
  });

  it("pretends success for a filled honeypot and calls nothing", async () => {
    const result = await applyForJobAction({ status: "idle" }, form({ ...VALID, website: "https://spam.example" }));
    expect(result).toEqual({ status: "sent" });
    expect(submitCareerApplication).not.toHaveBeenCalled();
    expect(careersRateLimited).not.toHaveBeenCalled();
  });

  it("stops at the per-address limit without calling WonderJobs", async () => {
    careersRateLimited.mockResolvedValue(true);
    const result = await applyForJobAction({ status: "idle" }, form(VALID));
    expect(result.status).toBe("error");
    expect(submitCareerApplication).not.toHaveBeenCalled();
  });

  it("reports sent only when WonderJobs accepted it", async () => {
    submitCareerApplication.mockResolvedValue({ ok: false, kind: "unavailable" });
    const result = await applyForJobAction({ status: "idle" }, form(VALID));
    expect(result).toMatchObject({ status: "error", message: "Your application couldn't be sent. Please try again in a few minutes." });
  });

  it("shows 400 and 409 messages as WonderJobs wrote them", async () => {
    submitCareerApplication.mockResolvedValue({ ok: false, kind: "conflict", message: "You've already applied for this job." });
    expect(await applyForJobAction({ status: "idle" }, form(VALID))).toMatchObject({ status: "error", message: "You've already applied for this job." });
    submitCareerApplication.mockResolvedValue({ ok: false, kind: "bad_request", message: "Phone looks wrong." });
    expect(await applyForJobAction({ status: "idle" }, form(VALID))).toMatchObject({ status: "error", message: "Phone looks wrong." });
  });

  it("says the position closed on a 404", async () => {
    submitCareerApplication.mockResolvedValue({ ok: false, kind: "not_found" });
    expect(await applyForJobAction({ status: "idle" }, form(VALID))).toEqual({ status: "closed" });
  });
});

describe("withdrawApplicationAction", () => {
  const APPLICATION = {
    status: "withdrawn",
    statusLabel: "Withdrawn",
    jobTitle: "Field engineer",
    company: "WonderArk",
    appliedAt: null,
    updatedAt: null,
    canWithdraw: false,
  };

  it("withdraws with the token from the form and shows what WonderJobs returned", async () => {
    careerApplicationStatus.mockResolvedValue({ ok: true, data: APPLICATION });
    const result = await withdrawApplicationAction({ status: "idle" }, form({ token: "wjst_token_1234567890" }));
    expect(result).toEqual({ status: "withdrawn", application: APPLICATION });
    expect(careerApplicationStatus).toHaveBeenCalledWith("wjst_token_1234567890", "withdraw");
    expect(careersRateLimited).toHaveBeenCalledWith("status", 30);
  });

  it("says it couldn't find an unknown token", async () => {
    careerApplicationStatus.mockResolvedValue({ ok: false, kind: "not_found" });
    expect(await withdrawApplicationAction({ status: "idle" }, form({ token: "nope" }))).toEqual({
      status: "error",
      message: "We couldn't find that application. Use the link in your email.",
    });
  });
});
