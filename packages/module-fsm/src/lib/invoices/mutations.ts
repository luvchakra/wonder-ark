import { EMAIL_NOT_SET_UP, platformSender, sendPlatformEmail } from "@cofounderai/core/email/platform-mailer";
import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { createAdminClient as createCoreAdminClient } from "@cofounderai/core/db/admin";
import { renderEmailHtml, renderEmailText } from "@cofounderai/core/email/render";
import { SITE_URL } from "@cofounderai/core/site";
import { publish } from "@cofounderai/core/events/mutations";
import { requireModule } from "@cofounderai/core/licensing/queries";
import { recordPayment, allocatePayment, voidPayment } from "@cofounderai/core/payments/mutations";
import { getDocumentBalance } from "@cofounderai/core/payments/queries";
import type { PaymentMethod } from "@cofounderai/core/payments/types";
import { createClient as createFsmClient } from "../../db/server";
import { generatePortalToken, hashPortalToken, resolvePortalToken } from "../portal-tokens/tokens";
import { getEstimateForOpportunity } from "../estimates/queries";
import { recomputeAndPersistTotals } from "../estimates/mutations";
import { getInvoice, getInvoiceForJob, listInvoiceLines } from "./queries";
import { platformKey } from "@cofounderai/core/admin/platform-key-store";

// Reused as-is for invoice charge lines -- both functions are already generic over any
// `core.documents` id, nothing about them is actually estimate-specific (F-3's own
// naming just reflects where they were first written).
export { addChargeLine, updateChargeLine, deleteChargeLine, reorderChargeLines } from "../estimates/mutations";

function coreClient() {
  return createCoreClient({ schema: "core" });
}

/** "Generate on completion or on demand" (PRD §2 Invoicing row) -- idempotent, one
 * invoice document per job (PRD §1.4's own model: the invoice is generated once, then
 * edited in place). If the job came from an approved estimate, its charge lines are
 * copied in as a starting point (still fully editable after -- "Editable document
 * view, charge adjustments" per PRD §1.4); a job with no opportunity (created directly,
 * F-5) or an estimate that was never approved starts with an empty invoice, and staff
 * add charges directly here -- this invoice editor is the only charge-line UI such a
 * job ever gets, closing the gap F-7 deliberately left open ("Charges are deliberately
 * not repeated here" -- true for opportunity-sourced jobs, not for job-only ones). */
export async function getOrCreateInvoiceForJob(businessId: string, jobId: string): Promise<string> {
  await requireModule(businessId, "fsm");
  const existing = await getInvoiceForJob(businessId, jobId);
  if (existing) return existing.id;

  const fsm = await createFsmClient();
  const { data: job, error: jobError } = await fsm.from("jobs").select("party_id, opportunity_id").eq("id", jobId).eq("business_id", businessId).single();
  if (jobError) throw jobError;

  const core = await coreClient();
  const { data: doc, error: docError } = await core
    .from("documents")
    .insert({ business_id: businessId, doc_type: "invoice", source_module: "fsm", source_ref: { job_id: jobId }, party_id: job.party_id, status: "draft" })
    .select("id")
    .single();
  if (docError) throw docError;
  const invoiceId: string = doc.id;

  if (job.opportunity_id) {
    const estimate = await getEstimateForOpportunity(businessId, job.opportunity_id);
    if (estimate && estimate.status === "approved") {
      const lines = await listInvoiceLines(businessId, estimate.id);
      if (lines.length > 0) {
        const { error: linesError } = await core.from("document_lines").insert(
          lines.map((l) => ({
            business_id: businessId,
            document_id: invoiceId,
            item_id: l.item_id,
            quantity: l.quantity,
            unit_price: l.unit_price,
            tax_rate: l.tax_rate,
            taxable: l.taxable,
            hsn_code: l.hsn_code,
            job_charge_type_id: l.job_charge_type_id,
            sort_order: l.sort_order,
          })),
        );
        if (linesError) throw linesError;
        // Recomputes each copied line's own CGST/SGST/IGST split fresh (never trusting
        // the estimate's already-computed amounts for a second financial document) --
        // core.documents' own trigger then sums those into the header automatically.
        await recomputeAndPersistTotals(businessId, invoiceId);
      }
    }
  }

  return invoiceId;
}

