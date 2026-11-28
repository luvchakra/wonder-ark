import { NextResponse } from "next/server";
import { createClient } from "@cofounderai/core/db/server";
import { HELPER_ZIP_BASE64, HELPER_ZIP_NAME } from "@cofounderai/module-discovery/lib/instagram-helper/package.generated";

/**
 * DISC-IG-P0-01.3: the Instagram helper, as the zip its install page offers. It is the
 * extension's own files and nothing about any business, so the only check is that the
 * person is signed in (the install page that links here is signed-in only too).
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to WonderArk first." }, { status: 401 });
  return new NextResponse(new Uint8Array(Buffer.from(HELPER_ZIP_BASE64, "base64")), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${HELPER_ZIP_NAME}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
