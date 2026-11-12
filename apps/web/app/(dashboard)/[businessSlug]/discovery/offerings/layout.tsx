import type { Metadata } from "next";
import { BRAND_NAME } from "@cofounderai/core/lib/brand";
import { BRAND_TITLE_TEMPLATE } from "@cofounderai/core/brand/identity";
import type { ReactNode } from "react";

/** BRAND-07: "Acquisition | WonderArk" in the browser tab. Absolute, with the template
 * re-declared: a plain title here would stop the root "%s | WonderArk" template from
 * reaching the pages below. Renders nothing of its own. */
export const metadata: Metadata = { title: { absolute: `Acquisition | ${BRAND_NAME}`, template: BRAND_TITLE_TEMPLATE } };

export default function OfferingsLayout({ children }: { children: ReactNode }) {
  return children;
}
