import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getWorkspaceForProduct } from "@cofounderai/module-discovery/lib/tenancy/queries";
import { listProspects, listProspectSuggestions } from "@cofounderai/module-discovery/lib/prospects/queries";
import { NEXT_ACTION_ANCHOR } from "@cofounderai/module-discovery/lib/prospects/pipeline";
import { PERSON_GROUPS, prospectGroups, type GroupId } from "@cofounderai/module-discovery/lib/journey/todo";
import { listCampaignTasks } from "@cofounderai/module-discovery/lib/campaigns/tasks";
import { TodayList } from "@cofounderai/module-discovery/components/prospects/today-list";
import { SuggestionReviewList } from "@cofounderai/module-discovery/components/prospects/suggestion-review-list";
import { approveSuggestionsAction, discardSuggestionsAction } from "./prospects/discover/actions";
import { markTaskDoneAction } from "./campaigns/actions";

/** What pressing a card does, in the card's words. */
const CARD_ACTION: Partial<Record<GroupId, string>> = { answer: "Answer", "follow-up": "Follow up", send: "Review and send" };

/**
 * DISC-NAV-P0-02.1: To do, the offering's page once it is set up (owner-approved redesign,
 * 2026-11-22). The only list the person works from, most urgent first: replies to answer,
 * prospects to follow up, messages ready to send, campaign steps done by hand, then new
 * prospects to approve. Everything else (research, scoring, writing) WonderArk does by
 * itself. Empty means nothing needs the person.
 */
export async function TodoView({
  businessId,
  businessSlug,
  productId,
  approved,
  duplicates,
}: {
  businessId: string;
  businessSlug: string;
  productId: string;
  approved?: string;
  duplicates?: string;
}) {
  const workspace = await getWorkspaceForProduct(productId);
  if (!workspace) return null;
  const [picked, suggestions, toPick, campaignTasks] = await Promise.all([
    listProspects(workspace.id, { shortlisted: true }),
    listProspectSuggestions(workspace.id),
    listProspects(workspace.id, { shortlisted: false }),
    listCampaignTasks(workspace.id),
  ]);
  const base = `/${businessSlug}/discovery/offerings/${productId}`;
  const groups = prospectGroups(picked).filter((group) => PERSON_GROUPS.includes(group.id));
  const tasksDue = campaignTasks.tasks.length > 0;
  const nothing = groups.length === 0 && suggestions.length === 0 && toPick.length === 0 && !tasksDue;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="sr-only">To do</h1>

      {approved ? (
        <p role="status" className="rounded-md border bg-muted p-3 text-sm">
          Approved {approved}. {approved === "0" ? "" : "WonderArk is preparing them: research, score and a first message for you to send."}
          {duplicates && duplicates !== "0" ? ` Skipped ${duplicates} already in your prospects.` : ""}
        </p>
      ) : null}

      {groups.map((group) => (
        <section key={group.id} aria-labelledby={`todo-${group.id}`} className="flex flex-col gap-2">
          <h2 id={`todo-${group.id}`} className="text-sm font-semibold">
            {group.title}
          </h2>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {group.prospects.map((p) => {
              const anchor = (p.nextAction && NEXT_ACTION_ANCHOR[p.nextAction]) || "messages";
              return (
                <li key={p.id}>
                  <Link
                    href={`${base}/prospects/${p.id}#${anchor}`}
                    className="flex min-w-0 items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2.5 text-sm transition-colors hover:border-primary hover:bg-accent/40"
                  >
                    <span className="min-w-0 truncate font-medium">{p.company_name}</span>
                    <span className="inline-flex shrink-0 items-center gap-0.5 text-xs font-medium text-primary">
                      {CARD_ACTION[group.id]}
                      <ChevronRight className="size-3.5" aria-hidden="true" />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {/* DISC-CAMP-P0-06.1: a running campaign's call, WhatsApp and LinkedIn steps that are due. */}
      <TodayList rows={[]} tasks={campaignTasks} taskAction={(enrollmentId) => markTaskDoneAction.bind(null, businessId, productId, enrollmentId)} />

      {suggestions.length > 0 ? (
        <SuggestionReviewList
          suggestions={suggestions}
          title="New prospects to approve"
          returnTo="todo"
          approveAction={approveSuggestionsAction.bind(null, businessId, productId, workspace.id)}
          discardAction={discardSuggestionsAction.bind(null, businessId, productId, workspace.id)}
        />
      ) : null}

      {toPick.length > 0 ? (
        <Link href={`${base}/prospects/discover#to-pick`} className="flex items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3 text-sm hover:border-primary">
          <span>
            {toPick.length} imported {toPick.length === 1 ? "prospect" : "prospects"} to pick
          </span>
          <span className="inline-flex items-center gap-0.5 font-medium text-primary">
            Pick
            <ChevronRight className="size-4" aria-hidden="true" />
          </span>
        </Link>
      ) : null}

      {nothing ? (
        <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-6">
          <p className="font-medium">Nothing needs you right now.</p>
          <p className="text-sm text-muted-foreground">
            {picked.length === 0
              ? "Find prospects that match your ideal customer. You approve who to contact; WonderArk prepares the rest."
              : "Replies, follow-ups and messages ready to send will appear here."}
          </p>
          <Link href={`${base}/prospects/discover`} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            Find {picked.length === 0 ? "" : "more "}prospects
          </Link>
        </div>
      ) : (
        <Link href={`${base}/prospects/discover`} className="self-start text-sm font-medium text-primary hover:underline">
          Find more prospects
        </Link>
      )}
    </div>
  );
}
