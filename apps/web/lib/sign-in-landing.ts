import { isPlatformAdminEmail } from "@cofounderai/core/rbac/platform-admin-emails";
import { onOrgAddress } from "./org-host";

/** What the check needs of the just-signed-in session's client. */
type SignedInClient = {
  auth: { getUser: () => Promise<{ data: { user: { email?: string | null } | null } }> };
  schema: (name: "platform") => { rpc: (fn: "is_superadmin") => PromiseLike<{ data: unknown; error: unknown }> };
};

/**
 * PLATFORM-P1-10.16: where a sign-in on the main address lands when nothing asked for a
 * particular page. A platform admin lands on WonderArk's own console (the proxy then asks
 * for the second factor); everyone else on their dashboard, as before. On an organization's
 * address nobody is sent to the console: it lives on the main address only.
 *
 * Only a destination, never access: the proxy and every console read check the caller
 * themselves. Anything that cannot be confirmed is the dashboard.
 */
export async function mainAddressLanding(supabase: unknown): Promise<"/platform" | "/dashboard"> {
  try {
    if (await onOrgAddress()) return "/dashboard";
    const client = supabase as SignedInClient;
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user) return "/dashboard";
    if (isPlatformAdminEmail(user.email)) return "/platform";
    const { data, error } = await client.schema("platform").rpc("is_superadmin");
    return !error && data === true ? "/platform" : "/dashboard";
  } catch {
    return "/dashboard";
  }
}
