import { EMAIL_NOT_SET_UP, platformSender, sendPlatformEmail } from "@cofounderai/core/email/platform-mailer";
import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { createAdminClient as createCoreAdminClient } from "@cofounderai/core/db/admin";
import { renderEmailHtml, renderEmailText } from "@cofounderai/core/email/render";
import { SITE_URL } from "@cofounderai/core/site";
import { requireModule } from "@cofounderai/core/licensing/queries";
import { createClient as createFsmClient } from "../../db/server";
import { generatePortalToken, hashPortalToken, resolveCenterToken } from "../portal-tokens/tokens";
import { approveEstimateByToken, declineEstimateByToken } from "../estimates/mutations";
import { platformKey } from "@cofounderai/core/admin/platform-key-store";

function coreClient() {
  return createCoreClient({ schema: "core" });
}

/** Staff-side "give this customer Customer Center access" -- there's no dedicated
 * customer/contacts screen yet (`/fsm/customers` is unbuilt, same gap F-6's roster panel
 * already noted for technicians), so this is exposed from the job detail page against
 * that job's own party, the natural place staff already are when a customer asks for
 * portal access. Gated on `fsm.settings.customer_center_enabled` (default false, no
 * settings row yet since F-15 hasn't landed) -- same "flag exists, defaults off, no UI to
 * flip it yet" sequencing F-8's `auto_invoice_on_complete` already established; this
 * simply can't be used until F-15 ships the toggle, which is expected, not a bug. A
 * 30-day token expiry, generous for a portal link meant to be reused repeatedly rather
 * than a one-time estimate/invoice send. */
export async function sendCustomerCenterAccess(businessId: string, partyId: string): Promise<void> {
  await requireModule(businessId, "fsm");
  const core = await coreClient();
  const fsm = await createFsmClient();

  const { data: settings } = await fsm.from("settings").select("customer_center_enabled").eq("business_id", businessId).maybeSingle();
  if (!settings?.customer_center_enabled) {
    throw new Error("Customer Center isn't enabled for this business yet.");
  }

  const { data: party } = await core.from("parties").select("email").eq("id", partyId).eq("business_id", businessId).maybeSingle();
  if (!party?.email) throw new Error("No email on file for this customer -- add one before sending Customer Center access.");

  // EMAIL-SMTP-01: the platform's SMTP mailbox (Platform admin → Keys).
  const fromAddress = (await platformSender())?.fromEmail;
  if (!fromAddress) throw new Error(EMAIL_NOT_SET_UP);

  const { data: business } = await core.from("businesses").select("name, website").eq("id", businessId).maybeSingle();
  const brandName = business?.name ?? "Your service provider";

  const rawToken = generatePortalToken();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const { error: tokenError } = await fsm
    .from("portal_tokens")
    .insert({ business_id: businessId, party_id: partyId, token_hash: hashPortalToken(rawToken), scope: "center", document_id: null, expires_at: expiresAt });
  if (tokenError) throw tokenError;

  const publicUrl = `${SITE_URL}/p/center/${rawToken}`;
  const result = await sendPlatformEmail({
    to: party.email,
    subject: `Your Customer Center from ${brandName}`,
    text: renderEmailText(`View your estimates, invoices, and upcoming work anytime.\n\n${publicUrl}`),
    html: renderEmailHtml({
      brandName,
      body: `View your **estimates, invoices, and upcoming work** anytime at the link below:\n\n${publicUrl}`,
      websiteUrl: business?.website ?? null,
      replyToEmail: fromAddress,
    }),
  });
  if (result.status !== "sent") throw new Error(`Could not send the Customer Center email: ${result.reason}`);
}

/** Mints a short-lived, single-purpose estimate token and immediately calls the
 * already-built `approveEstimateByToken` (F-4) -- rather than duplicating its approval
 * logic a second time, the center page piggybacks on the exact same, already-tested
 * mechanism the public estimate page itself uses. Verifies the estimate actually belongs
 * to this center token's own party/business first, so a valid center token for one
 * customer can't approve another customer's estimate by id-guessing. */
export async function approveEstimateFromCenter(rawCenterToken: string, estimateId: string): Promise<{ jobId: string }> {
  const center = await resolveCenterToken(rawCenterToken);
  const rawToken = await mintScopedEstimateToken(center.businessId, center.partyId, estimateId);
  return approveEstimateByToken(rawToken);
}

export async function declineEstimateFromCenter(rawCenterToken: string, estimateId: string): Promise<void> {
  const center = await resolveCenterToken(rawCenterToken);
  const rawToken = await mintScopedEstimateToken(center.businessId, center.partyId, estimateId);
  return declineEstimateByToken(rawToken);
}

async function mintScopedEstimateToken(businessId: string, partyId: string, estimateId: string): Promise<string> {
  const core = createCoreAdminClient({ schema: "core" });
  const { data: doc } = await core.from("documents").select("id, party_id, business_id, doc_type").eq("id", estimateId).maybeSingle();
  if (!doc || doc.party_id !== partyId || doc.business_id !== businessId || doc.doc_type !== "estimate") {
    throw new Error("Estimate not found.");
  }

  const fsm = createCoreAdminClient({ schema: "fsm" });
  const rawToken = generatePortalToken();
  const { error } = await fsm.from("portal_tokens").insert({
    business_id: businessId,
    party_id: partyId,
    token_hash: hashPortalToken(rawToken),
    scope: "estimate",
    document_id: estimateId,
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  });
  if (error) throw error;
  return rawToken;
}
