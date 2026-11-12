"use client";

import Link from "next/link";
import { useAppPathname } from "@cofounderai/core/shell/org-address-context";
import { cn } from "@cofounderai/core/lib/utils";

/**
 * The in-page tab strip for a Discovery section (Marketing, Funding). The sidebar already
 * lists these pages; this repeats them across the top so a founder on a phone — where the
 * sidebar is a closed drawer — can move between them in one tap (DISC-NAV-06).
 *
 * `exact` tabs (the section's dashboard) match only their own path; the rest also match
 * their sub-pages, so a campaign detail page keeps "Campaigns" highlighted. `also` lists
 * pages that are sections of a tab's page (DISC-NAV-P0-01.5): opened at their own
 * address, they keep that tab highlighted.
 */
export function SectionTabs({ tabs }: { tabs: { href: string; label: string; exact?: boolean; also?: string[] }[] }) {
  const pathname = useAppPathname();
  return (
    <nav aria-label="Section" className="-mx-1 overflow-x-auto">
      <ul className="flex min-w-max gap-1 border-b px-1">
        {tabs.map((tab) => {
          const under = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
          const active = (tab.exact ? pathname === tab.href : under(tab.href)) || (tab.also ?? []).some(under);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-9 items-center border-b-2 px-3 text-sm whitespace-nowrap transition-colors",
                  active
                    ? "border-primary font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
