import { safeHttpUrl } from "../../lib/data-sources/suggestions";
import { channelTypeLabel, formatAudience } from "../../lib/data-sources/channels";
import type { Prospect, ProspectFieldSource } from "../../lib/prospects/types";

/**
 * DISC-DATA-P0-04.1 (B4.6) and the prospect's own source, left over from B3: what is
 * known about a prospect, read-only, with where each value came from beside it --
 * "Industry: Software, from Wikidata". A value with no source beside it was typed by a
 * person. Editing lives behind "Edit details" on the page; this is the part to read.
 *
 * Everything a source supplied is shown as text. The only links are the company's own
 * website and profiles and the link back to the record at the source, each kept only
 * when it is a plain http(s) address.
 */
const FIELDS: { column: keyof Prospect & string; label: string; link?: boolean }[] = [
  { column: "website", label: "Website", link: true },
  { column: "industry", label: "Industry" },
  { column: "company_size", label: "Company size" },
  { column: "location", label: "Location" },
  { column: "company_email", label: "General company email" },
  { column: "phone", label: "Phone" },
  { column: "linkedin_url", label: "Company LinkedIn", link: true },
  { column: "twitter_url", label: "Company X/Twitter", link: true },
  { column: "description", label: "Description" },
];

/** DISC-CONS-P0-02.1: a channel's own fields. Its topics are kept in `industry`. */
const CHANNEL_FIELDS: { column: keyof Prospect & string; label: string; link?: boolean }[] = [
  { column: "channel_type", label: "Type" },
  { column: "audience_size", label: "Audience" },
  { column: "industry", label: "Topics" },
  { column: "location", label: "Location" },
  { column: "description", label: "Description" },
];

function displayValue(prospect: Prospect, column: string): string | null {
  if (column === "channel_type") return channelTypeLabel(prospect.channel_type);
  if (column === "audience_size") {
    // The date the source measured the audience, kept with its provenance.
    return formatAudience(prospect.audience_size, null, prospect.field_sources?.audience_size?.observedAt ?? null);
  }
  const value = prospect[column as keyof Prospect];
  return typeof value === "string" && value ? value : null;
}

function sourceOf(sources: Prospect["field_sources"], column: string): ProspectFieldSource | null {
  const entry = sources?.[column];
  return entry && typeof entry.name === "string" && entry.name ? entry : null;
}

export function ProspectDetails({ prospect }: { prospect: Prospect }) {
  const fields = prospect.kind === "channel" ? CHANNEL_FIELDS : FIELDS;
  const rows = fields.flatMap((field) => {
    const value = displayValue(prospect, field.column);
    return value ? [{ ...field, value }] : [];
  });
  const sourceRef = safeHttpUrl(prospect.source_ref);

  return (
    <div className="flex flex-col gap-3 text-sm">
      {prospect.source_name ? (
        <p className="text-muted-foreground">
          Source:{" "}
          {sourceRef ? (
            <a href={sourceRef} target="_blank" rel="noreferrer" className="underline underline-offset-2">
              {prospect.source_name}
            </a>
          ) : (
            prospect.source_name
          )}
        </p>
      ) : null}
      {rows.length === 0 ? (
        <p className="text-muted-foreground">No details yet.</p>
      ) : (
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-[max-content_1fr]">
          {rows.map((row) => {
            const source = sourceOf(prospect.field_sources, row.column);
            const href = row.link ? safeHttpUrl(row.value) : null;
            return (
              <div key={row.column} className="contents">
                <dt className="text-muted-foreground">{row.label}</dt>
                <dd className="min-w-0 break-words">
                  {href ? (
                    <a href={href} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                      {row.value}
                    </a>
                  ) : (
                    row.value
                  )}
                  {source ? <span className="text-muted-foreground">, from {source.name}</span> : null}
                </dd>
              </div>
            );
          })}
        </dl>
      )}
    </div>
  );
}
