import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { ExportMenu } from "@cofounderai/core/export-ui/export-menu";
import {
  getProduct,
  getWorkspaceForProduct,
} from "@cofounderai/module-discovery/lib/tenancy/queries";
import { getProspect } from "@cofounderai/module-discovery/lib/prospects/queries";
import { listContacts } from "@cofounderai/module-discovery/lib/contacts/queries";
import { getProspectResearch } from "@cofounderai/module-discovery/lib/research/queries";
import { EVIDENCE_TYPE_LABEL } from "@cofounderai/module-discovery/lib/research/types";
import { getResearchBrief } from "@cofounderai/module-discovery/lib/research-briefs/queries";
import { getBuyerIntelligenceForProspect } from "@cofounderai/module-discovery/lib/buyer-intelligence/queries";
import { listRecentProspectScores } from "@cofounderai/module-discovery/lib/scoring/queries";
import { WEIGHTS as SCORE_WEIGHTS } from "@cofounderai/module-discovery/lib/scoring/score-prospect";
import { getLatestOutreachStrategy } from "@cofounderai/module-discovery/lib/outreach/queries";
import { listMessages } from "@cofounderai/module-discovery/lib/messages/queries";
import { listResendTemplates } from "@cofounderai/module-discovery/lib/messages/resend-templates";
import { listConversations } from "@cofounderai/module-discovery/lib/conversations/queries";
import {
  deriveProspectPipelineState,
  latestTimestamp,
  NEXT_ACTION_ANCHOR,
  PROSPECT_STAGE_LABEL,
} from "@cofounderai/module-discovery/lib/prospects/pipeline";
import type { Message } from "@cofounderai/module-discovery/lib/messages/types";
import type { Contact } from "@cofounderai/module-discovery/lib/contacts/types";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { AiActionForm } from "@cofounderai/module-discovery/components/ai/ai-action-form";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { Textarea } from "@cofounderai/core/ui/textarea";
import { ExpandableBox } from "@cofounderai/module-discovery/components/ui/expandable-box";
import { ContactRow } from "@cofounderai/module-discovery/components/prospects/contact-row";
import { EmailSendForm } from "@cofounderai/module-discovery/components/prospects/email-send-form";
import { PaidLookupButton } from "@cofounderai/module-discovery/components/prospects/paid-lookup-button";
import { ProspectDetails } from "@cofounderai/module-discovery/components/prospects/prospect-details";
import { getEnrichmentState, missingEnrichFields } from "@cofounderai/module-discovery/lib/data-sources/enrichment";
import { isGatewayConfigured } from "@cofounderai/module-discovery/lib/data-sources/workslake-client";
import { BuyerIntelligenceTable } from "@cofounderai/module-discovery/components/prospects/buyer-intelligence-table";
import { ScoreRagBadge } from "@cofounderai/module-discovery/components/prospects/rag-badge";
import { FsmHandoffPanel } from "@cofounderai/module-discovery/components/prospects/fsm-handoff-panel";
import { WatchlistToggle } from "@cofounderai/module-discovery/components/prospects/watchlist-toggle";
import { getWatchlistEntryForProspect } from "@cofounderai/module-discovery/lib/watchlist/queries";
import { ProspectFeedbackSection } from "@cofounderai/module-discovery/components/prospects/prospect-feedback-section";
import { listProspectFeedback } from "@cofounderai/module-discovery/lib/prospect-feedback/queries";
import { DiscoveryOutcomeBadge } from "@cofounderai/module-discovery/components/prospects/discovery-outcome-badge";
import { computeDiscoveryOutcomeStage } from "@cofounderai/module-discovery/lib/prospects/outcome";
import { ResearchCacheStatusLine } from "@cofounderai/module-discovery/components/prospects/research-cache-status";
import { computeResearchCacheStatus } from "@cofounderai/module-discovery/lib/research/cache-status";
import { getAiRun } from "@cofounderai/module-discovery/lib/ai/queries";
import { getHandoffStatusForProspect } from "@cofounderai/module-fsm/contract/index";
import { getDiscoveryHandoffLead } from "@cofounderai/module-crm/contract/index";
import { PromoteToCrmButton } from "./promote-to-crm-button";
import { Briefcase, ChevronDown, Mail, MessageCircle, Send } from "lucide-react";
import { cn } from "@cofounderai/core/lib/utils";
import type { ConversationChannel } from "@cofounderai/module-discovery/lib/conversations/types";
import {
  updateProspectAction,
  updateProspectStatusAction,
  addContactAction,
  updateContactAction,
  deleteContactAction,
  researchProspectAction,
  generateResearchBriefAction,
  scoreProspectAction,
  generateStrategyAction,
  approveStrategyAction,
  updateStrategyAction,
  generateMessageAction,
  updateMessageContentAction,
  approveMessageAction,
  approveAndSendMessageAction,
  sendMessageAction,
  markMessageSentAction,
  deleteMessageAction,
  generateReplyAction,
  closeConversationAction,
  logInboundReplyAction,
  promoteProspectToCrmAction,
  addToWatchlistAction,
  updateWatchlistAction,
  removeFromWatchlistAction,
  addProspectFeedbackAction,
  retryEnrichmentAction,
  fillMissingDetailsAction,
  findContactsAction,
  lookupQuotaAction,
} from "./actions";

