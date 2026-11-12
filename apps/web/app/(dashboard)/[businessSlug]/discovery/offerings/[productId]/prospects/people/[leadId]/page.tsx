import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { Textarea } from "@cofounderai/core/ui/textarea";
import { getProduct, getWorkspaceForProduct } from "@cofounderai/module-discovery/lib/tenancy/queries";
import { getLead, listLeadFeedback, listLeads } from "@cofounderai/module-discovery/lib/audience/leads";
import { getSignupPage } from "@cofounderai/module-discovery/lib/audience/pages";
import { messagingRefusal } from "@cofounderai/module-discovery/lib/audience/rules";
import {
  FEEDBACK_KIND_LABEL,
  LEAD_SOURCE_LABEL,
  LEAD_STATUSES,
  LEAD_STATUS_LABEL,
} from "@cofounderai/module-discovery/lib/audience/types";
import { LeadActionForm } from "@cofounderai/module-discovery/components/audience/lead-action-form";
import { logConversationAction, messageLeadAction, sendQuestionsAction, updateLeadAction } from "./actions";

const DAY = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" });

/**
 * DISC-CONS-P0-03.x/04.1/05.2: one person who opted in. Layout, planned before markup
 * (docs/design/claude-ui-design-rules.md): who they are and what they agreed to, then
 * the one primary action, "Log a conversation", then what they have said. Sending
 * questions, an email and editing status or tags are folded; the two sends are shown
 * only when the person may be emailed, and otherwise one line says why not.
 */
