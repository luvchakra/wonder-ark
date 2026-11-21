import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@cofounderai/core/db/server";
import { LAST_ORG_COOKIE_NAME } from "@cofounderai/core/db/middleware";
import { orgUrl } from "@cofounderai/core/lib/org-address";
import { isSuperadmin } from "@cofounderai/core/rbac/platform-admin";
import { getRequestHost } from "@/lib/org-host";

/**
 * PLATFORM-P1-10.3 (Main Address Landing): the main address's hand-off. A platform admin
 * goes to the console (PLATFORM-P1-10.16). Anyone else goes to the address of the
 * organization they used last, otherwise their first; with none, to create an organization.
 * Organizations are read under the person's own RLS -- only ones they belong to, active only.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const origin = new URL(request.url).origin;
  if (!claims?.claims) return NextResponse.redirect(`${origin}/login`);

  // PLATFORM-P1-10.16: the main address is also where WonderArk's own console lives, so a
  // platform admin who signs in here lands on it (the proxy then asks for the second
  // factor). "Your business" in the console comes back with ?to=business to skip this.
  const wantsBusiness = new URL(request.url).searchParams.get("to") === "business";
  const superadmin = await isSuperadmin().catch(() => false);
  if (superadmin && !wantsBusiness) return NextResponse.redirect(`${origin}/platform`);

  const core = await createClient({ schema: "core" });
  const { data, error } = await core
    .from("businesses")
    .select("id, status, created_at, business_settings(slug)")
    .eq("status", "active")
    .is("disabled_at", null)
    .order("created_at");
  if (error) return NextResponse.redirect(`${origin}/service-unavailable`);

  const slugs = (data ?? [])
    .map((b) => (b.business_settings as { slug: string } | { slug: string }[] | null))
    .map((s) => (Array.isArray(s) ? s[0]?.slug : s?.slug))
    .filter((s): s is string => Boolean(s));
  const last = (await cookies()).get(LAST_ORG_COOKIE_NAME)?.value;
  const slug = last && slugs.includes(last) ? last : slugs[0];

  if (!slug) {
    return NextResponse.redirect(`${origin}${superadmin ? "/platform" : "/dashboard/organizations"}`);
  }
  const { base, protocol, port } = await getRequestHost();
  const target = orgUrl(slug, base, protocol, port);
  return NextResponse.redirect(target ? `${target}/` : `${origin}/${slug}`);
}
