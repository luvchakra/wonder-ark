/**
 * DISC-CAMP-P0-03.1: filling a campaign message's merge fields. Pure and deterministic:
 * the text a prospect receives is the template a person could read before launch, with
 * a closed list of fields filled by this code from the workspace's own rows. No model
 * is involved.
 *
 * Two rules matter more than the substitution itself:
 *  - a template may use only the fields listed here. Anything else in double braces is
 *    refused when the template is saved, so nothing unfilled can reach a recipient;
 *  - if a field the template uses has no value for a prospect, nothing is rendered: the
 *    caller skips that prospect with the reason. A message with a hole in it is never
 *    sent.
 *
 * Values come from prospect records, which a source or an import may have written, so
 * they are data: control characters and line breaks are removed and the length capped
 * before they are placed in the text. They are never read as template syntax, because
 * substitution is a single pass.
 */

export const MERGE_FIELDS = ["company", "city", "line_of_work", "first_name", "offering", "sender_name", "business_name"] as const;
export type MergeField = (typeof MERGE_FIELDS)[number];

export const MERGE_FIELD_LABEL: Record<MergeField, string> = {
  company: "the prospect's company name",
  city: "the first part of the prospect's location",
  line_of_work: "the prospect's line of work",
  first_name: "the contact's first name",
  offering: "your offering's name",
  sender_name: "the name emails are sent from",
  business_name: "your business's name",
};

const PLACEHOLDER = /\{\{\s*([^{}]*?)\s*\}\}/g;
const isMergeField = (name: string): name is MergeField => (MERGE_FIELDS as readonly string[]).includes(name);

/** The merge fields a text uses, and anything in double braces that is not one. */
export function fieldsUsed(text: string): { fields: MergeField[]; unknown: string[] } {
  const fields = new Set<MergeField>();
  const unknown = new Set<string>();
  for (const match of text.matchAll(PLACEHOLDER)) {
    const name = match[1]!.toLowerCase();
    if (isMergeField(name)) fields.add(name);
    else unknown.add(match[1]!.slice(0, 40));
  }
  // A lone "{{" or "}}" left after the well-formed ones is a broken placeholder.
  const rest = text.replace(PLACEHOLDER, "");
  if (rest.includes("{{") || rest.includes("}}")) unknown.add("{{");
  return { fields: [...fields], unknown: [...unknown] };
}

/** Why a template cannot be saved, or null when it can. */
export function templateProblem(subject: string | null, body: string): string | null {
  const { unknown } = fieldsUsed(`${subject ?? ""}\n${body}`);
  if (unknown.length === 0) return null;
  const allowed = MERGE_FIELDS.map((field) => `{{${field}}}`).join(", ");
  return unknown.includes("{{")
    ? `A merge field isn't closed properly. Use one of: ${allowed}.`
    : `"${unknown[0]}" isn't a merge field. Use one of: ${allowed}.`;
}

export type MergeValues = Partial<Record<MergeField, string | null | undefined>>;

function clean(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  // eslint-disable-next-line no-control-regex
  const text = value.replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
  return text.length > 0 ? text : null;
}

export type Rendered =
  | { ok: true; subject: string; body: string }
  | { ok: false; reason: "missing_merge_field"; missing: MergeField[] }
  | { ok: false; reason: "invalid_template"; unknown: string[] };

/**
 * Fills a template for one prospect, or says why it cannot be filled. Nothing partial is
 * ever returned.
 */
export function renderTemplate(template: { subject: string | null; body: string }, values: MergeValues): Rendered {
  const subject = template.subject ?? "";
  const used = fieldsUsed(`${subject}\n${template.body}`);
  if (used.unknown.length > 0) return { ok: false, reason: "invalid_template", unknown: used.unknown };

  const filled = new Map<MergeField, string>();
  const missing: MergeField[] = [];
  for (const field of used.fields) {
    const value = clean(values[field]);
    if (value === null) missing.push(field);
    else filled.set(field, value);
  }
  if (missing.length > 0) return { ok: false, reason: "missing_merge_field", missing };

  // One pass: a value that itself contains "{{...}}" is placed as text and never read again.
  const fill = (text: string) => text.replace(PLACEHOLDER, (_match, name: string) => filled.get(name.toLowerCase() as MergeField) ?? "");
  const renderedSubject = fill(subject).replace(/\s+/g, " ").trim();
  const body = fill(template.body).trim();
  if (!renderedSubject || !body) return { ok: false, reason: "invalid_template", unknown: [] };
  return { ok: true, subject: renderedSubject, body };
}

/** The `city` merge field: the first part of the prospect's location as it is stored
 * ("Pune" from "Pune, Maharashtra"). Nothing is looked up or guessed; a prospect with no
 * location has no city, and a template that uses the field skips it. */
export function cityOf(location: string | null | undefined): string | null {
  const first = (location ?? "").split(",")[0]?.trim();
  return first ? first : null;
}
