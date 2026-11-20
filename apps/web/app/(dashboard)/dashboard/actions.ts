"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createBusiness, createProduct } from "@cofounderai/module-discovery/lib/tenancy/mutations";
import { normalizeWebsiteUrl } from "@cofounderai/module-discovery/lib/website-onboarding/url";
import { createWebsiteOnboardingRun } from "@cofounderai/module-discovery/lib/website-onboarding/mutations";
import { businessPath } from "@/lib/business-path";
import { createBusinessWithAddress } from "@cofounderai/core/businesses/manage-organizations";
import { orgUrl, type OrgEnvironment } from "@cofounderai/core/lib/org-address";
import { getRequestHost } from "@/lib/org-host";

export type CreateBusinessFromWebsiteState = { error: string } | null;

/**
 * PLATFORM-P1-10.15: where a business just created is opened. With organization addresses
 * on, it is its own address (`<slug>.<base>`): a bare `/<slug>/...` path asked for on the
 * address the person is on would be read as a page of *that* organization and end in a
 * 404. Session cookies belong to one address, so it opens on that address's sign-in, which
 * then returns to `page`. Without addresses, the path form.
 */
async function newBusinessDestination(businessId: string, page: "" | "/business"): Promise<string> {
  const path = await businessPath(businessId);
  const { base, protocol, port } = await getRequestHost();
  const url = orgUrl(path.slice(1), base, protocol, port);
  if (!url) return `${path}${page}`;
  return page ? `${url}/login?next=${encodeURIComponent(page)}` : `${url}/login`;
}

/** PLATFORM-P1-10.14: a new organization at the address prefix and environment chosen in the
 * modal (the prefix follows the name unless edited). A refusal comes back in words. With
 * addresses on, the new organization opens on its own address (sign in there). */
export async function createBusinessAction(
  accountId: string,
  _prevState: CreateBusinessFromWebsiteState,
  formData: FormData,
): Promise<CreateBusinessFromWebsiteState> {
  const slug = String(formData.get("slug") ?? "").trim();
  const input = {
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
    website: String(formData.get("website") ?? ""),
  };
  if (!slug) {
    const business = await createBusiness(accountId, { ...input, industry: String(formData.get("industry") ?? "") });
    revalidatePath("/dashboard");
    redirect(await newBusinessDestination(business.id, ""));
  }
  const result = await createBusinessWithAddress(accountId, {
    ...input,
    slug,
    environment: String(formData.get("environment") ?? "production") as OrgEnvironment,
  });
  if (!result.ok) return { error: result.error };
  revalidatePath("/dashboard");
  const { base, protocol, port } = await getRequestHost();
  const url = orgUrl(result.slug, base, protocol, port);
  redirect(url ? `${url}/login` : `/${result.slug}`);
}

/**
 * "Create from website" tab of CreateBusinessModal -- DISC-OFFER-P0-09.1's own "Website
 * URL Business Onboarding" entry point. Validates/normalizes the URL first (§26's own
 * "Invalid URL" failure state, returned as action state rather than thrown so the modal
 * can show it inline and let the founder fix it, the same useActionState shape
 * runOnboardingAction already established) and creates the business immediately from a
 * placeholder name derived from the domain -- unchanged from before.
 *
 * What changed from the old synchronous version: this action no longer calls the AI
 * itself. Understanding the website used to run inline here (blocking the redirect on
 * one whole research+structure call, with a failure only ever logged to the server
 * console -- invisible to the founder, and not "recoverable" in any real sense). Now it
 * only records a `pending` discovery.website_onboarding_runs row and redirects
 * immediately; the actual research happens on the Business detail page itself (a
 * WebsiteOnboardingPanel driving the new streaming route handler), where its progress is
 * visible, a failure is shown with a real Retry action, and the founder reviews every
 * extracted field -- including business_name/description -- before anything is applied,
 * rather than having it silently overwrite the business's own name/description the way
 * the old inline call did.
 */
export async function createBusinessFromWebsiteAction(
  accountId: string,
  _prevState: CreateBusinessFromWebsiteState,
  formData: FormData,
): Promise<CreateBusinessFromWebsiteState> {
  const rawWebsite = String(formData.get("website") ?? "");
  const normalized = normalizeWebsiteUrl(rawWebsite);
  if (!normalized.ok) {
    return { error: normalized.error };
  }
  const website = normalized.url;

  const placeholderName = new URL(website).hostname.replace(/^www\./, "");
  const business = await createBusiness(accountId, { name: placeholderName, website });
  await createWebsiteOnboardingRun(business.id, website);

  revalidatePath("/dashboard");
  redirect(await newBusinessDestination(business.id, "/business"));
}

export async function createProductAction(businessId: string, formData: FormData) {
  const product = await createProduct(businessId, {
    name: String(formData.get("name") ?? ""),
    website: String(formData.get("website") ?? ""),
  });
  const base = await businessPath(businessId);
  revalidatePath(base);
  redirect(`${base}/discovery/offerings/${product.id}`);
}
