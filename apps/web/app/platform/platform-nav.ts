/**
 * PLATFORM-P0-19.1 ("Dedicated Admin Layout", docs/plan/09-PLATFORM-ADMIN-PORTAL-
 * BACKLOG.md §33) -- the grouped nav model for the real `/platform` sidebar, replacing
 * the flat `NAV_LINKS` strip `platform/layout.tsx` carried since PLATFORM-P0-01/03.1.
 *
 * Every one of the ~18 routes that flat strip already listed is preserved here verbatim
 * (same href, same label) -- this file only adds grouping, it drops nothing. Grouping
 * follows the doc's own §33 mockup ("Dashboard / Branding / Plans / Entitlements /
 * Modules / AI / Countries / Integrations / Policies / Operations / Audit") where a group
 * matches a route we've actually built, and otherwise groups adjacent already-shipped
 * pages under a heading not literally in that mockup (the mockup is illustrative, not
 * exhaustive -- every route it doesn't name still needs a home):
 *
 * - "Entitlements" isn't its own top-level route -- it's `/platform/plans/[id]/
 *   entitlements`, reached from a plan's own detail page, so it has no separate nav
 *   entry (same reason Plans' own `[id]` detail routes never got one).
 * - "Countries" (the mockup's label) is this platform's already-shipped "Compliance
 *   Packs" page (PLATFORM-P0-13) -- grouped under "Compliance" to match the label users
 *   already see on that page's own `<h1>`, not the mockup's generic placeholder.
 * - "Modules & Features" groups Modules with Feature Flags -- both are operational
 *   toggles over what capabilities exist/are visible, distinct from AI/Communications
 *   policy config.
 * - "AI" groups all four AI admin pages (Providers/Routing/Feature Policies/Usage), same
 *   as the mockup.
 * - "Communications" (not in the mockup) groups Email Provider/Email Templates/
 *   Notification Policies -- three pages the mockup doesn't name individually but that
 *   don't fit any of its other named groups.
 * - "Policies" holds Platform Policies (session/password/file/retention/rate-limit
 *   defaults) -- the mockup's own "Policies" group.
 * - "Operations" holds System Health (PLATFORM-P1-07), Announcements and Configuration
 *   History -- all ongoing platform-operations concerns (watching health; communicating
 *   with customers; auditing/rolling back config changes), matching the mockup's
 *   "Operations" group.
 * - "Audit" (PLATFORM-P0-16, §20) is now its own group, added once that story shipped --
 *   Configuration History (17) stays in Operations, unchanged; Audit Search is the new,
 *   distinct concern (every platform mutation, not just versioned config) so it gets its
 *   own home matching the mockup's own grouping.
 */
export interface PlatformNavLink {
  href: string;
  label: string;
}

export interface PlatformNavGroup {
  label: string | null;
  links: PlatformNavLink[];
}

export const PLATFORM_NAV_GROUPS: PlatformNavGroup[] = [
  {
    label: null,
    links: [{ href: "/platform", label: "Dashboard" }],
  },
  {
    label: "Branding",
    links: [{ href: "/platform/branding", label: "Platform Branding" }],
  },
  {
    // PLATFORM-P1-10.10: every customer organization and its environments.
    label: "Customers",
    links: [{ href: "/platform/organizations", label: "Organizations" }],
  },
  {
    label: "Plans",
    links: [
      { href: "/platform/plans", label: "Plans" },
      // PLATFORM-P1-02.1: per-business, time-boxed exceptions to a plan's limits.
      { href: "/platform/overrides", label: "Business Overrides" },
    ],
  },
  {
    // BILL-26..32 (docs/plan/14-SUBSCRIPTION-BILLING-BACKLOG.md §69). Plans stays the one
    // canonical plan catalog above -- its price mappings live on each plan's own page.
    label: "Billing",
    links: [
      { href: "/platform/billing", label: "Overview" },
      { href: "/platform/billing/subscriptions", label: "Subscriptions" },
      { href: "/platform/billing/payments", label: "Payments" },
      { href: "/platform/billing/events", label: "Webhook Events" },
      { href: "/platform/billing/providers", label: "Providers" },
    ],
  },
  {
    label: "Modules & Features",
    links: [
      { href: "/platform/modules", label: "Modules" },
      { href: "/platform/feature-flags", label: "Feature Flags" },
    ],
  },
  {
    label: "AI",
    links: [
      { href: "/platform/ai-providers", label: "AI Providers" },
      { href: "/platform/ai-routing", label: "AI Routing" },
      { href: "/platform/ai-feature-policies", label: "AI Feature Policies" },
      { href: "/platform/ai-usage", label: "AI Usage" },
    ],
  },
  {
    label: "Communications",
    links: [
      { href: "/platform/email-provider", label: "Email Provider" },
      { href: "/platform/email-templates", label: "Email Templates" },
      { href: "/platform/notification-policies", label: "Notification Policies" },
    ],
  },
  {
    label: "Integrations",
    links: [
      { href: "/platform/integrations", label: "Integrations" },
      // PLATFORM-P1-13.2: the WonderJobs career-site key behind the public /careers pages.
      { href: "/platform/careers", label: "Careers" },
    ],
  },
  {
    label: "Compliance",
    links: [{ href: "/platform/compliance", label: "Compliance Packs" }],
  },
  {
    label: "Policies",
    links: [
      { href: "/platform/system-policies", label: "Platform Policies" },
      // PLATFORM-P1-09.1/09.2/09.4: Terms and Privacy versions, acceptance, cookies.
      { href: "/platform/legal", label: "Legal" },
    ],
  },
  {
    label: "Operations",
    links: [
      { href: "/platform/health", label: "System Health" },
      { href: "/platform/announcements", label: "Announcements" },
      { href: "/platform/config-history", label: "Configuration History" },
    ],
  },
  {
    label: "Audit",
    links: [{ href: "/platform/audit", label: "Audit Search" }],
  },
];

/** Flat list, derived from the grouped source above -- kept for anything that just needs "every nav link" (none today, but cheaper than a second hand-maintained list). */
export const PLATFORM_NAV_LINKS: PlatformNavLink[] = PLATFORM_NAV_GROUPS.flatMap((group) => group.links);
