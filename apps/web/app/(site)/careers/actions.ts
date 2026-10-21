"use server";

import { parseApplicationInput, type ApplicationFieldErrors } from "@cofounderai/core/careers/application-input";
import type { ApplicationStatus } from "@cofounderai/core/careers/format";
import { careerApplicationStatus, failureMessage, submitCareerApplication } from "@cofounderai/core/careers/wonderjobs";
import { careersRateLimited } from "@/lib/careers-rate-limit";

/**
 * PLATFORM-P1-13.1 -- the public Careers forms. The browser posts here (a server action,
 * so Next's same-origin check applies); this server validates, rate-limits per address and
 * only then calls WonderJobs, which stores the application and sends every email. Nothing
 * submitted is stored or logged here.
 */

export type ApplyValues = {
  name: string;
  email: string;
  phone: string;
  location: string;
  linkedinUrl: string;
  resumeUrl: string;
  coverNote: string;
};

export type ApplyState =
  | { status: "idle" }
  | { status: "sent" }
  | { status: "closed" }
  | { status: "invalid"; fieldErrors: ApplicationFieldErrors; values: ApplyValues }
  | { status: "error"; message: string; values: ApplyValues };

const APPLY_LIMIT_PER_HOUR = 10;
const STATUS_LIMIT_PER_HOUR = 30;

/** A form field as a string, capped well above any real limit so validation still reports it. */
function field(form: FormData, name: string, cap = 8000): string {
  const value = form.get(name);
  return typeof value === "string" ? value.slice(0, cap) : "";
}

export async function applyForJobAction(_prev: ApplyState, form: FormData): Promise<ApplyState> {
  // A field people never see. Whatever fills it in is a bot: it is told the application
  // went through, and nothing is sent anywhere.
  if (field(form, "website")) return { status: "sent" };

  const jobId = field(form, "jobId", 200);
  const values: ApplyValues = {
    name: field(form, "name"),
    email: field(form, "email"),
    phone: field(form, "phone"),
    location: field(form, "location"),
    linkedinUrl: field(form, "linkedinUrl"),
    resumeUrl: field(form, "resumeUrl"),
    coverNote: field(form, "coverNote"),
  };

  const parsed = parseApplicationInput({ ...values, consent: form.get("consent") === "on" });
  if (!parsed.ok) return { status: "invalid", fieldErrors: parsed.fieldErrors, values };

  if (await careersRateLimited("apply", APPLY_LIMIT_PER_HOUR)) {
    return { status: "error", message: "Too many applications from your network in the last hour. Please try again later.", values };
  }

  const result = await submitCareerApplication(jobId, parsed.data);
  if (result.ok) return { status: "sent" };
  if (result.kind === "not_found") return { status: "closed" };
  if (result.kind === "bad_request" || result.kind === "conflict" || result.kind === "busy") {
    return { status: "error", message: failureMessage(result), values };
  }
  return { status: "error", message: "Your application couldn't be sent. Please try again in a few minutes.", values };
}

export type WithdrawState =
  | { status: "idle" }
  | { status: "withdrawn"; application: ApplicationStatus }
  | { status: "error"; message: string };

export async function withdrawApplicationAction(_prev: WithdrawState, form: FormData): Promise<WithdrawState> {
  if (await careersRateLimited("status", STATUS_LIMIT_PER_HOUR)) {
    return { status: "error", message: "Too many requests from your network. Please try again later." };
  }
  const result = await careerApplicationStatus(field(form, "token", 600), "withdraw");
  if (result.ok) return { status: "withdrawn", application: result.data };
  if (result.kind === "not_found" || result.kind === "bad_request") {
    return { status: "error", message: "We couldn't find that application. Use the link in your email." };
  }
  if (result.kind === "conflict") return { status: "error", message: result.message };
  if (result.kind === "busy") return { status: "error", message: failureMessage(result) };
  return { status: "error", message: "Your application couldn't be withdrawn right now. Please try again in a few minutes." };
}