/** DISC-OFFER-P0-06.1: replaced by `EVIDENCE_TYPE_LABEL` (module-discovery's own
 * lib/research/types.ts) -- one source of truth for the doc's own "Verified fact /
 * Inference / Hypothesis / Insufficient evidence" labels, not a second local copy. */

const STATUS_OPTIONS = ["new", "qualified", "disqualified"] as const;

const MESSAGE_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  approved: "Approved",
  sent: "Sent",
  failed: "Failed",
};

const CONVERSATION_STATUS_LABEL: Record<string, string> = {
  awaiting_reply: "Awaiting reply",
  replied: "Needs response",
  closed: "Closed",
};

const OUTCOME_LABEL: Record<string, string> = {
  won: "Won",
  lost: "Lost",
};

const CHANNEL_ICON: Record<ConversationChannel, typeof Mail> = {
  email: Mail,
  linkedin: Briefcase,
  whatsapp: MessageCircle,
};

const CLASSIFICATION_LABEL: Record<string, string> = {
  interested: "Interested",
  not_interested: "Not interested",
  question: "Question",
  objection: "Objection",
  out_of_office: "Out of office",
  unsubscribe: "Unsubscribe",
  other: "Other",
};

/** Between two pipeline sections whose action gates the next (Research -> Score ->
 * Strategy -> Messages, per lib/prospects/pipeline.ts's stage order) -- a visual cue that
 * the section below can't start until the one above is done, not just decoration. */
function DependencyArrow() {
  return (
    <div className="-my-4 flex justify-center">
      <ChevronDown className="size-5 text-muted-foreground/40" aria-hidden="true" />
    </div>
  );
}

function OutboundMessageCard({
  message,
  businessId,
  productId,
  prospectId,
  contacts,
  className,
}: {
  message: Message;
  businessId: string;
  productId: string;
  prospectId: string;
  /** Every contact on this prospect -- used both to gate sending for the email channel
   * (docs/prospects-pipeline-redesign-requirements.md R1: "no contact email -> block Send
   * with an inline prompt to add one") and to let the founder pick which one an email
   * actually goes to. */
  contacts: Contact[];
  /** Lets the conversation thread (unlike the flat drafts list) align this card like a
   * chat bubble on its own side of the thread. */
  className?: string;
}) {
  const isEmail = message.channel === "email";
  const emailContacts = contacts.filter((c) => c.email);
  const hasContactEmail = emailContacts.length > 0;
  const defaultContactId = message.contact_id ?? emailContacts[0]?.id ?? "";
  // DISC-DATA-P0-04.2: each recipient carries what a lookup said about its address, so
  // the send form can refuse an invalid one and ask once about a risky or unverified one.
  const recipients = emailContacts.map((c) => ({
    id: c.id,
    label: [c.first_name, c.last_name].filter(Boolean).join(" ") || (c.email as string),
    emailStatus: c.email_status ?? null,
  }));

  return (
    <li className={cn("flex flex-col gap-2 rounded-md border p-3 text-sm", className)}>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-xs font-medium uppercase text-muted-foreground">
          {message.channel} · {MESSAGE_STATUS_LABEL[message.status] ?? message.status}
          {message.resend_template_name ? (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 normal-case text-primary">
              Template: {message.resend_template_name}
            </span>
          ) : null}
        </span>
        <form
          action={deleteMessageAction.bind(null, businessId, productId, prospectId, message.id)}
        >
          <SubmitButton variant="ghost" size="sm" pendingText="Deleting...">
            Delete
          </SubmitButton>
        </form>
      </div>

      <form
        action={updateMessageContentAction.bind(
          null,
          businessId,
          productId,
          prospectId,
          message.id,
        )}
        className="flex flex-col gap-2"
      >
        {isEmail && !message.resend_template_id ? (
          message.status === "sent" ? (
            message.subject ? (
              <p className="font-medium">{message.subject}</p>
            ) : null
          ) : (
            <Input name="subject" defaultValue={message.subject ?? ""} placeholder="Subject" />
          )
        ) : null}
        {message.resend_template_id ? (
          <p className="text-xs text-muted-foreground">
            Resend applies this template&apos;s own subject at send time. Edit the values
            below (one &quot;KEY: value&quot; per line).
          </p>
        ) : null}
        <Textarea
          name="content"
          defaultValue={message.content}
          rows={message.resend_template_id ? Math.max(3, Object.keys(message.template_variables ?? {}).length) : 2}
          disabled={message.status === "sent"}
        />
        {message.status !== "sent" ? (
          <SubmitButton size="sm" variant="outline" className="self-start" pendingText="Saving...">
            Save edits
          </SubmitButton>
        ) : null}
      </form>

      {isEmail && !hasContactEmail && message.status !== "sent" ? (
        <p className="text-xs text-muted-foreground">
Add a contact with an email under Contacts before this can be sent.
        </p>
      ) : null}

      <div className="flex flex-col items-start gap-2">
        {isEmail ? (
          <>
            {message.status === "draft" && hasContactEmail ? (
              <EmailSendForm
                action={approveAndSendMessageAction.bind(
                  null,
                  businessId,
                  productId,
                  prospectId,
                  message.id,
                )}
                buttonLabel={
                  <>
                    <Send className="size-4" aria-hidden="true" />
                    Approve &amp; send email
                  </>
                }
                pendingText="Sending..."
                recipients={recipients}
                defaultRecipientId={defaultContactId}
              />
            ) : null}
            {(message.status === "approved" || message.status === "failed") &&
            hasContactEmail ? (
              <EmailSendForm
                action={sendMessageAction.bind(null, businessId, productId, prospectId, message.id)}
                buttonLabel={
                  <>
                    <Send className="size-4" aria-hidden="true" />
                    {message.status === "failed" ? "Retry send" : "Send email"}
                  </>
                }
                pendingText="Sending..."
                recipients={recipients}
                defaultRecipientId={defaultContactId}
              />
            ) : null}
            {message.status === "failed" && message.failure_reason ? (
              <p role="alert" className="text-xs text-destructive">
                Send failed: {message.failure_reason}
              </p>
            ) : null}
            {message.status === "sent" && message.sent_at ? (
              <span className="text-xs text-muted-foreground">
                Sent {new Date(message.sent_at).toLocaleString()}
              </span>
            ) : null}
          </>
        ) : (
          <>
            {message.status === "draft" ? (
              <form
                action={approveMessageAction.bind(
                  null,
                  businessId,
                  productId,
                  prospectId,
                  message.id,
                )}
              >
                <SubmitButton size="sm" pendingText="Approving...">
                  Approve
                </SubmitButton>
              </form>
            ) : null}
            {message.status === "approved" ? (
              <form
                action={markMessageSentAction.bind(
                  null,
                  businessId,
                  productId,
                  prospectId,
                  message.id,
                )}
              >
                <SubmitButton size="sm" pendingText="Marking sent...">
                  Mark sent
                </SubmitButton>
              </form>
            ) : null}
            {message.status === "sent" && message.sent_at ? (
              <span className="text-xs text-muted-foreground">
                Sent {new Date(message.sent_at).toLocaleString()}
              </span>
            ) : null}
          </>
        )}
      </div>
    </li>
  );
}

