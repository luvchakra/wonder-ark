import { notFound } from "next/navigation";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { Globe, Sparkles, CreditCard, Users } from "lucide-react";
import Link from "next/link";
import { ExportMenu } from "@cofounderai/core/export-ui/export-menu";
import {
  getBusiness,
  getWorkspaceForProduct,
  listProducts,
} from "@cofounderai/module-discovery/lib/tenancy/queries";
import { getProspectCounts } from "@cofounderai/module-discovery/lib/prospects/queries";
import {
  getLatestWebsiteOnboardingRun,
  listWebsiteOnboardingPages,
  listWebsiteOnboardingOfferingCandidates,
} from "@cofounderai/module-discovery/lib/website-onboarding/queries";
import {
  renameBusinessAction,
  updateBusinessDescriptionAction,
  updateBusinessWebsiteAction,
  updateBusinessLogoAction,
  updateBusinessContactAction,
  type BusinessContactField,
  previewProductImportAction,
  importProductsAction,
  deleteProductAction,
  createOfferingAction,
  updateOfferingAction,
  suggestOfferingProfileAction,
  setOfferingStatusAction,
  duplicateOfferingAction,
  retryWebsiteOnboardingAction,
  applyWebsiteOnboardingProfileAction,
  createOfferingsFromWebsiteOnboardingAction,
  updateAiApprovalModeAction,
} from "../actions";
import { hasPermission } from "@cofounderai/core/rbac/require-permission";
import { getAiApprovalMode } from "@cofounderai/module-discovery/lib/ai-approval/queries";
import { AI_APPROVAL_MODE_PERMISSION } from "@cofounderai/module-discovery/lib/ai-approval/types";
import { AiApprovalModeSetting } from "@cofounderai/module-discovery/components/ai-approval/ai-approval-mode-setting";
import { EditableName } from "@cofounderai/module-discovery/components/tenancy/editable-name";
import { EditableText } from "@cofounderai/module-discovery/components/tenancy/editable-text";
import { BusinessLogoField } from "@cofounderai/module-discovery/components/tenancy/business-logo-field";
import { Breadcrumbs } from "@cofounderai/module-discovery/components/tenancy/breadcrumbs";
import { ProductImportWizard } from "@cofounderai/module-discovery/components/tenancy/product-import-wizard";
import { AutoPopulateProductsButton } from "@cofounderai/module-discovery/components/tenancy/auto-populate-products-button";
import { OfferingsTable, type OfferingRow } from "@cofounderai/module-discovery/components/offerings/offerings-table";
import { WebsiteOnboardingPanel } from "@cofounderai/module-discovery/components/website-onboarding/website-onboarding-panel";
import type { Product } from "@cofounderai/module-discovery/lib/tenancy/types";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@cofounderai/core/ui/collapsible";
import { SectionFold } from "@cofounderai/module-discovery/components/ui/section-fold";

/** The website import's state in one line, for its closed section. */
const WEBSITE_RUN_HINT: Record<string, string> = {
  pending: "Reading your website...",
  running: "Reading your website...",
  failed: "Couldn't read your website. Open for the reason.",
  succeeded: "Read your website",
};

const CONTACT_FIELDS: [BusinessContactField, string][] = [
  ["opening_hours", "Add opening hours, e.g. Mon-Sat 10am-7pm"],
  ["address", "Add an address"],
  ["contact_phone", "Add a phone number"],
  ["contact_email", "Add a contact email"],
];

async function loadOfferingRow(product: Product): Promise<OfferingRow> {
  const workspace = await getWorkspaceForProduct(product.id);
  const prospectCounts = workspace ? await getProspectCounts(workspace.id) : null;
  return { offering: product, prospectCount: prospectCounts?.total ?? 0 };
}

/**
 * The business's own editable profile (name/website/description) plus its product
 * list -- this used to live at the bare business URL, which is now the Discovery
 * "Dashboard" (a metrics + actionable-items page, see ../page.tsx). This page is what
 * the sidebar's new "Business" link under Discovery points to.
 */