/** `draft -> issued`: mints a real sequential number (`core.next_number`, scope
 * `'invoice'`/`'INV'` -- the same scope F-4/F-5 already use for job-number-adjacent
 * counters, shared with `inventory` per F-1's own note: GST needs one continuous
 * invoice sequence per business regardless of which module issued it) and publishes
 * `document.issued` (00-MASTER-PLAN.md §6's own event catalogue: consumed by `gst` for
 * e-invoicing, S-2) with `requiredModule: 'gst'` so an unlicensed business's event
 * parks rather than failing permanently for lack of a registered handler -- same "buy
 * the module later and it still works" guarantee every other cross-module event in
 * this platform already gets. Idempotent past the first call. */
export async function issueInvoice(businessId: string, invoiceId: string): Promise<void> {
  await requireModule(businessId, "fsm");
  const core = await coreClient();
  const { data: doc, error } = await core.from("documents").select("status").eq("id", invoiceId).eq("business_id", businessId).single();
  if (error) throw error;
  if (doc.status !== "draft") return;

  const { data: number, error: numberError } = await core.rpc("next_number", { p_business_id: businessId, p_scope: "invoice", p_prefix: "INV" });
  if (numberError) throw numberError;

  const { error: updateError } = await core.from("documents").update({ status: "issued", number }).eq("id", invoiceId);
  if (updateError) throw updateError;

  await publish({ businessId, type: "document.issued", payload: { invoiceId, docType: "invoice" }, requiredModule: "gst" });
}

/** The customer's email for an invoice's own job -- same resolution order (primary
 * contact, then the party's own email) as `estimates/mutations.ts#resolveRecipientEmail`
 * and `events/mutations.ts#resolveEventCustomerEmail`. */
async function resolveJobCustomerEmail(businessId: string, jobId: string): Promise<string> {
  const fsm = await createFsmClient();
  const { data: job, error } = await fsm.from("jobs").select("party_id, primary_contact_id").eq("id", jobId).eq("business_id", businessId).single();
  if (error) throw error;

  const core = await coreClient();
  if (job.primary_contact_id) {
    const { data: contact } = await core.from("party_contacts").select("email").eq("id", job.primary_contact_id).maybeSingle();
    if (contact?.email) return contact.email;
  }
  const { data: party } = await core.from("parties").select("email").eq("id", job.party_id).maybeSingle();
  if (!party?.email) throw new Error("No email on file for this customer -- add one to the customer or their primary contact before sending.");
  return party.email;
}

/** Sends the invoice by email (PRD §1.4: "Send by email/SMS" -- email-only, same
 * documented SMS gap as F-7's `notifyOnTheWay`). Issues the invoice first if it's still
 * a draft -- sending necessarily makes it real. Reuses `module-discovery`'s Resend
 * pattern exactly, same as F-4's `sendEstimate`/F-7's `notifyOnTheWay`. A 90-day token
 * expiry (no `estimate_expiry_days`-equivalent setting exists for invoices) -- generous
 * enough that a real customer never hits it, short enough not to be a permanent link. */
