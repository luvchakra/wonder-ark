import { z } from "zod";

/**
 * PLATFORM-P1-13.1 -- the apply form's server-side validation, run before anything is
 * forwarded to WonderJobs (which validates again and is the system of record). Trims every
 * field, applies the form's own length limits, and accepts only https links.
 */

export const COVER_NOTE_MAX = 4000;

/** An absolute https URL with a real host and no embedded credentials. */
export function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.includes(".") && !url.username && !url.password;
  } catch {
    return false;
  }
}

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} must be ${max} characters or fewer.`)
    .transform((v) => (v === "" ? undefined : v));

const httpsUrl = (label: string) =>
  z
    .string()
    .trim()
    .max(500, `${label} must be 500 characters or fewer.`)
    .refine((v) => v === "" || isHttpsUrl(v), `${label} must be a full https:// link.`);

export const applicationInputSchema = z.object({
  name: z.string().trim().min(1, "Enter your full name.").max(120, "Name must be 120 characters or fewer."),
  email: z.string().trim().max(200, "Email must be 200 characters or fewer.").pipe(z.email("Enter a valid email address.")),
  phone: optionalText(40, "Phone"),
  location: optionalText(120, "Location"),
  linkedinUrl: httpsUrl("LinkedIn or portfolio link").transform((v) => (v === "" ? undefined : v)),
  resumeUrl: httpsUrl("Résumé link").refine((v) => v !== "", "Add a link to your résumé."),
  coverNote: optionalText(COVER_NOTE_MAX, "Cover note"),
  consent: z.literal(true, { error: "Tick the box to agree before applying." }),
});

export type ApplicationInput = z.output<typeof applicationInputSchema>;

export type ApplicationFieldErrors = Partial<Record<keyof ApplicationInput, string>>;

export function parseApplicationInput(
  raw: Record<string, unknown>,
): { ok: true; data: ApplicationInput } | { ok: false; fieldErrors: ApplicationFieldErrors } {
  const parsed = applicationInputSchema.safeParse(raw);
  if (parsed.success) return { ok: true, data: parsed.data };
  const fieldErrors: ApplicationFieldErrors = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path[0] as keyof ApplicationInput | undefined;
    if (key && !(key in fieldErrors)) fieldErrors[key] = issue.message;
  }
  return { ok: false, fieldErrors };
}
