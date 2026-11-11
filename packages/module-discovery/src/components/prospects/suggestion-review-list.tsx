import { Badge } from "@cofounderai/core/ui/badge";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { categoryOf, matchedTitlesOf, safeHttpUrl } from "../../lib/data-sources/suggestions";
import { WEB_SEARCH_SOURCE_ID, WEB_SEARCH_SOURCE_LABEL } from "../../lib/data-sources/types";
import type { ProspectSuggestion } from "../../lib/prospects/types";

/**
 * DISC-DATA-P0-03.2: the "To review" list. Each suggestion shows its name, place,
 * category, one match reason and a source badge; nothing here is a prospect until it is
 * approved.
 *
 * One list, laid out twice by CSS rather than rendered twice: a card per suggestion on a
 * phone, and the same items as aligned rows under a header from `md` up. A second copy
 * of the markup would submit every checkbox twice.
 *
 * A row carries one control of its own, its checkbox; Approve and Discard act on the
 * ticked rows. The source badge is the provenance: it names where the record came from
 * and, when the source gave one, links back to it.
 *
 * Everything shown is the stored text of a suggestion, rendered as text.
 */

const ROW_GRID =
  "md:grid md:grid-cols-[1.5rem_minmax(0,2fr)_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,3fr)_minmax(0,1.5fr)] md:items-start md:gap-3";

function sourceLabelOf(suggestion: ProspectSuggestion): string {
  if (suggestion.source_name) return suggestion.source_name;
  // A suggestion staged before sources were recorded came from the AI web search, the
  // only source there was.
  if (!suggestion.source || suggestion.source === WEB_SEARCH_SOURCE_ID) return WEB_SEARCH_SOURCE_LABEL;
  return suggestion.source;
}

function SourceBadge({ suggestion }: { suggestion: ProspectSuggestion }) {
  const label = sourceLabelOf(suggestion);
  const href = safeHttpUrl(suggestion.source_ref ?? suggestion.source_url);
  return (
    <Badge variant="outline" className="max-w-full font-normal">
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" className="truncate underline-offset-2 hover:underline">
          {label}
        </a>
      ) : (
        <span className="truncate">{label}</span>
      )}
    </Badge>
  );
}

export function SuggestionReviewList({
  suggestions,
  approveAction,
  discardAction,
}: {
  suggestions: ProspectSuggestion[];
  approveAction: (formData: FormData) => Promise<void>;
  discardAction: (formData: FormData) => Promise<void>;
}) {
  return (
    <section aria-labelledby="to-review-heading" className="flex flex-col gap-3">
      <h2 id="to-review-heading" className="text-base font-medium">
        To review{suggestions.length > 0 ? ` (${suggestions.length})` : ""}
      </h2>

      {suggestions.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Nothing is waiting for review. Run a search above and what it finds will appear here.
        </p>
      ) : (
        <form action={approveAction} className="flex flex-col gap-3">
          <div
            aria-hidden="true"
            className={`hidden px-3 text-xs font-medium text-muted-foreground ${ROW_GRID}`}
          >
            <span />
            <span>Name</span>
            <span>Place</span>
            <span>Category</span>
            <span>Why it fits</span>
            <span>Source</span>
          </div>
          <ul className="flex flex-col gap-3 md:gap-0 md:divide-y md:rounded-lg md:border md:bg-card">
            {suggestions.map((s) => {
              const category = categoryOf(s.payload) ?? s.industry;
              const titles = matchedTitlesOf(s.payload);
              const website = safeHttpUrl(s.website);
              return (
                <li
                  key={s.id}
                  className={`relative flex flex-col gap-1.5 rounded-lg border bg-card p-3 text-sm md:rounded-none md:border-0 md:bg-transparent ${ROW_GRID}`}
                >
                  <input
                    type="checkbox"
                    name="ids"
                    value={s.id}
                    defaultChecked
                    aria-label={`Select ${s.company_name}`}
                    className="absolute top-3 right-3 size-4 md:static md:mt-0.5"
                  />
                  <div className="flex min-w-0 flex-col pr-6 md:pr-0">
                    <span className="font-medium break-words">{s.company_name}</span>
                    {website ? (
                      <span className="truncate text-xs text-muted-foreground">{new URL(website).hostname}</span>
                    ) : null}
                  </div>
                  <p className="text-muted-foreground md:text-foreground">
                    <span className="md:hidden">Place: </span>
                    {s.location ?? "—"}
                  </p>
                  <p className="text-muted-foreground md:text-foreground">
                    <span className="md:hidden">Category: </span>
                    {category ?? "—"}
                  </p>
                  <div className="flex min-w-0 flex-col gap-1">
                    <p className="line-clamp-2">{s.match_reason ?? "—"}</p>
                    {titles.length > 0 ? (
                      <p className="line-clamp-1 text-xs text-muted-foreground">Roles: {titles.join(", ")}</p>
                    ) : null}
                  </div>
                  <div className="min-w-0">
                    <SourceBadge suggestion={s} />
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            <SubmitButton>Approve selected</SubmitButton>
            <SubmitButton variant="ghost" formAction={discardAction}>
              Discard selected
            </SubmitButton>
          </div>
        </form>
      )}
    </section>
  );
}
