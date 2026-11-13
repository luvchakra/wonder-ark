import type { ReactNode } from "react";
import { AppSidebar } from "./app-sidebar";
import { AppTopbar } from "./app-topbar";
import { SidebarProvider } from "./sidebar-context";
import { SidebarFab } from "./sidebar-fab";
import type { ShellAlert, ShellBusiness, ShellNavModule, ShellProduct, ShellUser } from "./types";

/**
 * The platform's dashboard shell: a persistent left rail with the content column beside
 * it, per docs/DESIGN.md. The rail is `fixed` and full-height, so the column is offset by
 * its width from `lg` up and sits at full width below that (where the rail becomes a
 * slide-over drawer instead). `modules`/`businesses`/`user` are supplied by the caller --
 * this component has no opinion on where that data comes from (module-registry, a
 * session, etc.).
 */
export function DashboardShell({
  modules,
  businesses,
  activeBusinessId,
  businessHref,
  productsByBusiness,
  creditsUsedPercent,
  onCreateBusiness,
  user,
  alerts,
  chatSlot,
  onSignOut,
  children,
}: {
  modules: ShellNavModule[];
  businesses: ShellBusiness[];
  activeBusinessId?: string | null;
  businessHref?: (businessId: string) => string;
  productsByBusiness?: Record<string, ShellProduct[]>;
  /** % of AI credits used this month, blended across every workspace on the account --
   * or a promise of it, resolved in the rail behind its own Suspense boundary. */
  creditsUsedPercent?: number | Promise<number | undefined>;
  onCreateBusiness?: () => void;
  user: ShellUser;
  /** The bell's alerts, or a promise of them resolved in the topbar behind Suspense. */
  alerts?: ShellAlert[] | Promise<ShellAlert[]>;
  chatSlot?: ReactNode;
  onSignOut?: () => void;
  children: ReactNode;
}) {
  const hrefFor = businessHref ?? (() => "#");
  return (
    <SidebarProvider>
      <div className="flex min-h-full flex-1">
        <AppSidebar
          modules={modules}
          businesses={businesses}
          activeBusinessId={activeBusinessId}
          businessHref={hrefFor}
          productsByBusiness={productsByBusiness}
          creditsUsedPercent={creditsUsedPercent}
          onCreateBusiness={onCreateBusiness}
          user={user}
          onSignOut={onSignOut}
        />
        {/* `min-w-0` matters as much as the offset: without it this flex child refuses to
            shrink below its content's intrinsic width, and a wide table inside `children`
            would stretch the column past the viewport instead of scrolling inside its own
            container. */}
        <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
          <AppTopbar
            businesses={businesses}
            activeBusinessId={activeBusinessId}
            businessHref={hrefFor}
            alerts={alerts}
            chatSlot={chatSlot}
          />
          {/* `overflow-x-hidden` is the platform-wide backstop for CLAUDE.md rule #12 (no
              page ever scrolls horizontally) -- any element that misbehaves and paints
              wider than the viewport (a chart's first frame, an unwrapped long string)
              gets clipped here instead of pushing the whole page into horizontal scroll.
              Doesn't affect the legitimate `overflow-x-auto` containers (tables, etc.)
              nested inside `children` -- those still scroll internally exactly as
              before. */}
          {/* Bottom padding below `lg` keeps the last of the page clear of the menu button. */}
          <main className="flex-1 overflow-x-hidden bg-background p-4 pb-24 sm:p-6 sm:pb-24 lg:pb-6">{children}</main>
        </div>
      </div>
      <SidebarFab />
    </SidebarProvider>
  );
}