export default async function ProspectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessSlug: string; productId: string; prospectId: string }>;
  searchParams: Promise<{ duplicate?: string }>;
}) {
  const { businessSlug, productId, prospectId } = await params;
  const businessId = await resolveBusinessIdBySlug(businessSlug);
  if (!businessId) notFound();
  const { duplicate } = await searchParams;
  const product = await getProduct(productId);
  if (!product || product.business_id !== businessId) notFound();

  const workspace = await getWorkspaceForProduct(product.id);
  if (!workspace) notFound();

  const prospect = await getProspect(prospectId);
  if (!prospect || prospect.workspace_id !== workspace.id) notFound();

  // DISC-DATA-P0-04.1/04.2: the lookups on this page go through the WorksLake gateway.
  // Whether it is set up is read from this server's settings; no request is made to it
  // until the person presses one of them.
  const isCompany = (prospect.kind ?? "company") === "company";
  const gatewayReady = isGatewayConfigured();
  const hasMissingDetails = isCompany && missingEnrichFields(prospect).length > 0;

  const [contacts, research, scores, strategy, messages, conversations, researchBrief, buyerIntelligence, watchlistEntry, prospectFeedback, enrichmentState] = await Promise.all([
    listContacts(prospect.id),
    getProspectResearch(prospect.id),
    listRecentProspectScores(prospect.id),
    getLatestOutreachStrategy(prospect.id),
    listMessages(prospect.id),
    listConversations(prospect.id),
    getResearchBrief(prospect.id),
    getBuyerIntelligenceForProspect(workspace.id, prospect.id),
    getWatchlistEntryForProspect(prospect.id),
    listProspectFeedback(prospect.id),
    // Only a lookup that failed is worth a line, and only while something is still blank.
    gatewayReady && hasMissingDetails ? getEnrichmentState(prospect) : null,
  ]);
  // The key of one click on each paid lookup below: a second request carrying the same
  // key is answered from the first and spends nothing. A new render makes new keys.
  const fillKey = crypto.randomUUID();
  const contactsKey = crypto.randomUUID();

  // DISC-OFFER-P1 §7-03.2 "Research Cache" -- the exact ai_runs row this cached research
  // came from, if one is on file (null for research written before ai_run_id existed).
  const researchAiRun = research?.ai_run_id ? await getAiRun(research.ai_run_id) : null;
  const researchCacheStatus = research ? computeResearchCacheStatus(research) : null;

  // Template selection is an optional enhancement to message generation -- a Resend
  // outage or missing RESEND_API_KEY should never break this whole page, just fall back
  // to the free-form "Generate message" path with no template picker shown.
  const resendTemplates =
    strategy?.status === "approved" && strategy.channel === "email"
      ? await listResendTemplates().catch(() => [])
      : [];
  const score = scores[0] ?? null;
  const previousScore = scores[1] ?? null;
  const drafts = messages.filter((m) => !m.conversation_id);
  const threadForConversation = (conversationId: string) =>
    messages
      .filter((m) => m.conversation_id === conversationId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const basePath = `/${businessSlug}/discovery/offerings/${productId}/prospects`;

  // F-13's own backlink -- only meaningful once a prospect has actually won (nothing to
  // show otherwise), and `getHandoffStatusForProspect` itself returns
  // `{ok:false, error:"MODULE_NOT_LICENSED"}` as a normal result (ADR-10) rather than
  // throwing when this business hasn't licensed fsm, so the whole page degrades cleanly.
  const handoffResult = prospect.outcome === "won" ? await getHandoffStatusForProspect(businessId, prospect.id) : null;
  const showHandoffPanel = handoffResult !== null && !(handoffResult.ok === false && handoffResult.error === "MODULE_NOT_LICENSED");
  const handoffStatus = handoffResult?.ok ? handoffResult.data : null;

  // DISC-OFFER-P1 §7-02.2 "Discovery Outcome Tracking" -- read-only reference to the CRM
  // lead's own downstream status, degrading cleanly (ADR-10) when crm isn't licensed or
  // no lead exists yet for this prospect.
  const crmHandoffLeadResult = await getDiscoveryHandoffLead(businessId, prospect.id);
  const crmHandoffLead = crmHandoffLeadResult.ok ? crmHandoffLeadResult.data : null;

  const latestConversation = conversations.reduce<(typeof conversations)[number] | null>(
    (latest, c) => (!latest || c.last_message_at > latest.last_message_at ? c : latest),
    null,
  );
  const { stage, nextAction } = deriveProspectPipelineState({
    hasResearch: research !== null,
    hasScore: score !== null,
    latestStrategyStatus: strategy?.status ?? null,
    hasUnsentMessage: drafts.length > 0,
    hasFailedMessage: messages.some((m) => m.status === "failed"),
    hasSentMessage: messages.some((m) => m.status === "sent"),
    latestConversationStatus: latestConversation?.status ?? null,
    lastActivityAt: latestTimestamp(
      prospect.updated_at,
      research?.researched_at,
      score?.created_at,
      strategy?.updated_at,
      ...messages.map((m) => m.created_at),
      latestConversation?.last_message_at,
    ),
  });

  const discoveryOutcomeStage = computeDiscoveryOutcomeStage({
    hasResearch: research !== null,
    prospectStatus: prospect.status,
    hasSentMessage: messages.some((m) => m.status === "sent"),
    hasConversation: conversations.length > 0,
    handedOffToCrm: crmHandoffLead !== null,
    downstreamLeadStatus: crmHandoffLead?.status ?? null,
    prospectOutcome: prospect.outcome,
  });

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Link href={basePath} className="text-sm text-muted-foreground hover:underline">
          ← Back to prospects
        </Link>
        <div className="flex shrink-0 items-center gap-2">
          <ExportMenu exportId="discovery.prospect" businessSlug={businessSlug} params={{ productId, prospectId }} kind="report" />
        </div>
      </div>

      {duplicate ? (
        <p className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
          This company was already in your pipeline -- nothing new was created.
        </p>
      ) : null}

      <div className="flex items-center justify-between rounded-md border bg-muted/40 p-4">
        <div>
          <p className="text-xs font-medium uppercase text-muted-foreground">
            {PROSPECT_STAGE_LABEL[stage]}
          </p>
          {nextAction ? (
            <a href={`#${NEXT_ACTION_ANCHOR[nextAction] ?? ""}`} className="font-medium hover:underline">
              Next: {nextAction}
            </a>
          ) : (
            <p className="font-medium">No action needed right now</p>
          )}
        </div>
        <DiscoveryOutcomeBadge stage={discoveryOutcomeStage} />
      </div>

      {showHandoffPanel ? <FsmHandoffPanel status={handoffStatus} /> : null}

      <section className="flex flex-col gap-4 rounded-md border p-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-medium">{prospect.company_name}</h2>
          <div className="flex items-center gap-2">
            <PromoteToCrmButton
              hasParty={Boolean(prospect.party_id)}
              promoteAction={promoteProspectToCrmAction.bind(null, businessId, productId, prospect.id, prospect.party_id ?? "")}
            />
            <form
              action={updateProspectStatusAction.bind(null, businessId, productId, prospect.id)}
              className="flex items-center gap-2"
            >
              <NativeSelect name="status" defaultValue={prospect.status} className="w-auto">
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </NativeSelect>
              <SubmitButton size="sm" variant="outline" pendingText="Updating...">
                Update status
              </SubmitButton>
            </form>
          </div>
        </div>

        <WatchlistToggle
          entry={watchlistEntry}
          addAction={addToWatchlistAction.bind(null, businessId, productId, workspace.id, prospect.id)}
          updateAction={updateWatchlistAction.bind(null, businessId, productId, prospect.id, watchlistEntry?.id ?? "")}
          removeAction={removeFromWatchlistAction.bind(null, businessId, productId, prospect.id, watchlistEntry?.id ?? "")}
        />

        {/* DISC-DATA-P0-04.1 (B4.6): what is known, with the source beside each value a
            source supplied. The form that edits these is folded under "Edit details":
            the page is read far more often than it is edited. Visible controls in this
            block: ten before (nine fields and Save), at most seven now (Edit details,
            Fill missing details, Retry, and up to four links). */}
        <ProspectDetails prospect={prospect} />

        {isCompany && !gatewayReady ? (
          <p className="text-sm text-muted-foreground">
            Needs setup: filling missing details and finding contacts use the WorksLake connection, which isn&apos;t
            set up for this workspace yet.
          </p>
        ) : null}
        {gatewayReady && hasMissingDetails ? (
          <div className="flex flex-col gap-3">
            {enrichmentState === "failed" ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border bg-muted/40 p-3 text-sm">
                <span>Enrichment unavailable. Nothing was changed.</span>
                <AiActionForm
                  action={retryEnrichmentAction.bind(null, businessId, productId, prospect.id)}
                  buttonLabel="Retry"
                  pendingText="Retrying..."
                  buttonProps={{ variant: "outline" }}
                />
              </div>
            ) : null}
            <PaidLookupButton
              label="Fill missing details"
              title="Fill missing details?"
              description="Looks up the details this company is missing and fills only the blanks. It can use paid sources, which spend your business's paid lookups. Nothing you typed is changed."
              confirmLabel="Fill missing details"
              pendingText="Looking up..."
              quotaAction={lookupQuotaAction.bind(null, workspace.id)}
              runAction={fillMissingDetailsAction.bind(null, businessId, productId, prospect.id, fillKey)}
            />
          </div>
        ) : null}

        <details className="rounded-md border p-3">
          <summary className="cursor-pointer text-sm font-medium">Edit details</summary>
        <form
          action={updateProspectAction.bind(null, businessId, productId, prospect.id)}
          className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="companyName">Company name</Label>
            <Input
              id="companyName"
              name="companyName"
              defaultValue={prospect.company_name}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="website">Website</Label>
            <Input
              id="website"
              name="website"
              type="text"
              defaultValue={prospect.website ?? ""}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="industry">Industry</Label>
            <Input id="industry" name="industry" defaultValue={prospect.industry ?? ""} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="companySize">Company size</Label>
            <Input
              id="companySize"
              name="companySize"
              defaultValue={prospect.company_size ?? ""}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="location">Location</Label>
            <Input id="location" name="location" defaultValue={prospect.location ?? ""} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="linkedinUrl">Company LinkedIn</Label>
            <Input
              id="linkedinUrl"
              name="linkedinUrl"
              type="text"
              defaultValue={prospect.linkedin_url ?? ""}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="twitterUrl">Company X/Twitter</Label>
            <Input
              id="twitterUrl"
              name="twitterUrl"
              type="text"
              defaultValue={prospect.twitter_url ?? ""}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="companyEmail">General company email</Label>
            <Input
              id="companyEmail"
              name="companyEmail"
              type="email"
              defaultValue={prospect.company_email ?? ""}
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              name="description"
              defaultValue={prospect.description ?? ""}
            />
          </div>
          <SubmitButton size="sm" className="self-start sm:col-span-2" pendingText="Saving...">
            Save changes
          </SubmitButton>
        </form>
        </details>
      </section>

      {/* DISC-DATA-P0-04.2. Visible controls in this block, apart from each contact's own
          two: seven before (the six fields of the add form and its button), two now
          (Find contacts, and "Add a contact", which unfolds the form). */}
      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="font-medium">Contacts</h2>
          {isCompany && gatewayReady ? (
            <PaidLookupButton
              label="Find contacts"
              title="Find contacts?"
              description="Looks for up to three people at this company in your ideal customer's roles, and checks each address. This always spends your business's paid lookups. Nothing is sent to anyone."
              confirmLabel="Find contacts"
              pendingText="Looking up..."
              quotaAction={lookupQuotaAction.bind(null, workspace.id)}
              runAction={findContactsAction.bind(null, businessId, productId, prospect.id, contactsKey)}
            />
          ) : null}
        </div>
        {contacts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No contacts yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {contacts.map((c) => (
              <ContactRow
                key={c.id}
                contact={c}
                updateAction={updateContactAction.bind(null, businessId, productId, prospect.id, c.id)}
                deleteAction={deleteContactAction.bind(null, businessId, productId, prospect.id, c.id)}
              />
            ))}
          </ul>
        )}

        <details className="rounded-md border p-4">
          <summary className="cursor-pointer text-sm font-medium">Add a contact</summary>
          <form
            action={addContactAction.bind(
              null,
              businessId,
              productId,
              workspace.id,
              prospect.id,
            )}
            className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2"
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="firstName">First name</Label>
              <Input id="firstName" name="firstName" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lastName">Last name</Label>
              <Input id="lastName" name="lastName" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="jobTitle">Job title</Label>
              <Input id="jobTitle" name="jobTitle" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="linkedinUrl">LinkedIn URL</Label>
              <Input id="linkedinUrl" name="linkedinUrl" type="text" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" name="phone" />
            </div>
            <SubmitButton size="sm" className="self-start sm:col-span-2" pendingText="Adding...">
              Add contact
            </SubmitButton>
          </form>
        </details>
      </section>

      {/* DISC-OFFER-P0-06.2: "Offering Research Brief" -- the doc's own progressive-
          disclosure order (decision summary -> research brief -> expandable evidence ->
          raw signals), so this decision-support summary sits above the raw Research
          section below it rather than buried inside it. Requires research to exist
          first (same guard generateResearchBrief() itself enforces server-side). */}
      <section id="research-brief" className="flex scroll-mt-4 flex-col gap-3 rounded-md border p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Research brief</h2>
          {research ? (
            <AiActionForm
              action={generateResearchBriefAction.bind(null, businessId, productId, prospect.id)}
              buttonLabel={researchBrief ? "Regenerate brief" : "Generate brief"}
              pendingText="Generating..."
            />
          ) : null}
        </div>

        {!research ? (
          <p className="text-sm text-muted-foreground">Research this prospect first to generate a brief.</p>
        ) : !researchBrief ? (
          <p className="text-sm text-muted-foreground">Not generated yet.</p>
        ) : (
          <div className="flex flex-col gap-3 text-sm">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 text-xs font-medium",
                  researchBrief.confidence === "high"
                    ? "bg-emerald-100 text-emerald-800"
                    : researchBrief.confidence === "medium"
                      ? "bg-amber-100 text-amber-800"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {researchBrief.confidence === "high" ? "High" : researchBrief.confidence === "medium" ? "Medium" : "Low"} confidence
              </span>
              <span className="text-xs text-muted-foreground">
                Generated {new Date(researchBrief.generated_at).toLocaleString()}
              </span>
            </div>
            <div>
              <p className="font-medium">Offering fit</p>
              <p className="text-muted-foreground">{researchBrief.offering_fit}</p>
            </div>
            <div>
              <p className="font-medium">Problem hypothesis</p>
              <p className="text-muted-foreground">{researchBrief.problem_hypothesis}</p>
            </div>
            <div>
              <p className="font-medium">Potential objection</p>
              <p className="text-muted-foreground">{researchBrief.potential_objection}</p>
            </div>
            <div>
              <p className="font-medium">Suggested opening</p>
              <p className="text-muted-foreground">{researchBrief.suggested_opening}</p>
            </div>
          </div>
        )}
      </section>

      {/* DISC-OFFER-P0-06.3: "Buyer/Person Intelligence" -- one row per real
          discovery.contacts row (never invented), each enriched with seniority,
          likely buying-committee role, relevance to this offering, contactability, and
          any research evidence that actually mentions them. Shown independently of
          whether a research brief has been generated yet -- it only needs contacts,
          which can exist before research does. */}
      <section id="buyer-intelligence" className="flex scroll-mt-4 flex-col gap-3 rounded-md border p-4">
        <h2 className="font-medium">Buyer intelligence</h2>
        {/* DISC-OFFER-P1-05.2: "Desktop Stage Tables" -- extracted into its own component
         * (`BuyerIntelligenceTable`) since it now renders a real desktop table alongside
         * the mobile card list this section already had; nothing about `contactability`
         * moved with it (see that component's own comment for exactly which columns the
         * doc's own "Person | Role | Fit | Evidence | Confidence" set maps onto). */}
        <BuyerIntelligenceTable buyerIntelligence={buyerIntelligence} />
      </section>

      <DependencyArrow />

      <section id="research" className="flex scroll-mt-4 flex-col gap-3 rounded-md border p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Research</h2>
          <AiActionForm
            action={researchProspectAction.bind(null, businessId, productId, prospect.id)}
            buttonLabel={research ? "Re-research" : "Research"}
            pendingText="Researching..."
          />
        </div>

        {!research ? (
          <p className="text-sm text-muted-foreground">
            Not researched yet. Uses web search -- may take a moment.
          </p>
        ) : (
          <>
          {researchCacheStatus ? <ResearchCacheStatusLine status={researchCacheStatus} aiRun={researchAiRun} /> : null}
          <ExpandableBox>
          <div className="flex flex-col gap-3 text-sm">
            <p>{research.summary}</p>
            {research.pain_points.length > 0 ? (
              <div>
                <p className="font-medium">Pain points</p>
                <p className="text-muted-foreground">{research.pain_points.join(", ")}</p>
              </div>
            ) : null}
            {research.buying_signals.length > 0 ? (
              <div>
                <p className="font-medium">Buying signals</p>
                <p className="text-muted-foreground">{research.buying_signals.join(", ")}</p>
              </div>
            ) : null}
            {research.recent_events.length > 0 ? (
              <div>
                <p className="font-medium">Recent events</p>
                <p className="text-muted-foreground">{research.recent_events.join(", ")}</p>
              </div>
            ) : null}
            {research.recommended_angle ? (
              <div>
                <p className="font-medium">Recommended angle</p>
                <p className="text-muted-foreground">{research.recommended_angle}</p>
              </div>
            ) : null}
            {research.evidence.length > 0 ? (
              <div>
                <p className="font-medium">Evidence</p>
                <ul className="mt-1 flex flex-col gap-1">
                  {research.evidence.map((item, i) => (
                    <li key={i} className="text-muted-foreground">
                      <span className="rounded bg-muted px-1 text-xs">
                        {EVIDENCE_TYPE_LABEL[item.evidence_type] ?? item.evidence_type}
                      </span>{" "}
                      {item.statement}
                      {item.source || item.observed_at ? (
                        <span className="text-xs">
                          {" "}
                          ({[item.source, item.observed_at].filter(Boolean).join(", ")})
                        </span>
                      ) : null}
                      {item.source_url ? (
                        <>
                          {" — "}
                          <a
                            href={item.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline underline-offset-4"
                          >
                            source
                          </a>
                        </>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
          </ExpandableBox>
          </>
        )}
      </section>

      <DependencyArrow />

      <section id="score" className="flex scroll-mt-4 flex-col gap-3 rounded-md border p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Score</h2>
          <form action={scoreProspectAction.bind(null, businessId, productId, prospect.id)}>
            <SubmitButton size="sm" pendingText="Scoring...">
              {score ? "Rescore" : "Score"}
            </SubmitButton>
          </form>
        </div>

        {!score ? (
          <p className="text-sm text-muted-foreground">
            Not scored yet. Requires an approved ICP.
          </p>
        ) : (
          <ExpandableBox>
            <div className="flex flex-col gap-2 text-sm">
              <div className="flex items-baseline gap-2">
                <p className="text-2xl font-semibold">{score.overall_score}</p>
                <ScoreRagBadge score={score.overall_score} />
                {previousScore && previousScore.overall_score !== score.overall_score ? (
                  <span
                    className={
                      score.overall_score > previousScore.overall_score
                        ? "text-xs font-medium text-emerald-600 dark:text-emerald-400"
                        : "text-xs font-medium text-amber-600 dark:text-amber-400"
                    }
                  >
                    {score.overall_score > previousScore.overall_score ? "▲" : "▼"}{" "}
                    {Math.abs(score.overall_score - previousScore.overall_score)} since last score
                    ({previousScore.overall_score})
                  </span>
                ) : previousScore ? (
                  <span className="text-xs text-muted-foreground">No change since last score</span>
                ) : null}
              </div>
              <p className="text-muted-foreground">
                ICP fit {score.icp_score} ({SCORE_WEIGHTS.icp * 100}%) · Intent{" "}
                {score.intent_score} ({SCORE_WEIGHTS.intent * 100}%) · Timing {score.timing_score} (
                {SCORE_WEIGHTS.timing * 100}%)
              </p>
              {score.reasoning ? (
                <pre className="whitespace-pre-wrap font-sans text-muted-foreground">
                  {score.reasoning}
                </pre>
              ) : null}
            </div>
          </ExpandableBox>
        )}
      </section>

      <DependencyArrow />

      <section id="strategy" className="flex scroll-mt-4 flex-col gap-3 rounded-md border p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Outreach strategy</h2>
          {strategy?.status === "approved" ? (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              Approved
            </span>
          ) : null}
        </div>

        <AiActionForm
          action={generateStrategyAction.bind(null, businessId, productId, prospect.id)}
          buttonLabel={strategy ? "Generate new strategy" : "Generate strategy"}
          pendingText="Generating..."
          formClassName="flex items-center gap-2"
          buttonProps={{ disabled: !research }}
        >
          {contacts.length > 0 ? (
            <NativeSelect name="contactId" defaultValue="" className="w-auto max-w-56">
              <option value="">No specific contact</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {[c.first_name, c.last_name].filter(Boolean).join(" ") || c.id}
                </option>
              ))}
            </NativeSelect>
          ) : null}
        </AiActionForm>

        {!research ? (
          <p className="text-sm text-muted-foreground">Research this prospect first.</p>
        ) : !strategy ? (
          <p className="text-sm text-muted-foreground">No strategy yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            <form
              action={updateStrategyAction.bind(null, businessId, productId, prospect.id, strategy.id)}
              className="flex flex-col gap-3 text-sm"
            >
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="strategy-strategy">Why / strategy</Label>
                <Textarea id="strategy-strategy" name="strategy" defaultValue={strategy.strategy} rows={2} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="strategy-channel">Channel</Label>
                <NativeSelect id="strategy-channel" name="channel" defaultValue={strategy.channel} className="w-auto">
                  <option value="email">Email</option>
                  <option value="linkedin">LinkedIn</option>
                  <option value="whatsapp">WhatsApp</option>
                </NativeSelect>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="strategy-key-message">Key message</Label>
                <Textarea id="strategy-key-message" name="keyMessage" defaultValue={strategy.key_message} rows={2} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="strategy-cta">Call to action</Label>
                <Input id="strategy-cta" name="cta" defaultValue={strategy.cta} />
              </div>
              <SubmitButton size="sm" variant="outline" className="self-start" pendingText="Saving...">
                Save changes
              </SubmitButton>
            </form>
            {strategy.status === "draft" ? (
              <form
                action={approveStrategyAction.bind(
                  null,
                  businessId,
                  productId,
                  prospect.id,
                  strategy.id,
                )}
              >
                <SubmitButton size="sm" variant="outline" pendingText="Approving...">
                  Approve strategy
                </SubmitButton>
              </form>
            ) : null}
          </div>
        )}
      </section>

      <DependencyArrow />

      <section id="messages" className="flex scroll-mt-4 flex-col gap-3 rounded-md border p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Messages</h2>
          {strategy?.status === "approved" ? (
            <AiActionForm
              action={generateMessageAction.bind(
                null,
                businessId,
                productId,
                prospect.id,
                strategy.id,
              )}
              buttonLabel="Generate message"
              pendingText="Generating..."
              formClassName="flex flex-wrap items-center gap-2"
            >
              {resendTemplates.length > 0 ? (
                <NativeSelect name="resendTemplateId" defaultValue="" className="w-auto max-w-56">
                  <option value="">No template (AI writes freely)</option>
                  {resendTemplates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </NativeSelect>
              ) : null}
            </AiActionForm>
          ) : null}
        </div>

        {strategy?.status !== "approved" ? (
          <p className="text-sm text-muted-foreground">Approve an outreach strategy first.</p>
        ) : drafts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No draft messages yet.</p>
        ) : (
          <ExpandableBox>
            <ul className="flex flex-col gap-3">
              {drafts.map((m) => (
                <OutboundMessageCard
                  key={m.id}
                  message={m}
                  businessId={businessId}
                  productId={productId}
                  prospectId={prospect.id}
                  contacts={contacts}
                />
              ))}
            </ul>
          </ExpandableBox>
        )}
      </section>

      <section id="conversations" className="flex scroll-mt-4 flex-col gap-4 rounded-md border p-4">
        <h2 className="font-medium">Conversations</h2>
        {conversations.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No conversations yet -- mark a message sent to start one.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {conversations.map((c) => {
              const ChannelIcon = CHANNEL_ICON[c.channel];
              return (
                <div key={c.id} className="flex flex-col gap-3 rounded-md border bg-muted/20 p-3">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-sm font-medium capitalize">
                      <ChannelIcon className="size-4 text-muted-foreground" aria-hidden="true" />
                      {c.channel} thread
                    </span>
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-medium",
                          c.status === "closed" && prospect.outcome === "won"
                            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                            : c.status === "closed" && prospect.outcome === "lost"
                              ? "bg-muted text-muted-foreground"
                              : c.status === "replied"
                                ? "bg-primary/10 text-primary"
                                : "bg-muted text-muted-foreground",
                        )}
                      >
                        {c.status === "closed" && OUTCOME_LABEL[prospect.outcome]
                          ? `Closed · ${OUTCOME_LABEL[prospect.outcome]}`
                          : (CONVERSATION_STATUS_LABEL[c.status] ?? c.status)}
                      </span>
                      {c.status !== "closed" ? (
                        <form
                          action={closeConversationAction.bind(
                            null,
                            businessId,
                            productId,
                            prospect.id,
                            c.id,
                          )}
                          className="flex items-center gap-1.5"
                        >
                          <SubmitButton
                            name="outcome"
                            value="won"
                            size="sm"
                            variant="outline"
                            pendingText="Closing..."
                          >
                            Won
                          </SubmitButton>
                          <SubmitButton
                            name="outcome"
                            value="lost"
                            size="sm"
                            variant="ghost"
                            pendingText="Closing..."
                          >
                            Lost
                          </SubmitButton>
                        </form>
                      ) : null}
                    </div>
                  </div>

                  <ExpandableBox>
                    <ul className="flex flex-col gap-2">
                      {threadForConversation(c.id).map((m) =>
                        m.direction === "inbound" ? (
                          <li
                            key={m.id}
                            className="mr-auto flex max-w-xl flex-col gap-1 rounded-md bg-muted p-3 text-sm"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-xs font-medium uppercase text-muted-foreground">
                                Inbound
                              </span>
                              {m.classification ? (
                                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                                  {CLASSIFICATION_LABEL[m.classification] ?? m.classification}
                                </span>
                              ) : null}
                            </div>
                            <p className="whitespace-pre-wrap">{m.content}</p>
                            {m.recommended_action ? (
                              <p className="text-xs text-muted-foreground">
                                Suggested next step: {m.recommended_action}
                              </p>
                            ) : null}
                          </li>
                        ) : (
                          <OutboundMessageCard
                            key={m.id}
                            message={m}
                            businessId={businessId}
                            productId={productId}
                            prospectId={prospect.id}
                            contacts={contacts}
                            className="ml-auto max-w-xl bg-background"
                          />
                        ),
                      )}
                    </ul>
                  </ExpandableBox>

                  {c.status !== "closed" ? (
                    <AiActionForm
                      action={logInboundReplyAction.bind(null, businessId, productId, prospect.id, prospect.party_id, c.id)}
                      buttonLabel="Log reply"
                      pendingText="Saving..."
                      formClassName="flex flex-col gap-2"
                      wrapperClassName="flex flex-col gap-2"
                    >
                      <Textarea
                        name="content"
                        rows={2}
                        placeholder="Paste or type what the prospect said back..."
                        required
                      />
                    </AiActionForm>
                  ) : null}

                  {c.status === "replied" ? (
                    <AiActionForm
                      action={generateReplyAction.bind(
                        null,
                        businessId,
                        productId,
                        prospect.id,
                        c.id,
                      )}
                      buttonLabel="Generate reply"
                      pendingText="Generating..."
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <ProspectFeedbackSection
        feedback={prospectFeedback}
        addAction={addProspectFeedbackAction.bind(null, businessId, productId, workspace.id, prospect.id)}
      />

    </div>
  );
}