export default async function BusinessDetailPage({
  params,
}: {
  params: Promise<{ businessSlug: string }>;
}) {
  const { businessSlug } = await params;
  const businessId = await resolveBusinessIdBySlug(businessSlug);
  if (!businessId) notFound();
  const business = await getBusiness(businessId);
  if (!business) notFound();

  const products = await listProducts(business.id);
  const rows = await Promise.all(products.map(loadOfferingRow));
  const websiteOnboardingRun = await getLatestWebsiteOnboardingRun(business.id);
  const [aiApprovalMode, canManageAiApprovals] = await Promise.all([
    getAiApprovalMode(business.id),
    hasPermission(business.id, AI_APPROVAL_MODE_PERMISSION),
  ]);
  const websiteOnboardingPages = websiteOnboardingRun
    ? await listWebsiteOnboardingPages(websiteOnboardingRun.id)
    : [];
  const websiteOnboardingOfferingCandidates = websiteOnboardingRun
    ? await listWebsiteOnboardingOfferingCandidates(websiteOnboardingRun.id)
    : [];

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <Breadcrumbs items={[{ label: "Business" }]} />
          <div className="flex shrink-0 items-center gap-2">
            <ExportMenu exportId="discovery.business" businessSlug={businessSlug} kind="report" />
            <Link
              href={`/${businessSlug}/usage`}
              className="flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
            >
              <Sparkles className="size-3.5" aria-hidden="true" />
              AI usage
            </Link>
            <Link
              href={`/${businessSlug}/billing`}
              className="flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
            >
              <CreditCard className="size-3.5" aria-hidden="true" />
              Billing
            </Link>
            <Link
              href={`/${businessSlug}/admin/users`}
              className="flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
            >
              <Users className="size-3.5" aria-hidden="true" />
              Users &amp; access
            </Link>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <EditableName
            name={business.name}
            action={renameBusinessAction.bind(null, business.id)}
            headingClassName="text-xl font-semibold"
          />
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Globe className="size-3.5 shrink-0" aria-hidden="true" />
            <EditableText
              value={business.website}
              action={updateBusinessWebsiteAction.bind(null, business.id)}
              placeholder="Add this business's website"
              textClassName="text-sm text-muted-foreground"
            />
          </div>
        </div>
      </div>

      {/* PLATFORM-NAV-P0-03.3 (owner, 2026-11-29): the offerings are what this page is
          for, so they come first, with the ways to add them beside the list. The
          business's own details, edited rarely, are one closed section below. */}
      <section id="offerings" className="flex scroll-mt-4 flex-col gap-3">
        <OfferingsTable
          businessId={business.id}
          rows={rows}
          createAction={createOfferingAction.bind(null, business.id)}
          updateAction={updateOfferingAction.bind(null, business.id)}
          suggestAction={suggestOfferingProfileAction.bind(null, business.id)}
          setStatusAction={setOfferingStatusAction.bind(null, business.id)}
          duplicateAction={duplicateOfferingAction.bind(null, business.id)}
          deleteAction={deleteProductAction.bind(null, business.id)}
        />
        <div className="flex flex-wrap items-center gap-2">
          <AutoPopulateProductsButton
            businessSlug={businessSlug}
            disabled={!business.website}
            disabledReason="Add a website above first."
            importAction={importProductsAction.bind(null, business.id)}
            quiet={rows.length > 0}
          />
          <ProductImportWizard
            previewAction={previewProductImportAction.bind(null, business.id)}
            importAction={importProductsAction.bind(null, business.id)}
          />
        </div>
      </section>

      <div className="flex flex-col gap-3">
        {websiteOnboardingRun ? (
          <SectionFold
            id="website"
            title="Website import"
            hint={WEBSITE_RUN_HINT[websiteOnboardingRun.status] ?? null}
            // Open while it is running or has results not yet used; a failed or finished one is one line.
            open={websiteOnboardingRun.status === "pending" || websiteOnboardingRun.status === "running" || (websiteOnboardingRun.status === "succeeded" && !websiteOnboardingRun.activated_at)}
          >
            <WebsiteOnboardingPanel
              businessSlug={businessSlug}
              initialRun={websiteOnboardingRun}
              initialPages={websiteOnboardingPages}
              initialOfferings={websiteOnboardingOfferingCandidates}
              retryAction={retryWebsiteOnboardingAction.bind(null, business.id)}
              applyAction={applyWebsiteOnboardingProfileAction.bind(null, business.id)}
              activateOfferingsAction={createOfferingsFromWebsiteOnboardingAction.bind(null, business.id)}
            />
          </SectionFold>
        ) : null}

        <SectionFold id="details" title="Business details" hint="Description, contact details, logo and AI approvals">
          <EditableText
            value={business.description}
            action={updateBusinessDescriptionAction.bind(null, business.id)}
            placeholder="Add a description for this business"
            multiline
            textClassName="text-sm text-muted-foreground"
          />
          {/* PLATFORM-P1-12.2: what AI reply drafts may quote; folded, like any rarely edited setting. */}
          <Collapsible>
            <CollapsibleTrigger className="text-sm text-muted-foreground hover:text-foreground">Contact details for customer replies</CollapsibleTrigger>
            <CollapsibleContent className="flex flex-col gap-1.5 pt-2">
              {CONTACT_FIELDS.map(([field, placeholder]) => (
                <EditableText
                  key={field}
                  value={business[field]}
                  action={updateBusinessContactAction.bind(null, business.id, field)}
                  placeholder={placeholder}
                  multiline={field === "address" || field === "opening_hours"}
                  textClassName="text-sm text-muted-foreground"
                />
              ))}
            </CollapsibleContent>
          </Collapsible>
          {/* DISC-AI-APPROVAL-01: whether Discovery's AI flows may approve their own results. */}
          <AiApprovalModeSetting
            mode={aiApprovalMode}
            canManage={canManageAiApprovals}
            action={updateAiApprovalModeAction.bind(null, business.id)}
          />
          <BusinessLogoField
            logoUrl={business.logo_url}
            businessName={business.name}
            action={updateBusinessLogoAction.bind(null, business.id)}
          />
        </SectionFold>
      </div>
    </main>
  );
}
