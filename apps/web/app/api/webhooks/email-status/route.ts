import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { ingestSendStatus } from "@cofounderai/module-discovery/lib/messages/ingest-send-status";
import { platformKey } from "@cofounderai/core/admin/platform-key-store";

/**
 * Resend delivery-status webhook (docs/prospects-pipeline-redesign-requirements.md
 * R1/R2) -- flips a message to 'failed' when Resend reports a bounce/complaint/send
 * failure asynchronously, after the send-response itself already marked it 'sent'
 * (lib/messages/send.ts). Point Resend's webhook dashboard at this URL and set
 * RESEND_WEBHOOK_SECRET to the signing secret it gives you.
 *
 * Resend signs webhooks the Svix way: svix-id/svix-timestamp/svix-signature headers,
 * HMAC-SHA256 over "{id}.{timestamp}.{raw body}", secret base64-encoded after a
 * "whsec_" prefix. Verified manually here rather than pulling in the svix package for
 * one check.
 */
function verifySignature(rawBody: string, headers: Headers, secret: string): boolean {
  const id = headers.get("svix-id");
  const timestamp = headers.get("svix-timestamp");
  const signatureHeader = headers.get("svix-signature");
  if (!id || !timestamp || !signatureHeader) return false;

  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signedContent = `${id}.${timestamp}.${rawBody}`;
  const expected = createHmac("sha256", secretBytes).update(signedContent).digest();

  return signatureHeader.split(" ").some((part) => {
    const [, signature] = part.split(",");
    if (!signature) return false;
    const provided = Buffer.from(signature, "base64");
    return provided.length === expected.length && timingSafeEqual(provided, expected);
  });
}

type ResendWebhookPayload = {
  type?: string;
  data?: { email_id?: string; bounce?: { message?: string }; reason?: string };
};

export async function POST(request: Request) {
  const secret = await platformKey("RESEND_WEBHOOK_SECRET");
  if (!secret) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 401 });
  }

  const rawBody = await request.text();
  if (!verifySignature(rawBody, request.headers, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const payload = JSON.parse(rawBody) as ResendWebhookPayload;
  const providerMessageId = payload.data?.email_id;
  if (!providerMessageId || typeof payload.type !== "string") {
    return NextResponse.json({ error: "Unrecognized payload" }, { status: 400 });
  }

  const status = payload.type.replace(/^email\./, "");
  const reason = payload.data?.bounce?.message ?? payload.data?.reason ?? null;

  const result = await ingestSendStatus({
    providerMessageId,
    status: status as "sent" | "delivered" | "bounced" | "failed" | "complained",
    reason,
  });

  if (!result.matched) {
    // 200, not an error -- an event for a status we don't act on, or a message this
    // workspace doesn't have (e.g. a different Resend account), isn't a webhook
    // failure, and an error status would make Resend retry indefinitely.
    return NextResponse.json({ matched: false, reason: result.reason });
  }
  return NextResponse.json({ matched: true, messageId: result.message.id });
}
