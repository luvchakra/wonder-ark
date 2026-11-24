import { EMAIL_NOT_SET_UP, platformSender, sendPlatformEmail } from "@cofounderai/core/email/platform-mailer";
import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { createAdminClient as createCoreAdminClient } from "@cofounderai/core/db/admin";
import { aggregateGst, computeLineGst, resolveStateCode } from "@cofounderai/core/lib/gst";
import { renderEmailHtml, renderEmailText } from "@cofounderai/core/email/render";
import { SITE_URL } from "@cofounderai/core/site";
import { publish } from "@cofounderai/core/events/mutations";
import { requireModule } from "@cofounderai/core/licensing/queries";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import { createClient as createFsmClient } from "../../db/server";
import { generatePortalToken, hashPortalToken, resolvePortalToken } from "../portal-tokens/tokens";
import type { Opportunity } from "../opportunities/types";
import type { AddChargeLineInput, UpdateChargeLineInput } from "./types";
import { platformKey } from "@cofounderai/core/admin/platform-key-store";

// Untyped like every other `.from(table)` caller against these schemas (Database = any).
type QueryClient = any;

function coreClient() {
  return createCoreClient({ schema: "core" });
}

/** One estimate document per opportunity (MUST scope -- "multiple estimate options" is
 * explicitly a SHOULD/LATER item in the PRD). Creates a draft the first time this
 * opportunity is estimated; returns the existing one on every call after. */
