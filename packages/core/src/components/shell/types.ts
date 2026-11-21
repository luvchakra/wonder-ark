export interface ShellNavItem {
  label: string;
  /** Route segment under the module's own `routePrefix`; "" means the module's root
   * route itself. */
  slug: string;
  /** lucide-react icon name, resolved via ./module-icon. */
  icon: string;
}

export interface ShellNavGroup {
  /** Omitted for a flat list with no section heading. */
  heading?: string;
  items: ShellNavItem[];
}

/**
 * Minimal, duck-typed shape the shell needs from a module manifest — deliberately not
 * importing @cofounderai/module-registry's own type here, so packages/core stays
 * decoupled from that package (the caller, e.g. apps/web, maps its real
 * ModuleManifest[] into this shape; module-registry's own `ModuleNavGroup`/
 * `ModuleNavItem` are structurally identical to `ShellNavGroup`/`ShellNavItem` below, so
 * passing `moduleRegistry` straight through needs no per-field mapping).
 */
export interface ShellNavModule {
  key: string;
  name: string;
  /** lucide-react icon name, resolved via ./module-icon. */
  icon: string;
  routePrefix: string;
  /** This module's own sidebar nav tree, rendered generically by AppSidebar for every
   * module except discovery (whose real content is a live per-business product list,
   * not a static tree — see app-sidebar.tsx's own discovery special case). */
  nav: ShellNavGroup[];
  /** Active-or-grace for the effective business (listLicensedModuleKeysByBusiness).
   * Every module is listed in the picker regardless — an unlicensed one just routes to
   * the business's not-licensed page instead of switching the drawer to it, so a
   * founder can see what's available and how to unlock it rather than the module
   * quietly not existing at all. */
  licensed: boolean;
}

export interface ShellUser {
  name: string;
  email: string;
  avatarUrl?: string;
  /** Shows the account menu's "Demo data" link: the account tools at /dashboard/admin,
   * an environment-controlled gate (BUSINESS_ADMIN_EMAILS, or a platform admin),
   * unrelated to any business's own membership/role. Not itself a security boundary: the
   * page and its server actions each re-check requireBusinessAdmin(). */
  isBusinessAdmin?: boolean;
  /** PLATFORM-P1-10.16: where the account menu's "Platform admin" link leads, set only for
   * an email in PLATFORM_ADMIN_EMAILS. On an organization's address it is the console's
   * full address on the main one. Not a security boundary: the proxy and every /platform
   * read check the caller themselves. */
  platformAdminUrl?: string | null;
}

export interface ShellBusiness {
  id: string;
  /** core.business_settings.slug -- the URL segment this business is reachable at
   * (/[businessSlug]/...). Every business has one (generated at creation by
   * core.handle_new_business()), so this is never optional here. */
  slug: string;
  name: string;
  description?: string | null;
  /** core.businesses.logo_url -- the switcher falls back to a generic icon when unset. */
  logoUrl?: string | null;
  /** RBAC-31 -- the signed-in user's role in this business, shown in the switcher. */
  roleName?: string | null;
  /** PLATFORM-P1-10.5: production, development, test or staging (production when unset). */
  environment?: "production" | "development" | "test" | "staging";
  /** PLATFORM-P1-10.5: the business this one is an environment of; null for an organization. */
  organizationId?: string | null;
}

/** A discovery product/workspace belonging to a business -- shown under the sidebar's
 * Discovery section for whichever business is currently active. */
export interface ShellProduct {
  id: string;
  name: string;
}

/** A derived, non-persisted notification for the topbar's alert bell — see
 * @cofounderai/module-discovery's lib/alerts/derive.ts for how discovery computes these;
 * the shell itself has no opinion on where an alert comes from. */
export interface ShellAlert {
  id: string;
  severity: "warning" | "info";
  message: string;
  href: string;
  /** The business this alert is about — every alert is already scoped to exactly one
   * business (discovery's own product/workspace belongs to one; inventory/fsm/crm/gst's
   * getAlerts(businessId) contract calls are already per-business), so the bell can
   * filter to whichever business is currently selected in the navbar. */
  businessId: string;
}
