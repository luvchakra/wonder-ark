import { NextResponse } from "next/server";
import { createClient } from "@cofounderai/core/db/server";

/**
 * DISC-IG-P0-01.2: the door for the WonderArk Instagram helper's calls. They are made with
 * the person's own session cookie, so a web page on another site must not be able to make
 * them for the person (cross-site request forgery). Two checks, both required:
 *
 *  - the `X-WonderArk-Helper` header. A page on another site cannot add a custom header
 *    without a CORS preflight, and these routes answer no preflight.
 *  - the `Origin`, when the browser sends one, is the extension's (`chrome-extension://`)
 *    or this site's own; any other web origin is refused.
 *
 * Then the person must be signed in. Returns the refusal to send, or null to go on.
 */
export async function refuseHelperRequest(request: Request): Promise<NextResponse | null> {
  if (request.headers.get("x-wonderark-helper") !== "1") {
    return NextResponse.json({ error: "Not a helper request." }, { status: 403 });
  }
  const origin = request.headers.get("origin");
  if (origin && !origin.startsWith("chrome-extension://") && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Not a helper request." }, { status: 403 });
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to WonderArk first." }, { status: 401 });
  return null;
}

/** A JSON body, or null when it is missing, not JSON or not an object. */
export async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
