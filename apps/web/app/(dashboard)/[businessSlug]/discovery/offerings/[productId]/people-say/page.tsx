import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { getProduct, getWorkspaceForProduct } from "@cofounderai/module-discovery/lib/tenancy/queries";
import { getLatestThemes } from "@cofounderai/module-discovery/lib/audience/themes";
import { IDEAL_USER_FIELD_LABEL } from "@cofounderai/module-discovery/lib/icp/audience";
import { AiActionForm } from "@cofounderai/module-discovery/components/ai/ai-action-form";
import { createClient } from "@cofounderai/module-discovery/db/server";
import { summariseAction } from "./actions";

const DAY = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" });

/**
 * DISC-CONS-P0-04.2/04.3: "What people say". The newest AI summary of the offering's
 * feedback, labelled AI-generated, each theme linking to the entries behind it; a theme
 * that suggests an Ideal-user edit links to the ideal customer page, where a person
 * accepts or rejects it. One primary action: Summarise.
 */
export default async function PeopleSayPage({ params }: { params: Promise<{ businessSlug: string; productId: string }> }) {
  const { businessSlug, productId } = await params;
  const businessId = await resolveBusinessIdBySlug(businessSlug);
  if (!businessId) notFound();
  const product = await getProduct(productId);
  if (!product || product.business_id !== businessId) notFound();
  const workspace = await getWorkspaceForProduct(product.id);
  if (!workspace) notFound();

  const supabase = await createClient();
  const [summary, { count }] = await Promise.all([
    getLatestThemes(workspace.id),
    supabase.from("audience_feedback").select("id", { count: "exact", head: true }).eq("workspace_id", workspace.id),
  ]);
  const feedbackCount = count ?? 0;

  // Where each cited entry lives, read through the member's session.
  const entryIds = [...new Set(summary?.themes.flatMap((theme) => theme.entryIds) ?? [])];
  const { data: entries } = entryIds.length
    ? await supabase.from("audience_feedback").select("id, lead_id, prospect_id").in("id", entryIds)
    : { data: [] as { id: string; lead_id: string | null; prospect_id: string | null }[] };
  const base = `/${businessSlug}/discovery/offerings/${productId}`;
  const hrefOf = new Map(
    (entries ?? []).map((entry) => [
      entry.id as string,
      entry.lead_id ? `${base}/prospects/people/${entry.lead_id}#feedback-${entry.id}` : `${base}/prospects/${entry.prospect_id}`,
    ]),
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-medium">What people say</h1>
          <p className="text-sm text-muted-foreground">
            {feedbackCount === 0
              ? "No feedback yet. Log a conversation or send questions from a person's page under Prospects, People."
              : `Themes across ${feedbackCount} piece${feedbackCount === 1 ? "" : "s"} of feedback.`}
          </p>
        </div>
        {feedbackCount > 0 ? (
          <AiActionForm action={summariseAction.bind(null, businessId, productId, workspace.id)} buttonLabel="Summarise" pendingText="Summarising..." />
        ) : null}
      </div>

      {summary ? (
        <section className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">
            AI-generated from {summary.entry_count} entr{summary.entry_count === 1 ? "y" : "ies"} on {DAY.format(new Date(summary.created_at))}.
          </p>
          <ul className="flex flex-col gap-3">
            {summary.themes.map((theme, index) => (
              <li key={index} className="flex flex-col gap-2 rounded-md border p-3 text-sm">
                <h2 className="font-medium">{theme.title}</h2>
                <p>{theme.summary}</p>
                <p className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                  From:
                  {theme.entryIds.map((id, n) => {
                    const href = hrefOf.get(id);
                    return href ? (
                      <Link key={id} href={href} className="underline underline-offset-2">
                        entry {n + 1}
                      </Link>
                    ) : (
                      <span key={id}>entry {n + 1} (no longer available)</span>
                    );
                  })}
                </p>
                {theme.suggestion ? (
                  <Link href={`${base}/icp?suggest=${summary.id}.${index}`} className="self-start text-sm font-medium underline underline-offset-2">
                    Update Ideal user: add to {IDEAL_USER_FIELD_LABEL[theme.suggestion.field].toLowerCase()}
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