export async function sendInvoice(businessId: string, jobId: string, invoiceId: string): Promise<void> {
  await requireModule(businessId, "fsm");
  const lines = await listInvoiceLines(businessId, invoiceId);
  if (lines.length === 0) throw new Error("Add at least one charge before sending the invoice.");

  await issueInvoice(businessId, invoiceId);

  const invoice = await getInvoice(businessId, invoiceId);
  if (!invoice) throw new Error("Invoice not found.");
  if (invoice.status === "voided") throw new Error("This invoice was voided and can no longer be sent.");

  const toEmail = await resolveJobCustomerEmail(businessId, jobId);

  const core = await coreClient();
  const { data: business } = await core.from("businesses").select("name, website").eq("id", businessId).maybeSingle();
  const brandName = business?.name ?? "Your service provider";

  // EMAIL-SMTP-01: the platform's SMTP mailbox (Platform admin → Keys).
  const fromAddress = (await platformSender())?.fromEmail;
  if (!fromAddress) throw new Error(EMAIL_NOT_SET_UP);

  const rawToken = generatePortalToken();
  const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

  const fsm = await createFsmClient();
  const { error: tokenError } = await fsm
    .from("portal_tokens")
    .insert({ business_id: businessId, party_id: invoice.party_id, token_hash: hashPortalToken(rawToken), scope: "invoice", document_id: invoiceId, expires_at: expiresAt });
  if (tokenError) throw tokenError;

  const publicUrl = `${SITE_URL}/p/i/${rawToken}`;
  const result = await sendPlatformEmail({
    to: toEmail,
    subject: `Invoice from ${brandName}`,
    text: renderEmailText(`Your invoice is ready.\n\n${publicUrl}`),
    html: renderEmailHtml({ brandName, body: `Your invoice is ready. **View it at the link below:**\n\n${publicUrl}`, websiteUrl: business?.website ?? null, replyToEmail: fromAddress }),
  });
  if (result.status !== "sent") throw new Error(`Could not send the invoice email: ${result.reason}`);

  if (invoice.status === "issued") {
    const { error: sentError } = await core.from("documents").update({ status: "sent" }).eq("id", invoiceId);
    if (sentError) throw sentError;
  }
}

/** First view of a sent invoice on the public page flips it to `viewed` -- same
 * "never downgrades an already-further-along status" reasoning as
 * `estimates/mutations.ts#markEstimateViewed`; safe to call on every page load. */
export async function markInvoiceViewed(rawToken: string): Promise<void> {
  const token = await resolvePortalToken(rawToken, "invoice");
  const core = createCoreAdminClient({ schema: "core" });
  await core.from("documents").update({ status: "viewed" }).eq("id", token.documentId).eq("status", "sent");
}

/** Recomputes `status` from the live balance after a payment lands (PRD §1.4: "Manual
 * ... payments must be logged as a payment on the job before marking paid, or the
 * balance won't zero out" -- this is that exact wiring) or is voided (SEC-7). Never
 * moves away from `voided`. A void that leaves nothing paid sends a paid/partially-paid
 * invoice back to `issued` -- the same simplification `markInvoiceUnpaid` documents. */
async function syncInvoiceStatusFromBalance(businessId: string, invoiceId: string): Promise<void> {
  const balance = await getDocumentBalance(invoiceId);
  if (!balance) return;
  const core = await coreClient();
  const { data: doc } = await core.from("documents").select("status").eq("id", invoiceId).maybeSingle();
  if (doc?.status === "voided") return;

  const status =
    balance.balance_amount <= 0
      ? "paid"
      : balance.paid_amount > 0
        ? "partially_paid"
        : doc?.status === "paid" || doc?.status === "partially_paid"
          ? "issued"
          : null;
  if (!status) return;
  const { error } = await core.from("documents").update({ status }).eq("id", invoiceId).eq("business_id", businessId);
  if (error) throw error;
}

/** "Record manual payment (cash/cheque/UPI/bank/card-offline)... partial payments"
 * (PRD §2 Invoicing row) -- reuses `core.payments`/`payment_allocations` (D-7) as-is,
 * zero new schema. */
export async function recordManualPayment(
  businessId: string,
  invoiceId: string,
  method: PaymentMethod,
  amount: number,
  reference?: string,
  notes?: string,
): Promise<void> {
  await requireModule(businessId, "fsm");
  if (!(amount > 0)) throw new Error("Payment amount must be greater than zero.");
  const invoice = await getInvoice(businessId, invoiceId);
  if (!invoice) throw new Error("Invoice not found.");

  const payment = await recordPayment({ businessId, partyId: invoice.party_id, method, amount, reference: reference || null, notes: notes || null });
  await allocatePayment({ businessId, paymentId: payment.id, documentId: invoiceId, amount });
  await syncInvoiceStatusFromBalance(businessId, invoiceId);
}

