import Link from "next/link";
import { LEAD_SOURCE_LABEL, LEAD_STATUS_LABEL, type AudienceLeadWithReferrals } from "../../lib/audience/types";

const DAY = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" });

/**
 * DISC-CONS-P0-05.2: the People list. Each person's status, tags, source and how many
 * people joined through their link, as aligned rows from `md` up and one card per person
 * below it (principle 12). A row opens the person's page; it carries no other control.
 */
export function PeopleList({ leads, basePath }: { leads: AudienceLeadWithReferrals[]; basePath: string }) {
  if (leads.length === 0) {
    return (
      <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
        No one has signed up yet. Share your sign-up page, or import a list of people who agreed to hear from you.
      </p>
    );
  }
  return (
    <div className="flex flex-col">
      <div aria-hidden="true" className="hidden grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1fr)_6rem] gap-3 px-3 pb-2 text-xs font-medium text-muted-foreground md:grid">
        <span>Person</span>
        <span>Status</span>
        <span>Tags</span>
        <span>Source</span>
        <span>Referrals</span>
      </div>
      <ul className="flex flex-col gap-3 md:gap-0 md:divide-y md:rounded-lg md:border md:bg-card">
        {leads.map((lead) => (
          <li
            key={lead.id}
            className="relative flex flex-col gap-1.5 rounded-lg border bg-card p-3 text-sm md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1fr)_6rem] md:items-center md:gap-3 md:rounded-none md:border-0 md:bg-transparent"
          >
            <Link href={`${basePath}/${lead.id}`} className="absolute inset-0" aria-label={lead.name ?? lead.email} />
            <div className="flex min-w-0 flex-col">
              <span className="truncate font-medium">{lead.name ?? lead.email}</span>
              {lead.name ? <span className="truncate text-xs text-muted-foreground">{lead.email}</span> : null}
              <span className="text-xs text-muted-foreground">Joined {DAY.format(new Date(lead.created_at))}</span>
            </div>
            <p>
              <span className="text-muted-foreground md:hidden">Status: </span>
              {LEAD_STATUS_LABEL[lead.status] ?? lead.status}
            </p>
            <p className="min-w-0 truncate">
              <span className="text-muted-foreground md:hidden">Tags: </span>
              {lead.tags.length > 0 ? lead.tags.join(", ") : "—"}
            </p>
            <p>
              <span className="text-muted-foreground md:hidden">Source: </span>
              {LEAD_SOURCE_LABEL[lead.source] ?? lead.source}
            </p>
            <p>
              <span className="text-muted-foreground md:hidden">Referrals: </span>
              {lead.referrals}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
