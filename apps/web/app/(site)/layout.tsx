import type { ReactNode } from "react";
import { Navbar } from "@/components/marketing/navbar";
import { Footer } from "@/components/marketing/footer";

/**
 * The public pages that aren't the landing page itself -- /pricing, /careers, /terms and /privacy.
 * They wear the marketing site's clothes (same theme, navbar and footer as / and /help)
 * and read no tenant data, so the proxy lets them through without a session
 * (core/db/middleware.ts's RESERVED_TOP_SEGMENTS). A signed-in visitor sees them the same
 * way: they are read before signing up and linked from the sign-up form.
 */
export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="landing-theme flex min-h-screen flex-col bg-landing-bg text-landing-fg">
      <Navbar />
      <div className="flex flex-1 flex-col">{children}</div>
      <Footer />
    </div>
  );
}