export async function getOrCreateEstimate(businessId: string, opportunity: Opportunity): Promise<string> {
  await requireModule(businessId, "fsm");
  await requirePermission(businessId, "estimates.edit");
  const core = await coreClient();
  const { data: existing, error: findError } = await core
    .from("documents")
    .select("id")
    .eq("business_id", businessId)
    .eq("doc_type", "estimate")
    .eq("source_module", "fsm")
    .contains("source_ref", { opportunity_id: opportunity.id })
    .maybeSingle();
  if (findError) throw findError;
  if (existing) return existing.id;

  const { data, error } = await core
    .from("documents")
    .insert({
      business_id: businessId,
      doc_type: "estimate",
      source_module: "fsm",
      source_ref: { opportunity_id: opportunity.id },
      party_id: opportunity.party_id,
      status: "draft",
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

/** Recomputes every line's CGST/SGST/IGST server-side from the business's own GST
 * profile and the customer's state/GSTIN (never trusting client-computed tax amounts for
 * a financial document), then persists both the recomputed line amounts and the
 * document's own aggregated totals -- same approach as module-inventory's own
 * purchase-orders/mutations.ts#computeTotals, adapted to write back to `core.documents`
 * directly instead of returning to an insert-time caller, since a charge line can be
 * added/edited/removed at any point after the estimate document already exists. */
/** Exported (not just estimates-internal) so `invoices/mutations.ts#getOrCreateInvoiceForJob`
 * can call it once after bulk-copying an approved estimate's lines into a new invoice
 * document -- it's already generic over any `core.documents` id, nothing here is
 * actually estimate-specific. */
export async function recomputeAndPersistTotals(businessId: string, estimateId: string): Promise<void> {
  await requireModule(businessId, "fsm");
  const core = await coreClient();

  const { data: doc, error: docError } = await core
    .from("documents")
    .select("party_id, discount_amount, shipping_amount")
    .eq("id", estimateId)
    .single();
  if (docError) throw docError;

  const [{ data: settings }, { data: taxIdentity }, { data: lines, error: linesError }] = await Promise.all([
    core.from("business_settings").select("gstin, state").eq("business_id", businessId).maybeSingle(),
    core.from("tax_identities").select("gstin, state").eq("party_id", doc.party_id).maybeSingle(),
    core.from("document_lines").select("id, quantity, unit_price, tax_rate, taxable").eq("document_id", estimateId),
  ]);
  if (linesError) throw linesError;

  const sellerStateCode = resolveStateCode(settings?.state ?? null, settings?.gstin ?? null);
  const buyerStateCode = resolveStateCode(taxIdentity?.state ?? null, taxIdentity?.gstin ?? null);

  const breakups = lines.map((l) =>
    computeLineGst({
      taxableValue: l.taxable ? Number(l.quantity) * Number(l.unit_price) : 0,
      gstRatePercent: l.taxable ? Number(l.tax_rate) : 0,
      sellerStateCode,
      buyerStateCode,
    }),
  );

  await Promise.all(
    lines.map((l, i) =>
      core
        .from("document_lines")
        .update({ cgst_amount: breakups[i]!.cgstAmount, sgst_amount: breakups[i]!.sgstAmount, igst_amount: breakups[i]!.igstAmount })
        .eq("id", l.id),
    ),
  );

  const totals = aggregateGst(breakups);
  const subtotal = lines.reduce((sum, l) => sum + Number(l.quantity) * Number(l.unit_price), 0);
  const total = subtotal + totals.totalTax + Number(doc.shipping_amount) - Number(doc.discount_amount);

  const { error: updateError } = await core
    .from("documents")
    .update({
      subtotal,
      cgst_amount: totals.cgstAmount,
      sgst_amount: totals.sgstAmount,
      igst_amount: totals.igstAmount,
      total_amount: total,
    })
    .eq("id", estimateId);
  if (updateError) throw updateError;
}

/** Resolves `input`'s item -- either the existing one given, or a brand-new
 * `core.items` row created inline (PRD §2's "ad-hoc lines"). An ad-hoc charge isn't a
 * distinct data-model concept: Kickserv items/StockPilot products/FSM charge items are
 * one `core.items` table (entity-ownership map), so "ad-hoc" just means "create the item
 * inline" rather than "pick one that already exists in the catalog." */
async function resolveItemId(businessId: string, input: AddChargeLineInput): Promise<{ itemId: string; taxRate: number; unitPrice: number }> {
  if (input.itemId) {
    const core = await coreClient();
    const { data: item, error } = await core.from("items").select("tax_rate, selling_price").eq("id", input.itemId).single();
    if (error) throw error;
    return { itemId: input.itemId, taxRate: Number(item.tax_rate), unitPrice: Number(item.selling_price) };
  }
  if (!input.adHoc?.name.trim()) {
    throw new Error("A catalog item or a name for a new ad-hoc charge is required.");
  }
  const core = await coreClient();
  const { data: item, error } = await core
    .from("items")
    .insert({
      business_id: businessId,
      kind: "service",
      name: input.adHoc.name.trim(),
      tax_rate: input.adHoc.taxRate,
      selling_price: input.adHoc.unitPrice,
    })
    .select("id")
    .single();
  if (error) throw error;
  return { itemId: item.id, taxRate: input.adHoc.taxRate, unitPrice: input.adHoc.unitPrice };
}

/** Not gated by `estimates.edit`, deliberately: this function (and updateChargeLine/
 * deleteChargeLine/reorderChargeLines/recomputeAndPersistTotals below) is generic over
 * any `core.documents` id -- invoices/mutations.ts#getOrCreateInvoiceForJob's own
 * charge-line editing reuses these same functions against an invoice, not just an
 * estimate, and there's no `invoices.edit` permission key defined to check instead
 * (CLAUDE.md principle 7: don't invent a permission key no story has actually asked
 * for). Estimate-specific document lifecycle (create/send/approve/decline) is gated
 * above; line-level editing on either document type is currently module-license-gated
 * only, same as before this pass -- a real gap, tracked in docs/testing/test-cases/
 * fsm.md rather than silently left unexplained. */
export async function addChargeLine(businessId: string, estimateId: string, input: AddChargeLineInput): Promise<void> {
  await requireModule(businessId, "fsm");
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) throw new Error("Quantity must be positive.");

  const { itemId, taxRate, unitPrice } = await resolveItemId(businessId, input);
  const core = await coreClient();

  const { data: item } = await core.from("items").select("hsn_code").eq("id", itemId).maybeSingle();
  const { data: maxSort } = await core
    .from("document_lines")
    .select("sort_order")
    .eq("document_id", estimateId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await core.from("document_lines").insert({
    business_id: businessId,
    document_id: estimateId,
    item_id: itemId,
    quantity: input.quantity,
    unit_price: unitPrice,
    tax_rate: taxRate,
    taxable: input.taxable,
    hsn_code: item?.hsn_code ?? null,
    job_charge_type_id: input.jobChargeTypeId || null,
    sort_order: (maxSort?.sort_order ?? -1) + 1,
  });
  if (error) throw error;

  await recomputeAndPersistTotals(businessId, estimateId);
}

export async function updateChargeLine(businessId: string, estimateId: string, lineId: string, patch: UpdateChargeLineInput): Promise<void> {
  await requireModule(businessId, "fsm");
  const core = await coreClient();
  const update: Record<string, unknown> = {};
  if ("quantity" in patch) update.quantity = patch.quantity;
  if ("unitPrice" in patch) update.unit_price = patch.unitPrice;
  if ("taxRate" in patch) update.tax_rate = patch.taxRate;
  if ("taxable" in patch) update.taxable = patch.taxable;
  if ("jobChargeTypeId" in patch) update.job_charge_type_id = patch.jobChargeTypeId;

  const { error } = await core.from("document_lines").update(update).eq("id", lineId).eq("document_id", estimateId);
  if (error) throw error;

  await recomputeAndPersistTotals(businessId, estimateId);
}

export async function deleteChargeLine(businessId: string, estimateId: string, lineId: string): Promise<void> {
  await requireModule(businessId, "fsm");
  const core = await coreClient();
  const { error } = await core.from("document_lines").delete().eq("id", lineId).eq("document_id", estimateId);
  if (error) throw error;

  await recomputeAndPersistTotals(businessId, estimateId);
}

/** Drag-to-reorder (PRD §1: "reorderable by drag handle") -- `orderedLineIds` is the new
 * full order, front to back. */
export async function reorderChargeLines(estimateId: string, orderedLineIds: string[]): Promise<void> {
  const core = await coreClient();
  await Promise.all(
    orderedLineIds.map((lineId, index) =>
      core.from("document_lines").update({ sort_order: index }).eq("id", lineId).eq("document_id", estimateId),
    ),
  );
}

/** Resolves the customer's email for sending the estimate: the opportunity's own
 * primary contact if one is set, otherwise the party's own `email` column. */
async function resolveRecipientEmail(core: QueryClient, opportunity: Opportunity): Promise<string> {
  if (opportunity.primary_contact_id) {
    const { data: contact } = await core.from("party_contacts").select("email").eq("id", opportunity.primary_contact_id).maybeSingle();
    if (contact?.email) return contact.email;
  }
  const { data: party } = await core.from("parties").select("email").eq("id", opportunity.party_id).maybeSingle();
  if (!party?.email) {
    throw new Error("No email on file for this customer -- add one to the customer or their primary contact before sending.");
  }
  return party.email;
}

/** Sends an approved estimate to the customer by email (PRD §2 Estimates row: "send by
 * email"). Requires at least one charge line -- an empty estimate has nothing to quote.
 * Generates a fresh, single-purpose portal token per send (same hash-only-storage scheme
 * as `core.api_key_secrets`) rather than reusing one across sends, so an old emailed link
 * can be superseded without a separate revocation step. */
export async function sendEstimate(businessId: string, opportunityId: string, estimateId: string): Promise<void> {
  await requireModule(businessId, "fsm");
  await requirePermission(businessId, "estimates.edit");
  const core = await coreClient();
  const fsm = await createFsmClient();

  const [{ data: doc, error: docError }, { data: lineCount }, { data: opportunity, error: oppError }, { data: settings }] = await Promise.all([
    core.from("documents").select("status, party_id").eq("id", estimateId).single(),
    core.from("document_lines").select("id").eq("document_id", estimateId).limit(1).maybeSingle(),
    fsm.from("opportunities").select("*").eq("id", opportunityId).eq("business_id", businessId).single(),
    fsm.from("settings").select("estimate_expiry_days").eq("business_id", businessId).maybeSingle(),
  ]);
  if (docError) throw docError;
  if (oppError) throw oppError;
  if (!lineCount) throw new Error("Add at least one charge before sending the estimate.");
  if (doc.status === "approved") throw new Error("This estimate has already been approved.");
  if (doc.status === "declined") throw new Error("This estimate was declined -- add new charges before resending.");

  const opportunity_ = opportunity as Opportunity;
  const toEmail = await resolveRecipientEmail(core, opportunity_);

  const { data: business } = await core.from("businesses").select("name, website").eq("id", businessId).maybeSingle();
  const brandName = business?.name ?? "Your service provider";

  // EMAIL-SMTP-01: the platform's SMTP mailbox (Platform admin → Keys).
  const fromAddress = (await platformSender())?.fromEmail;
  if (!fromAddress) {
    throw new Error(EMAIL_NOT_SET_UP);
  }

  const rawToken = generatePortalToken();
  const expiryDays = settings?.estimate_expiry_days ?? 30;
  const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString();

  const { error: tokenError } = await fsm.from("portal_tokens").insert({
    business_id: businessId,
    party_id: doc.party_id,
    token_hash: hashPortalToken(rawToken),
    scope: "estimate",
    document_id: estimateId,
    expires_at: expiresAt,
  });
  if (tokenError) throw tokenError;

  const publicUrl = `${SITE_URL}/p/e/${rawToken}`;
  const result = await sendPlatformEmail({
    to: toEmail,
    subject: `Estimate from ${brandName}`,
    text: renderEmailText(`Your estimate is ready to review.\n\n${publicUrl}`),
    html: renderEmailHtml({
      brandName,
      body: `Your estimate is ready to review. **View and approve it at the link below:**\n\n${publicUrl}`,
      websiteUrl: business?.website ?? null,
      replyToEmail: fromAddress,
    }),
  });
  if (result.status !== "sent") throw new Error(`Could not send the estimate email: ${result.reason}`);

  if (doc.status === "draft") {
    await core.from("documents").update({ status: "sent" }).eq("id", estimateId);
  }
  if (opportunity_.status === "new" || opportunity_.status === "estimate_scheduled") {
    await fsm.from("opportunities").update({ status: "estimate_sent" }).eq("id", opportunityId).eq("business_id", businessId);
  }

  await publish({ businessId, type: "estimate.sent", payload: { opportunityId, estimateId } });
}

/** First view of a sent estimate on the public page flips it to `viewed` -- PRD §1's
 * "sent/viewed state is tracked by icons." Never downgrades an already-viewed, approved,
 * or declined estimate; safe to call on every page load. */
export async function markEstimateViewed(rawToken: string): Promise<void> {
  const token = await resolvePortalToken(rawToken, "estimate");
  const core = createCoreAdminClient({ schema: "core" });
  await core.from("documents").update({ status: "viewed" }).eq("id", token.documentId).eq("status", "sent");
}

/** Creates the unscheduled job an approved estimate becomes (PRD §4: `estimate_sent ->
 * won`, `converted_job_id` set) and flips the opportunity to `won`. `mintJobNumber` is
 * injected because the two callers below mint through different core functions --
 * `core.next_number` (authenticated, membership-checked) for the internal approval path,
 * `core.next_number_for_api` (service-role, no session) for the public token path -- both
 * writing the same `core.number_sequences` counter, so numbers never collide regardless
 * of which path minted them. */
async function createJobFromApprovedEstimate(
  fsm: QueryClient,
  opportunity: Opportunity,
  mintJobNumber: () => Promise<string | null>,
): Promise<string> {
  const number = await mintJobNumber();
  const { data: job, error: jobError } = await fsm
    .from("jobs")
    .insert({
      business_id: opportunity.business_id,
      number,
      party_id: opportunity.party_id,
      primary_contact_id: opportunity.primary_contact_id,
      service_address_id: opportunity.service_address_id,
      service_type_id: opportunity.service_type_id,
      description: opportunity.description,
      scope_of_work: opportunity.scope_of_work,
      opportunity_id: opportunity.id,
      created_by: opportunity.created_by,
    })
    .select("id")
    .single();
  if (jobError) throw jobError;

  const { error: oppError } = await fsm
    .from("opportunities")
    .update({ status: "won", converted_job_id: job.id })
    .eq("id", opportunity.id);
  if (oppError) throw oppError;

  return job.id;
}

/** Customer-facing approval from the public estimate page -- no Supabase session exists,
 * so this runs entirely through service-role clients, with the token itself as the sole
 * authorization (`resolvePortalToken` already checks scope, expiry, and rate limit).
 * Idempotent: approving an already-approved estimate just returns the job that was
 * already created rather than minting a second one. */
export async function approveEstimateByToken(rawToken: string): Promise<{ jobId: string }> {
  const token = await resolvePortalToken(rawToken, "estimate");
  const core = createCoreAdminClient({ schema: "core" });
  const fsm = createCoreAdminClient({ schema: "fsm" });

  const { data: doc, error: docError } = await core.from("documents").select("status, source_ref").eq("id", token.documentId).single();
  if (docError) throw docError;
  if (doc.status === "declined") throw new Error("This estimate was declined and can no longer be approved from this link.");

  const opportunityId = (doc.source_ref as { opportunity_id?: string })?.opportunity_id;
  if (!opportunityId) throw new Error("This estimate is not linked to an opportunity.");

  const { data: opportunity, error: oppError } = await fsm.from("opportunities").select("*").eq("id", opportunityId).single();
  if (oppError) throw oppError;

  if (doc.status === "approved" && opportunity.converted_job_id) {
    return { jobId: opportunity.converted_job_id };
  }

  const jobId = await createJobFromApprovedEstimate(fsm, opportunity as Opportunity, async () => {
    const { data } = await core.rpc("next_number_for_api", { p_business_id: token.businessId, p_scope: "job", p_prefix: "JOB" });
    return data ?? null;
  });

  await core.from("documents").update({ status: "approved" }).eq("id", token.documentId);
  await core.from("domain_events").insert({ business_id: token.businessId, type: "estimate.approved", payload: { opportunityId, jobId } });

  return { jobId };
}

/** Customer-facing decline from the public estimate page. Only marks the estimate
 * document declined -- per the PRD's own state machine, an opportunity only ever becomes
 * `lost` through explicit human action with a reason (§4), so a customer's decline alone
 * doesn't auto-advance it; staff follow up and mark it lost themselves if appropriate. */
export async function declineEstimateByToken(rawToken: string): Promise<void> {
  const token = await resolvePortalToken(rawToken, "estimate");
  const core = createCoreAdminClient({ schema: "core" });

  const { data: doc, error: docError } = await core.from("documents").select("status, source_ref").eq("id", token.documentId).single();
  if (docError) throw docError;
  if (doc.status === "approved") throw new Error("This estimate was already approved and can no longer be declined.");
  if (doc.status === "declined") return;

  await core.from("documents").update({ status: "declined" }).eq("id", token.documentId);
  await core.from("domain_events").insert({
    business_id: token.businessId,
    type: "estimate.declined",
    payload: { opportunityId: (doc.source_ref as { opportunity_id?: string })?.opportunity_id },
  });
}

/** Staff-side "approve internally" (PRD §2 Estimates row MUST list) -- same effect as a
 * customer approving on the public page (job created, opportunity won), but triggered
 * from the opportunity detail page by someone who took a verbal/phone approval. */
export async function approveEstimateInternal(businessId: string, opportunityId: string, estimateId: string): Promise<{ jobId: string }> {
  await requireModule(businessId, "fsm");
  await requirePermission(businessId, "estimates.edit");
  const core = await coreClient();
  const fsm = await createFsmClient();

  const { data: doc, error: docError } = await core.from("documents").select("status").eq("id", estimateId).eq("business_id", businessId).single();
  if (docError) throw docError;
  if (doc.status === "declined") throw new Error("This estimate was declined -- reopen or create a new one before approving.");

  const { data: opportunity, error: oppError } = await fsm
    .from("opportunities")
    .select("*")
    .eq("id", opportunityId)
    .eq("business_id", businessId)
    .single();
  if (oppError) throw oppError;

  if (doc.status === "approved" && opportunity.converted_job_id) {
    return { jobId: opportunity.converted_job_id };
  }

  const jobId = await createJobFromApprovedEstimate(fsm, opportunity as Opportunity, async () => {
    const { data } = await core.rpc("next_number", { p_business_id: businessId, p_scope: "job", p_prefix: "JOB" });
    return data ?? null;
  });

  await core.from("documents").update({ status: "approved" }).eq("id", estimateId);
  await publish({ businessId, type: "estimate.approved", payload: { opportunityId, jobId } });

  return { jobId };
}

/** Staff-side "decline internally" -- marks the estimate declined without requiring the
 * customer to click through the public page (e.g. a verbal decline over the phone). */
export async function declineEstimateInternal(businessId: string, opportunityId: string, estimateId: string): Promise<void> {
  await requireModule(businessId, "fsm");
  await requirePermission(businessId, "estimates.edit");
  const core = await coreClient();
  const { data: doc, error: docError } = await core.from("documents").select("status").eq("id", estimateId).eq("business_id", businessId).single();
  if (docError) throw docError;
  if (doc.status === "approved") throw new Error("This estimate was already approved and can no longer be declined.");
  if (doc.status === "declined") return;

  await core.from("documents").update({ status: "declined" }).eq("id", estimateId);
  await publish({ businessId, type: "estimate.declined", payload: { opportunityId } });
}
