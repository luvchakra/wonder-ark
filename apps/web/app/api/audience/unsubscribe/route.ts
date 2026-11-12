import { unsubscribeLead } from "@cofounderai/module-discovery/lib/audience/public";

/**
 * DISC-CONS-P0-03.5: the unsubscribe link in every email to a person on an offering's
 * list. As with /api/unsubscribe, GET only shows a button (mail scanners prefetch links)
 * and POST records it, which is also the RFC 8058 one-click target. The person's private
 * token is the authorisation. Unsubscribing marks them unsubscribed, which blocks every
 * later send, and adds the address to the business's opt-out list.
 */
export const dynamic = "force-dynamic";

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function page(title: string, body: string, status = 200): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title></head>
<body style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;background:#f4f6fa;margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center">
<main style="background:#fff;border:1px solid #e4e7ec;border-radius:12px;padding:32px;max-width:420px;margin:16px">
<h1 style="font-size:20px;margin:0 0 12px;color:#111827">${title}</h1>${body}</main></body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

const invalid = () =>
  page("Link not valid", `<p style="color:#4b5563">This unsubscribe link is invalid or incomplete. Reply to the email you received and ask to be removed instead.</p>`, 400);

function tokenOf(request: Request): string | null {
  const token = new URL(request.url).searchParams.get("t");
  return token && /^[a-f0-9]{32,64}$/.test(token) ? token : null;
}

export async function GET(request: Request) {
  const token = tokenOf(request);
  if (!token) return invalid();
  return page(
    "Unsubscribe",
    `<p style="color:#4b5563">Stop receiving emails about this from this sender?</p>
<form method="post" action="/api/audience/unsubscribe?t=${escapeHtml(encodeURIComponent(token))}"><button type="submit" style="background:#2563eb;color:#fff;border:0;border-radius:8px;padding:10px 18px;font-size:15px;cursor:pointer">Unsubscribe</button></form>`,
  );
}

export async function POST(request: Request) {
  const token = tokenOf(request);
  if (!token) return invalid();
  let found: boolean;
  try {
    found = await unsubscribeLead(token);
  } catch {
    return page("Something went wrong", `<p style="color:#4b5563">We couldn't record your request just now. Please try again, or reply to the email and ask to be removed.</p>`, 500);
  }
  if (!found) return invalid();
  return page("You're unsubscribed", `<p style="color:#4b5563">You won't receive further emails about this from this sender.</p>`);
}
