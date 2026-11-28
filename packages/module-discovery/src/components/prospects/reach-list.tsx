"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { Input } from "@cofounderai/core/ui/input";
import type { AiActionState } from "@cofounderai/core/actions/ai-action-state";
import type { ProspectWithPipeline } from "../../lib/prospects/queries";
import { NEXT_ACTION_ANCHOR } from "../../lib/prospects/pipeline";
import { PERSON_GROUPS, prospectGroups, type GroupId } from "../../lib/journey/todo";
import { channelTypeLabel, formatAudience } from "../../lib/data-sources/channels";
import { ScoreRagDot } from "./rag-badge";
import { DmCard } from "./dm-card";

/** Above this many, a search box helps find one by name. */
const SEARCH_FROM = 10;

/** The one action a card of the person's own groups names. */
const CARD_ACTION: Partial<Record<GroupId, string>> = { answer: "Answer", "follow-up": "Follow up", send: "Review and send", "needs-email": "Add email and send" };

type FormAction = (prevState: AiActionState, formData: FormData) => Promise<AiActionState>;

/** DISC-REACH-P0-01.1: what a direct message's card needs, by prospect id. */
export type DirectMessage = {
  text: string;
  /** "Instagram" */
  platform: string;
  profileLink: string | null;
  markSentAction: () => void | Promise<void>;
  editAction: FormAction;
  rewriteAction: FormAction;
};

/**
 * DISC-NAV-P0-02.5: the Prospects tab's list (owner, 2026-11-29: everything done with an
 * approved prospect is here; Search only finds new ones). The person's own groups come
 * first and are open, each card naming its one action: answer a reply, follow up, send a
 * ready email, add a missing address, or a direct message to copy and send (DmCard). The
 * rest (to prepare, waiting for a reply, closed) say how far each has got, so they are
 * closed lines with a count that open on a click, or while a search is typed. With
 * nothing in the person's groups, one line says so.
 */
export function ReachList({
  prospects,
  basePath,
  channels = false,
  directMessages = {},
}: {
  prospects: ProspectWithPipeline[];
  basePath: string;
  channels?: boolean;
  directMessages?: Record<string, DirectMessage>;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const groups = useMemo(
    () => prospectGroups(q ? prospects.filter((p) => p.company_name.toLowerCase().includes(q)) : prospects),
    [prospects, q],
  );

  if (prospects.length === 0) {
    return (
      <p className="rounded-md border p-4 text-sm text-muted-foreground">
        No {channels ? "channels" : "prospects"} approved yet. Find and approve some on Search.
      </p>
    );
  }

  const mine = groups.filter((group) => PERSON_GROUPS.includes(group.id));
  const rest = groups.filter((group) => !PERSON_GROUPS.includes(group.id));

  return (
    <div className="flex flex-col gap-4">
      {prospects.length > SEARCH_FROM ? (
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={channels ? "Search by channel name..." : "Search by company name..."}
            aria-label="Search"
            className="pl-8"
          />
        </div>
      ) : null}

      {groups.length === 0 ? <p className="text-sm text-muted-foreground">None match.</p> : null}
      {mine.length === 0 && !q ? <p className="text-sm text-muted-foreground">Nothing needs you right now.</p> : null}

      {mine.map((group) => (
        <section key={group.id} id={`reach-${group.id}`} aria-labelledby={`reach-${group.id}-title`} className="flex scroll-mt-4 flex-col gap-2">
          <h2 id={`reach-${group.id}-title`} className="text-sm font-semibold">
            {group.title}
          </h2>
          {group.id === "needs-email" ? (
            <p className="text-xs text-muted-foreground">Their email is written, but there is no address to send it to yet.</p>
          ) : null}
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {group.prospects.map((p) => {
              const dm = group.id === "dm" ? directMessages[p.id] : undefined;
              return dm ? (
                <DmCard
                  key={p.id}
                  name={p.company_name}
                  detail={p.audience_size ? `${formatAudience(p.audience_size)} audience` : null}
                  prospectHref={`${basePath}/${p.id}#messages`}
                  {...dm}
                />
              ) : (
                <ReachCard key={p.id} prospect={p} basePath={basePath} action={CARD_ACTION[group.id] ?? (group.id === "dm" ? "Review" : undefined)} />
              );
            })}
          </ul>
        </section>
      ))}

      {rest.map((group) => (
        <details key={group.id} id={`reach-${group.id}`} open={q ? true : undefined} className="group scroll-mt-4 rounded-lg border bg-card">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-sm font-semibold [&::-webkit-details-marker]:hidden">
            {group.title}
            <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <ul className="grid grid-cols-1 gap-2 border-t p-2 sm:grid-cols-2 lg:grid-cols-3">
            {group.prospects.map((p) => (
              <ReachCard key={p.id} prospect={p} basePath={basePath} />
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
}

function ReachCard({ prospect: p, basePath, action }: { prospect: ProspectWithPipeline; basePath: string; action?: string }) {
  const anchor = p.nextAction ? NEXT_ACTION_ANCHOR[p.nextAction] : undefined;
  const details =
    p.kind === "channel"
      ? [channelTypeLabel(p.channel_type), p.audience_size ? `${formatAudience(p.audience_size)} audience` : null]
      : [p.industry, p.location];
  const line = details.filter(Boolean).join(" · ");
  return (
    <li>
      <Link
        href={`${basePath}/${p.id}#${anchor ?? (action ? "messages" : "")}`.replace(/#$/, "")}
        className="flex min-w-0 items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2.5 text-sm transition-colors hover:border-primary hover:bg-accent/40"
      >
        <span className="min-w-0">
          <span className="block truncate font-medium">{p.company_name}</span>
          {line ? <span className="block truncate text-xs text-muted-foreground">{line}</span> : null}
        </span>
        {action ? (
          <span className="inline-flex shrink-0 items-center gap-0.5 text-xs font-medium text-primary">
            {action}
            <ChevronRight className="size-3.5" aria-hidden="true" />
          </span>
        ) : p.fit_score !== null && p.fit_score !== undefined ? (
          <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground" title="Fit score">
            <ScoreRagDot score={p.fit_score} />
            {p.fit_score}
          </span>
        ) : null}
      </Link>
    </li>
  );
}