export default async function LeadPage({
  params,
}: {
  params: Promise<{ businessSlug: string; productId: string; leadId: string }>;
}) {
  const { businessSlug, productId, leadId } = await params;
  const businessId = await resolveBusinessIdBySlug(businessSlug);
  if (!businessId) notFound();
  const product = await getProduct(productId);
  if (!product || product.business_id !== businessId) notFound();
  const workspace = await getWorkspaceForProduct(product.id);
  if (!workspace) notFound();
  const lead = await getLead(leadId);
  if (!lead || lead.workspace_id !== workspace.id) notFound();

  const [feedback, all, signupPage] = await Promise.all([listLeadFeedback(lead.id), listLeads(workspace.id), getSignupPage(workspace.id)]);
  const referrals = all.filter((other) => other.referrer_lead_id === lead.id).length;
  const referrer = lead.referrer_lead_id ? all.find((other) => other.id === lead.referrer_lead_id) : null;
  const refusal = messagingRefusal(lead);
  const backHref = `/${businessSlug}/discovery/offerings/${productId}/prospects?list=people`;
  const bind = <A extends unknown[], R>(fn: (b: string, p: string, l: string, ...rest: A) => R) => fn.bind(null, businessId, productId, lead.id);

  return (
    <div className="flex flex-col gap-6">
      <Link href={backHref} className="text-sm text-muted-foreground hover:underline">
        ← Back to people
      </Link>

      <section className="flex flex-col gap-3 rounded-md border p-4 text-sm">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-lg font-medium">{lead.name ?? lead.email}</h1>
          {lead.name ? <p className="text-muted-foreground">{lead.email}</p> : null}
        </div>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-[max-content_1fr]">
          <dt className="text-muted-foreground">Status</dt>
          <dd>{LEAD_STATUS_LABEL[lead.status]}</dd>
          <dt className="text-muted-foreground">Source</dt>
          <dd>
            {LEAD_SOURCE_LABEL[lead.source]}
            {referrer ? `, through ${referrer.name ?? referrer.email}'s link` : ""}
          </dd>
          <dt className="text-muted-foreground">Consent</dt>
          <dd>{lead.consent_at ? `"${lead.consent_text}", ${DAY.format(new Date(lead.consent_at))}` : "Not given"}</dd>
          <dt className="text-muted-foreground">Referrals</dt>
          <dd>{referrals}</dd>
          {lead.tags.length > 0 ? (
            <>
              <dt className="text-muted-foreground">Tags</dt>
              <dd>{lead.tags.join(", ")}</dd>
            </>
          ) : null}
          {Object.entries(lead.answers).map(([question, answer]) => (
            <div key={question} className="contents">
              <dt className="text-muted-foreground">{question}</dt>
              <dd className="break-words">{answer}</dd>
            </div>
          ))}
        </dl>
        {signupPage ? (
          <p className="text-xs text-muted-foreground">
            Their referral link: /p/w/{signupPage.token}?ref={lead.referral_code}
          </p>
        ) : null}
      </section>

      <section className="flex flex-col gap-3 rounded-md border p-4">
        <h2 className="font-medium">Log a conversation</h2>
        <LeadActionForm action={bind(logConversationAction)} label="Save" pendingText="Saving...">
          <Textarea name="body" rows={4} required maxLength={10000} aria-label="What was said" placeholder="What they said, in your words or theirs" />
          <Input name="tags" maxLength={400} aria-label="Tags" placeholder="Tags, separated by commas (optional)" />
        </LeadActionForm>
      </section>

      {refusal ? (
        <p className="text-sm text-muted-foreground">{refusal}</p>
      ) : (
        <div className="flex flex-col gap-3">
          <details className="rounded-md border p-3">
            <summary className="cursor-pointer text-sm font-medium">Send questions</summary>
            <div className="mt-3">
              <LeadActionForm action={bind(sendQuestionsAction)} label="Send questions" pendingText="Sending..." variant="outline">
                {[0, 1].map((index) => (
                  <Input
                    key={index}
                    name={`question_${index}`}
                    maxLength={200}
                    required={index === 0}
                    aria-label={`Question ${index + 1}`}
                    defaultValue={signupPage?.questions[index] ?? ""}
                    placeholder={`Question ${index + 1}${index === 1 ? " (optional)" : ""}`}
                  />
                ))}
                <p className="text-xs text-muted-foreground">They get an email with a link to answer. Their answers appear below.</p>
              </LeadActionForm>
            </div>
          </details>
          <details className="rounded-md border p-3">
            <summary className="cursor-pointer text-sm font-medium">Send an email</summary>
            <div className="mt-3">
              <LeadActionForm action={bind(messageLeadAction)} label="Send" pendingText="Sending..." variant="outline">
                <Input name="subject" maxLength={200} required aria-label="Subject" placeholder="Subject" />
                <Textarea name="body" rows={5} required maxLength={10000} aria-label="Message" />
              </LeadActionForm>
            </div>
          </details>
        </div>
      )}

      <details className="rounded-md border p-3">
        <summary className="cursor-pointer text-sm font-medium">Edit status and tags</summary>
        <div className="mt-3">
          <LeadActionForm action={bind(updateLeadAction)} label="Save" pendingText="Saving..." variant="outline">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lead-status">Status</Label>
              <NativeSelect id="lead-status" name="status" defaultValue={lead.status} className="w-auto">
                {LEAD_STATUSES.filter((status) => lead.status !== "unsubscribed" || status === "unsubscribed").map((status) => (
                  <option key={status} value={status}>
                    {LEAD_STATUS_LABEL[status]}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lead-tags">Tags</Label>
              <Input id="lead-tags" name="tags" maxLength={400} defaultValue={lead.tags.join(", ")} />
            </div>
          </LeadActionForm>
        </div>
      </details>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">What they said</h2>
        {lead.survey ? <p className="text-sm text-muted-foreground">Questions sent {DAY.format(new Date(lead.survey.sent_at))}, waiting for answers.</p> : null}
        {feedback.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {feedback.map((entry) => (
              <li key={entry.id} id={`feedback-${entry.id}`} className="flex scroll-mt-4 flex-col gap-1 rounded-md border p-3 text-sm">
                <span className="text-xs text-muted-foreground">
                  {FEEDBACK_KIND_LABEL[entry.kind]} · {DAY.format(new Date(entry.created_at))}
                  {entry.tags.length > 0 ? ` · ${entry.tags.join(", ")}` : ""}
                </span>
                <p className="whitespace-pre-wrap">{entry.body}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
