import { redirect } from "next/navigation";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { createClient } from "@cofounderai/core/db/server";
import { getPendingLegalAcceptances } from "@cofounderai/core/privacy/legal-acceptance";
import { getHostBusiness, getRequestHost } from "@/lib/org-host";
import { getAnnouncementsByBusiness } from "@cofounderai/core/announcements/active";
import { isPlatformAdminEmail } from "@cofounderai/core/rbac/platform-admin";
import type { ShellAlert } from "@cofounderai/core/shell/types";
import { getCurrentAccount } from "@cofounderai/module-discovery/lib/tenancy/queries";
import { getAiProviderConnection } from "@cofounderai/module-discovery/lib/ai-providers/queries";
import {
  getAccountBusinesses,
  getAccountUsageAndProspects,
  getAccountWorkspaceEntries,
} from "@cofounderai/module-discovery/lib/dashboard/queries";
import { deriveAccountAlerts } from "@cofounderai/module-discovery/lib/alerts/derive";
import { getGroupedSignalAlerts } from "@cofounderai/module-discovery/lib/alerts/grouped-signals";
import { getMarketingFundingAlerts } from "@cofounderai/module-discovery/lib/alerts/marketing-funding";
import { getExportAlerts } from "@/lib/exports/alerts";
import { getMyBusinessAccess, modulesVisibleTo, type BusinessAccess } from "@cofounderai/core/rbac/effective";
import { getBillingAlerts } from "@/lib/billing-alerts";
import { creditsUsedPercent } from "@cofounderai/module-discovery/lib/usage/format";
import { FREE_TIER_MONTHLY_COST_LIMIT_USD } from "@cofounderai/module-discovery/lib/usage/limits";
import { listLicensedModuleKeysByBusiness } from "@cofounderai/core/licensing/queries";
import { moduleRegistry } from "@cofounderai/module-registry";
import { getAlerts as getInventoryAlerts } from "@cofounderai/module-inventory/contract/index";
import { getAlerts as getFsmAlerts } from "@cofounderai/module-fsm/contract/index";
import { getAlerts as getCrmAlerts } from "@cofounderai/module-crm/contract/index";
import { getAlerts as getGstAlerts } from "@cofounderai/module-gst/contract/index";
import { DashboardChrome } from "@/components/dashboard/dashboard-chrome";
import { createBusinessAction, createBusinessFromWebsiteAction } from "@/app/(dashboard)/dashboard/actions";

/** Signed-in pages are never indexed or followed by any crawler (AI or search). */
export const metadata: Metadata = { robots: { index: false, follow: false, nocache: true, noimageindex: true } };

const OTHER_MODULE_ALERTS: Record<"inventory" | "fsm" | "crm" | "gst", (businessId: string) => Promise<{ ok: boolean; data?: ShellAlert[] }>> = {
  inventory: getInventoryAlerts,
  fsm: getFsmAlerts,
  crm: getCrmAlerts,
  gst: getGstAlerts,
};

type BusinessEnvironment = { environment: "production" | "development" | "test" | "staging"; organizationId: string | null };

async function loadEnvironments(supabase: Awaited<ReturnType<typeof createClient>>): Promise<Map<string, BusinessEnvironment>> {
  const { data, error } = await supabase.schema("core").rpc("my_business_environments");
  if (error) {
    console.error("Business environments unavailable:", error.message);
    return new Map();
  }
  return new Map(
    ((data ?? []) as { business_id: string; environment: BusinessEnvironment["environment"]; parent_business_id: string | null }[]).map((r) => [
      r.business_id,
      { environment: r.environment, organizationId: r.parent_business_id },
    ]),
  );
}

/**
 * Item #13 of a UX pass: "expand the notification feature... to all modules" -- the
 * bell (AlertBell) previously only ever showed discovery-derived alerts
 * (deriveAccountAlerts), even though inventory/fsm/crm/gst each have their own
 * dashboard-worthy signals (low stock, overdue invoices, open tickets, GSTIN risk).
 * Each module's own `contract/index.ts#getAlerts` (mechanism 2, ADR-10) is the correct
 * cross-module call -- MODULE_NOT_LICENSED results are silently skipped, same as
 * buildOtherModuleSummaries' own reasoning for the AI chat's "consult all modules"
 * path, not duplicated logic here.
 */
async function getOtherModuleAlerts(
  businesses: { id: string }[],
  licensedModuleKeysByBusiness: Record<string, string[]>,
): Promise<ShellAlert[]> {
  const calls: Promise<ShellAlert[]>[] = [];
  for (const business of businesses) {
    const licensed = new Set(licensedModuleKeysByBusiness[business.id] ?? []);
    for (const key of Object.keys(OTHER_MODULE_ALERTS) as (keyof typeof OTHER_MODULE_ALERTS)[]) {
      if (!licensed.has(key)) continue;
      calls.push(
        OTHER_MODULE_ALERTS[key](business.id).then((result) => (result.ok ? result.data ?? [] : [])),
      );
    }
  }
  const results = await Promise.all(calls);
  return results.flat();
}

