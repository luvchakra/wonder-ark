"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { Textarea } from "@cofounderai/core/ui/textarea";
import { COVER_NOTE_MAX } from "@cofounderai/core/careers/application-input";
import { applyForJobAction, type ApplyState, type ApplyValues } from "../actions";

/**
 * PLATFORM-P1-13.1 -- the apply form. It posts to this app's own server action, which
 * validates, rate-limits and forwards the application to WonderJobs. "Application sent"
 * appears only after WonderJobs answered 200; a 400 or 409 message is shown as WonderJobs
 * wrote it, next to nothing else.
 */

type FieldName = keyof ApplyValues;

const FIELD_CLASS = "h-10 bg-landing-bg-elevated";

export function ApplyForm({ jobId, consent }: { jobId: string; consent: string }) {
  const [state, formAction, pending] = useActionState<ApplyState, FormData>(applyForJobAction, { status: "idle" });
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state.status !== "idle" && state.status !== "invalid") resultRef.current?.focus();
  }, [state]);

  if (state.status === "sent") {
    return (
      <div ref={resultRef} tabIndex={-1} role="status" className="mt-5 flex gap-3 rounded-xl border border-landing-surface-border bg-landing-bg p-4 text-sm text-landing-fg outline-none">
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-landing-accent" aria-hidden="true" />
        <p>Application sent. Check your email for a confirmation and a link to follow it.</p>
      </div>
    );
  }

  if (state.status === "closed") {
    return (
      <div ref={resultRef} tabIndex={-1} role="alert" className="mt-5 rounded-xl border border-landing-surface-border bg-landing-bg p-4 text-sm text-landing-fg outline-none">
        <p>This position is no longer open.</p>
        <Link href="/careers" className="mt-2 inline-block font-medium text-landing-accent hover:underline">
          See open positions
        </Link>
      </div>
    );
  }

  const values = state.status === "invalid" || state.status === "error" ? state.values : null;
  const errors = state.status === "invalid" ? state.fieldErrors : {};
  const value = (name: FieldName) => values?.[name] ?? "";
  const errorProps = (name: FieldName | "consent") =>
    errors[name] ? { "aria-invalid": true as const, "aria-describedby": `apply-${name}-error` } : {};

  return (
    <form action={formAction} noValidate className="mt-5 grid gap-5 sm:grid-cols-2" aria-busy={pending}>
      <input type="hidden" name="jobId" value={jobId} />
      {/* Hidden from people, and from assistive technology; bots fill it in. */}
      <div aria-hidden="true" className="absolute -left-[10000px] h-px w-px overflow-hidden">
        <label htmlFor="apply-website">Website</label>
        <input id="apply-website" name="website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
      </div>

      <Field name="name" label="Full name" error={errors.name}>
        <Input id="apply-name" name="name" required maxLength={120} autoComplete="name" defaultValue={value("name")} className={FIELD_CLASS} {...errorProps("name")} />
      </Field>
      <Field name="email" label="Email" error={errors.email}>
        <Input id="apply-email" name="email" type="email" required maxLength={200} autoComplete="email" defaultValue={value("email")} className={FIELD_CLASS} {...errorProps("email")} />
      </Field>
      <Field name="phone" label="Phone (optional)" error={errors.phone}>
        <Input id="apply-phone" name="phone" type="tel" maxLength={40} autoComplete="tel" defaultValue={value("phone")} className={FIELD_CLASS} {...errorProps("phone")} />
      </Field>
      <Field name="location" label="Location (optional)" error={errors.location}>
        <Input id="apply-location" name="location" maxLength={120} autoComplete="address-level2" placeholder="City, country" defaultValue={value("location")} className={FIELD_CLASS} {...errorProps("location")} />
      </Field>
      <Field name="resumeUrl" label="Résumé link" error={errors.resumeUrl} hint="An https link anyone can open: Google Drive, Dropbox, LinkedIn or your own site." wide>
        <Input id="apply-resumeUrl" name="resumeUrl" type="url" required maxLength={500} inputMode="url" placeholder="https://" defaultValue={value("resumeUrl")} className={FIELD_CLASS} {...errorProps("resumeUrl")} />
      </Field>
      <Field name="linkedinUrl" label="LinkedIn or portfolio (optional)" error={errors.linkedinUrl} wide>
        <Input id="apply-linkedinUrl" name="linkedinUrl" type="url" maxLength={500} inputMode="url" placeholder="https://" defaultValue={value("linkedinUrl")} className={FIELD_CLASS} {...errorProps("linkedinUrl")} />
      </Field>
      <Field name="coverNote" label="Cover note (optional)" error={errors.coverNote} wide>
        <Textarea id="apply-coverNote" name="coverNote" rows={5} maxLength={COVER_NOTE_MAX} defaultValue={value("coverNote")} className="bg-landing-bg-elevated" {...errorProps("coverNote")} />
      </Field>

      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <label className="flex items-start gap-3 text-sm text-landing-muted">
          <input
            type="checkbox"
            name="consent"
            required
            className="mt-0.5 size-4 shrink-0 accent-[var(--landing-accent)]"
            {...errorProps("consent")}
          />
          <span>{consent}</span>
        </label>
        {errors.consent ? (
          <p id="apply-consent-error" className="text-sm text-destructive">
            {errors.consent}
          </p>
        ) : null}
      </div>

      {state.status === "error" ? (
        <div ref={resultRef} tabIndex={-1} role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive outline-none sm:col-span-2">
          {state.message}
        </div>
      ) : null}

      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-landing-accent px-6 text-sm font-medium text-landing-accent-foreground hover:bg-landing-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-landing-accent disabled:opacity-70 sm:w-auto"
        >
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
          {pending ? "Sending…" : "Send application"}
        </button>
      </div>
    </form>
  );
}

function Field({
  name,
  label,
  error,
  hint,
  wide,
  children,
}: {
  name: FieldName;
  label: string;
  error?: string;
  hint?: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${wide ? "sm:col-span-2" : ""}`}>
      <Label htmlFor={`apply-${name}`} className="text-landing-fg">
        {label}
      </Label>
      {children}
      {error ? (
        <p id={`apply-${name}-error`} className="text-sm text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-landing-muted">{hint}</p>
      ) : null}
    </div>
  );
}