/** SEC-7: a recorded payment is corrected by voiding it, never by editing or deleting it.
 * `voidPayment` (core) decides who may and does the void -- `payments.void`, maker-checker,
 * a reason, the audit entry and Finance's reversal; this only scopes it to an invoice it
 * actually paid and brings the invoice's status back in line with its balance. */
export async function voidInvoicePayment(
  businessId: string,
  invoiceId: string,
  paymentId: string,
  reason: string,
): Promise<void> {
  await requireModule(businessId, "fsm");
  const invoice = await getInvoice(businessId, invoiceId);
  if (!invoice) throw new Error("Invoice not found.");
  const core = await coreClient();
  const { data: allocation, error } = await core
    .from("payment_allocations")
    .select("id")
    .eq("business_id", businessId)
    .eq("payment_id", paymentId)
    .eq("document_id", invoiceId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!allocation) throw new Error("That payment isn't applied to this invoice.");

  await voidPayment({ businessId, paymentId, reason });
  await syncInvoiceStatusFromBalance(businessId, invoiceId);
}

/** Manual override, distinct from the payment-driven sync above -- PRD §2 lists "mark
 * paid/unpaid" as its own bullet alongside "record manual payment", and Kickserv's own
 * UI keeps a manual toggle for cases a logged payment doesn't cover (money received
 * outside this system, correcting a mistake). `markInvoiceUnpaid` always reverts to
 * `issued` regardless of prior sent/viewed history -- a deliberate simplification
 * (documented, not silently dropped) rather than reconstructing exactly which of
 * `issued`/`sent`/`viewed` it should fall back to. */
export async function markInvoicePaid(businessId: string, invoiceId: string): Promise<void> {
  await requireModule(businessId, "fsm");
  const core = await coreClient();
  const { error } = await core.from("documents").update({ status: "paid" }).eq("id", invoiceId).eq("business_id", businessId);
  if (error) throw error;
}

export async function markInvoiceUnpaid(businessId: string, invoiceId: string): Promise<void> {
  await requireModule(businessId, "fsm");
  const core = await coreClient();
  const { error } = await core.from("documents").update({ status: "issued" }).eq("id", invoiceId).eq("business_id", businessId);
  if (error) throw error;
}

/** "Void by adjusting charges" / "credit note, never by deletion -- GST requires the
 * audit trail" (PRD §1.4, §4: `issued|sent -> voided`). Header-only reversal (no
 * per-line detail on the credit note itself -- not required by the MUST scope, unlike
 * `inventory.create_credit_note()`'s own fuller version, which FSM can't call anyway:
 * it lives in the `inventory` schema, a module-boundary violation). Idempotent. */
export async function voidInvoiceViaCreditNote(businessId: string, invoiceId: string, reason?: string): Promise<void> {
  await requireModule(businessId, "fsm");
  const invoice = await getInvoice(businessId, invoiceId);
  if (!invoice) throw new Error("Invoice not found.");
  if (invoice.status === "voided") return;

  const core = await coreClient();
  const { data: number, error: numberError } = await core.rpc("next_number", { p_business_id: businessId, p_scope: "credit_note", p_prefix: "CN" });
  if (numberError) throw numberError;

  const { error: cnError } = await core.from("documents").insert({
    business_id: businessId,
    doc_type: "credit_note",
    source_module: "fsm",
    source_ref: { invoice_id: invoiceId },
    party_id: invoice.party_id,
    number,
    status: "issued",
    reason: reason?.trim() || null,
    subtotal: invoice.subtotal,
    discount_amount: invoice.discount_amount,
    shipping_amount: invoice.shipping_amount,
    cgst_amount: invoice.cgst_amount,
    sgst_amount: invoice.sgst_amount,
    igst_amount: invoice.igst_amount,
    total_amount: invoice.total_amount,
  });
  if (cnError) throw cnError;

  const { error: voidError } = await core.from("documents").update({ status: "voided" }).eq("id", invoiceId).eq("business_id", businessId);
  if (voidError) throw voidError;
}