/**
 * Everything the bell shows, gathered off the critical path. The shell's own render
 * awaits nothing in here: the layout starts this and hands the promise to the topbar,
 * which resolves it behind a Suspense boundary, so the rail and the page are on screen
 * while these queries (workspaces, this month's usage, every prospect's pipeline state,
 * and each licensed module's own dashboard summary) are still running. A failure here
 * is logged and shows an empty bell -- it must never take the shell down with it.
 */
async function loadAlerts(
  accountId: string,
  businesses: { id: string }[],
  licensedModuleKeysByBusiness: Record<string, string[]>,
): Promise<ShellAlert[]> {
  try {
    const [{ entries }, { usageByWorkspace, prospects }, otherModuleAlerts, marketingFundingAlerts, exportAlerts, billingAlerts] = await Promise.all([
      getAccountWorkspaceEntries(accountId),
      getAccountUsageAndProspects(accountId),
      getOtherModuleAlerts(businesses, licensedModuleKeysByBusiness),
      // MKT-15/FND-17: Discovery's Marketing and Funding items, for each business with a
      // Discovery licence. One business failing never empties the whole bell.
      Promise.all(
        businesses
          .filter((b) => (licensedModuleKeysByBusiness[b.id] ?? []).includes("discovery"))
          .map((b) => getMarketingFundingAlerts(b.id).catch(() => [])),
      ).then((lists) => lists.flat()),
      // EXP-PLAT-06: this user's finished background exports.
      getExportAlerts().catch(() => []),
      // BILL-34: payment trouble and plans about to end.
      getBillingAlerts(businesses.map((b) => b.id)).catch(() => []),
    ]);
    const discoveryAlerts = deriveAccountAlerts({ entries, usageByWorkspace, prospects });
    // DISC-OFFER-P1-01.4: one alert per account whose signals line up. A failure here
    // never empties the rest of the bell.
    const signalAlerts = await getGroupedSignalAlerts(entries).catch(() => []);
    return [...billingAlerts, ...exportAlerts, ...discoveryAlerts, ...signalAlerts, ...marketingFundingAlerts, ...otherModuleAlerts].sort((a, b) =>
      a.severity === b.severity ? 0 : a.severity === "warning" ? -1 : 1,
    );
  } catch (error) {
    console.error("[dashboard] alerts failed to load", error);
    return [];
  }
}

/**
 * Same blend as co-founder-ai's own dashboard layout: total spend across every
 * workspace on the account against the free-tier limit times workspace count. The
 * free-tier cap (and this percentage) only means anything while the account is running
 * on CoFounderAI's own included credit -- once BYOK is connected, usage bills to the
 * founder's own provider account with no cap from us, so the indicator is hidden
 * (`undefined`) rather than shown pinned at some stale/misleading number (item #16).
 * Streamed to the rail's meter the same way `loadAlerts` feeds the bell.
 */
async function loadCreditsUsedPercent(accountId: string): Promise<number | undefined> {
  try {
    const [aiConnection, { usageByWorkspace }, { entries }] = await Promise.all([
      getAiProviderConnection(accountId),
      getAccountUsageAndProspects(accountId),
      getAccountWorkspaceEntries(accountId),
    ]);
    if (aiConnection) return undefined;
    const totalCost = Object.values(usageByWorkspace).reduce((sum, u) => sum + u.totalCost, 0);
    return creditsUsedPercent(totalCost, FREE_TIER_MONTHLY_COST_LIMIT_USD * Math.max(entries.length, 1));
  } catch (error) {
    console.error("[dashboard] AI credits failed to load", error);
    return undefined;
  }
}

