import { Badge } from "@cofounderai/core/ui/badge";
import type { IcpProfileVersion, IcpProfileVersionSource } from "../../lib/icp/types";

const SOURCE_LABEL: Record<IcpProfileVersionSource, string> = {
  ai_generated: "AI generated",
  user_edit: "Manual edit",
};

const SOURCE_BADGE_VARIANT: Record<IcpProfileVersionSource, "secondary" | "outline"> = {
  ai_generated: "secondary",
  user_edit: "outline",
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** Only the fields most useful for telling one version apart from another at a glance --
 * not every one of `IcpProfile`'s dozen list fields, which would make each expanded
 * version as long as the live edit form itself for little added benefit skimming history. */
function VersionFieldSummary({ version }: { version: IcpProfileVersion }) {
  const rows: { label: string; items: string[] }[] = [
    { label: "Industries", items: version.industries },
    { label: "Company sizes", items: version.company_sizes },
    { label: "Roles", items: version.roles },
    { label: "Pain points", items: version.pain_points },
    { label: "Buying signals", items: version.buying_signals },
    { label: "Exclusions", items: version.exclusions },
  ];
  return (
    <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
      {version.description ? (
        <div className="sm:col-span-2">
          <dt className="text-muted-foreground">Description</dt>
          <dd>{version.description}</dd>
        </div>
      ) : null}
      {rows
        .filter((row) => row.items.length > 0)
        .map((row) => (
          <div key={row.label}>
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd>{row.items.join(", ")}</dd>
          </div>
        ))}
      {version.confidence !== null ? (
        <div>
          <dt className="text-muted-foreground">Confidence</dt>
          <dd>{Math.round(version.confidence * 100)}%</dd>
        </div>
      ) : null}
    </dl>
  );
}

/**
 * DISC-OFFER-P0-14.2: "ICP v1 / ICP v2 / ICP v3" -- every past content snapshot for this
 * ICP, most recent (= current) first, with the top entry explicitly labeled "(current)"
 * -- the doc's own explicit "current version is clearly identified" line, not left to be
 * inferred from list order alone. That version number also matches the live form's own
 * "v{n}" badge shown just above this section on the ICP page. Read-only by
 * design (the same treatment this module already gives `confidence`/`evidence`): a past
 * version is a historical record to review, not something to restore from -- rolling
 * back to an old version isn't something the doc's own acceptance line asks for, and
 * building it would be scope creep past what this story needs (CLAUDE.md dev principle
 * #7).
 */
export function IcpVersionHistory({ versions }: { versions: IcpProfileVersion[] }) {
  if (versions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No version history yet: this ideal customer predates version tracking and hasn&apos;t been regenerated or saved since.</p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {versions.map((version, i) => (
        <li key={version.id} className="rounded-lg border border-border p-3 text-sm">
          <details>
            <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
              <span className="font-medium">
                v{version.version}
                {i === 0 ? <span className="ml-1.5 text-xs font-normal text-muted-foreground">(current)</span> : null}
              </span>
              <span className="flex items-center gap-2">
                <Badge variant={SOURCE_BADGE_VARIANT[version.source]}>{SOURCE_LABEL[version.source]}</Badge>
                <span className="text-xs text-muted-foreground">{formatDateTime(version.created_at)}</span>
              </span>
            </summary>
            <VersionFieldSummary version={version} />
          </details>
        </li>
      ))}
    </ul>
  );
}