/**
 * The shell around every dashboard page. Its render is kept to what the rail and the
 * topbar need to paint -- who's signed in, the account's businesses and products, and
 * which modules each business has licensed: four round trips, in the order their
 * inputs allow. Everything else (the bell's alerts, the AI-credits meter) is started
 * here but resolved behind Suspense boundaries in the client, streaming in after the
 * page. Previously all of it was awaited up front, a dozen sequential round trips
 * before a single byte of any page could be sent.
 *
 * Client-side navigations don't re-run this component at all -- the rail's links are
 * <Link>s, so only the page segment is fetched -- which is why the data here is allowed
 * to be a snapshot from the last full load.
 */
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  // Independent round trips (verifying the session vs. an RLS-scoped accounts query
  // keyed off the session cookie, not off `user`) -- run them together. getClaims()
  // verifies the token's signature locally against the project's public key rather than
  // asking the Auth server on every page (see packages/core/src/db/middleware.ts).
  const [{ data: claims }, account] = await Promise.all([
    supabase.auth.getClaims(),
    getCurrentAccount(),
  ]);
  const user = claims?.claims;
  if (!user) redirect("/login");

  const [{ businesses, productsByBusiness }, pendingLegal] = await Promise.all([
    account ? getAccountBusinesses(account.id) : Promise.resolve({ businesses: [], productsByBusiness: {} }),
    // PLATFORM-P1-09.4: a user who hasn't accepted the active Terms / Privacy Policy is asked
    // first. A failed lookup doesn't lock everyone out of the app; it's logged and retried on
    // the next page load.
    getPendingLegalAcceptances().catch((e: unknown) => {
      console.error("Legal acceptance status unavailable:", e instanceof Error ? e.message : "unknown error");
      return [];
    }),
  ]);
  if (pendingLegal.length > 0) redirect("/legal/accept");

  // PLATFORM-P1-10.1/10.2: on an organization's address, a paused organization (suspended, or
  // disabled by its owner) is closed to everyone (owner decision 2026-10-13: hidden and
  // closed, not RLS-enforced); the shell learns which address it is on.
  const [requestHost, hostBusiness] = await Promise.all([getRequestHost(), getHostBusiness().catch(() => null)]);
  if (hostBusiness && !("missing" in hostBusiness) && hostBusiness.status !== "active") redirect("/organization-paused");
  const orgAddress = {
    hostSlug: requestHost.target.kind === "organization" ? requestHost.target.label : null,
    base: requestHost.base,
    protocol: requestHost.protocol,
    port: requestHost.port,
  };

  // CLAUDE.md's 4th licensing-enforcement layer ("UI built from module-registry
  // filtered by entitlements") -- previously missing entirely here: this used to pass
  // the raw registry straight through with no license check (docs/testing/
  // EXECUTION-2026-09-08.md finding 5). One batched query for every business on the
  // account; DashboardChrome filters by whichever business is currently active.
  const [licensedByBusiness, accessByBusiness, announcementsByBusiness, environmentByBusiness] = await Promise.all([
    listLicensedModuleKeysByBusiness(businesses.map((b) => b.id)),
    // RBAC-30/31: the user's role in each business. Navigation shows a module only when it
    // is licensed AND the role may open it; the route guard and RLS enforce the same.
    getMyBusinessAccess().catch(() => new Map<string, BusinessAccess>()),
    // PLATFORM-P1-10.13: the platform's notices for each business.
    getAnnouncementsByBusiness(businesses.map((b) => b.id)),
    // PLATFORM-P1-10.5: which environment each business is, and its organization. Without it
    // the switcher simply shows no environment chips.
    loadEnvironments(supabase),
  ]);
  const licensedModuleKeysByBusiness = Object.fromEntries(
    Object.entries(licensedByBusiness).map(([businessId, keys]) => [businessId, modulesVisibleTo(accessByBusiness.get(businessId), keys)]),
  );

  // Started, not awaited: see loadAlerts / loadCreditsUsedPercent.
  const alerts = account
    ? loadAlerts(account.id, businesses, licensedModuleKeysByBusiness)
    : Promise.resolve<ShellAlert[]>([]);
  const creditsPercent = account
    ? loadCreditsUsedPercent(account.id)
    : Promise.resolve<number | undefined>(undefined);

  const metadata = user.user_metadata ?? {};
  const displayName = (metadata.full_name || metadata.name || user.email || "Founder") as string;
  const avatarUrl = (metadata.avatar_url || metadata.picture || undefined) as string | undefined;

  return (
    <DashboardChrome
      modules={moduleRegistry}
      licensedModuleKeysByBusiness={licensedModuleKeysByBusiness}
      // `logo_url` is the column; `logoUrl` is what the shell's own (deliberately
      // framework-shaped, not row-shaped) ShellBusiness exposes, so it's mapped here
      // rather than leaking the DB's snake_case into packages/core.
      businesses={businesses.map((b) => ({ ...b, logoUrl: b.logo_url, roleName: accessByBusiness.get(b.id)?.roleName ?? null, ...environmentByBusiness.get(b.id) }))}
      productsByBusiness={productsByBusiness}
      creditsUsedPercent={creditsPercent}
      accountId={account?.id ?? ""}
      user={{
        name: displayName,
        email: user.email ?? "",
        avatarUrl,
        isPlatformAdmin: isPlatformAdminEmail(user.email),
      }}
      alerts={alerts}
      createBusinessAction={createBusinessAction}
      createBusinessFromWebsiteAction={createBusinessFromWebsiteAction}
      orgAddress={orgAddress}
      announcementsByBusiness={announcementsByBusiness}
    >
      {children}
    </DashboardChrome>
  );
}
