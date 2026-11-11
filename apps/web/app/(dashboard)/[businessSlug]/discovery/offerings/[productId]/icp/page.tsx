import { notFound } from "next/navigation";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { ExportMenu } from "@cofounderai/core/export-ui/export-menu";
import {
  getProduct,
  getWorkspaceForProduct,
} from "@cofounderai/module-discovery/lib/tenancy/queries";
import { getIcpProfile, listCloneableIcpSourcesForBusiness, listIcpProfileVersions } from "@cofounderai/module-discovery/lib/icp/queries";
import { IcpVersionHistory } from "@cofounderai/module-discovery/components/icp/icp-version-history";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { AiActionForm } from "@cofounderai/module-discovery/components/ai/ai-action-form";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { IcpField } from "@cofounderai/module-discovery/components/icp/icp-field";
import { CloneIcpButton } from "@cofounderai/module-discovery/components/icp/clone-icp-button";
import { AutoPopulateStepBanner } from "@cofounderai/module-discovery/components/tenancy/auto-populate-step-banner";
import { PersonaSection } from "@cofounderai/module-discovery/components/personas/persona-section";
import { listBuyerPersonas } from "@cofounderai/module-discovery/lib/personas/queries";
import { SaveAndRunDownstreamButton } from "@cofounderai/module-discovery/components/pipeline/save-and-run-downstream-button";
import { downstreamGroupLabels } from "@cofounderai/module-discovery/lib/pipeline/display-groups";
import {
  generateIcpAction,
  updateIcpAction,
  updateIcpAndRunDownstreamAction,
  approveIcpAction,
  cloneIcpAction,
  autoPopulateIcpAction,
  createPersonaAction,
  updatePersonaAction,
  deletePersonaAction,
} from "./actions";

function toLines(items: string[]) {
  return items.join("\n");
}

export default async function IcpPage({
  params,
}: {
  params: Promise<{ businessSlug: string; productId: string }>;
}) {
  const { businessSlug, productId } = await params;
  const businessId = await resolveBusinessIdBySlug(businessSlug);
  if (!businessId) notFound();
  const product = await getProduct(productId);
  if (!product || product.business_id !== businessId) notFound();

  const workspace = await getWorkspaceForProduct(product.id);
  if (!workspace) notFound();

  const prospectsPath = `/${businessSlug}/discovery/offerings/${productId}/prospects`;
  const autoPopulateBanner = (
    <AutoPopulateStepBanner
      step="icp"
      action={autoPopulateIcpAction.bind(null, businessId, productId)}
      nextPath={`${prospectsPath}?autopopulate=1`}
      runningLabel="Populating your ICP from the offering profile..."
    />
  );

  /* DISC-OFFER-P0-02.3: buyer personas belong to the offering's workspace, independent
   * of whether a product profile or ICP exists yet -- shown at the bottom of every
   * branch below rather than gated behind them. */
  const personas = await listBuyerPersonas(workspace.id);
  const personaSection = (
    <PersonaSection
      personas={personas}
      createAction={createPersonaAction.bind(null, businessId, productId)}
      updateAction={updatePersonaAction.bind(null, businessId, productId)}
      deleteAction={deletePersonaAction.bind(null, businessId, productId)}
    />
  );

  if (!product.product_profile) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          {autoPopulateBanner}
          <p className="text-sm text-muted-foreground">
            Generate an offering profile on Overview before defining your ideal customer.
          </p>
        </div>
        {personaSection}
      </div>
    );
  }

  const [icp, cloneSources] = await Promise.all([
    getIcpProfile(workspace.id),
    listCloneableIcpSourcesForBusiness(businessId, productId),
  ]);

  if (!icp) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          {autoPopulateBanner}
          <p className="text-sm text-muted-foreground">
            No ICP yet. Generate one from the approved offering profile{cloneSources.length > 0 ? ", or clone one from another offering." : "."}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <AiActionForm
              action={generateIcpAction.bind(null, businessId, productId)}
              buttonLabel="Generate ICP"
              pendingText="Generating..."
            />
            <CloneIcpButton sources={cloneSources} hasExistingIcp={false} cloneAction={cloneIcpAction.bind(null, businessId, productId)} />
          </div>
        </div>
        {personaSection}
      </div>
    );
  }

  // DISC-OFFER-P0-14.2: "Current version is clearly identified" -- fetched only once the
  // ICP itself exists (there's nothing to version before then), keyed by `icp.id` rather
  // than workspace so a founder can still see the trail even across a future clone.
  const versions = await listIcpProfileVersions(icp.id);

  return (
    <div className="flex flex-col gap-6">
      {autoPopulateBanner}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={
              icp.status === "approved"
                ? "rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                : "rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
            }
          >
            {icp.status === "approved" ? "Approved" : "Draft"}
          </span>
          {icp.version > 0 ? (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">v{icp.version}</span>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <ExportMenu exportId="discovery.icp" businessSlug={businessSlug} params={{ productId }} kind="report" />
          <AiActionForm
            action={generateIcpAction.bind(null, businessId, productId)}
            buttonLabel="Regenerate"
            pendingText="Regenerating..."
            buttonProps={{ variant: "outline" }}
          >
            <input type="hidden" name="force" value="true" />
          </AiActionForm>
          <CloneIcpButton sources={cloneSources} hasExistingIcp cloneAction={cloneIcpAction.bind(null, businessId, productId)} />
          {icp.status === "draft" ? (
            <form action={approveIcpAction.bind(null, businessId, productId, icp.id)}>
              <SubmitButton size="sm" pendingText="Approving...">
                Approve
              </SubmitButton>
            </form>
          ) : null}
        </div>
      </div>

      {icp.confidence !== null || icp.evidence.length > 0 ? (
        <div className="flex flex-col gap-2 rounded-md border p-3 text-sm">
          {icp.confidence !== null ? (
            <p>
              <span className="font-medium">Confidence: </span>
              <span className="text-muted-foreground">{Math.round(icp.confidence * 100)}%</span>
            </p>
          ) : null}
          {icp.evidence.length > 0 ? (
            <div>
              <p className="font-medium">Evidence</p>
              <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                {icp.evidence.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      <form
        id="icp-edit-form"
        action={updateIcpAction.bind(null, businessId, productId, icp.id)}
        className="flex flex-col gap-4"
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" defaultValue={icp.name} required />
        </div>
        <IcpField label="Description" name="description" defaultValue={icp.description ?? ""} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <IcpField label="Industries" name="industries" defaultValue={toLines(icp.industries)} />
          <IcpField
            label="Company sizes"
            name="companySizes"
            defaultValue={toLines(icp.company_sizes)}
          />
          <IcpField
            label="Geographies"
            name="geographies"
            defaultValue={toLines(icp.geographies)}
          />
          <IcpField label="Roles" name="roles" defaultValue={toLines(icp.roles)} />
          <IcpField
            label="Pain points"
            name="painPoints"
            defaultValue={toLines(icp.pain_points)}
          />
          <IcpField
            label="Buying signals"
            name="buyingSignals"
            defaultValue={toLines(icp.buying_signals)}
          />
          <IcpField
            label="Exclusions"
            name="exclusions"
            defaultValue={toLines(icp.exclusions)}
          />
          <IcpField label="Revenue" name="revenue" defaultValue={toLines(icp.revenue)} />
          <IcpField
            label="Business model"
            name="businessModel"
            defaultValue={toLines(icp.business_model)}
          />
          <IcpField label="Technology" name="technology" defaultValue={toLines(icp.technology)} />
          <IcpField
            label="Growth stage"
            name="growthStage"
            defaultValue={toLines(icp.growth_stage)}
          />
          <IcpField
            label="Existing tools"
            name="existingTools"
            defaultValue={toLines(icp.existing_tools)}
          />
        </div>
        <p className="text-xs text-muted-foreground">One item per line.</p>
        <div className="flex flex-wrap gap-2">
          <SubmitButton size="sm" pendingText="Saving...">
            Save changes
          </SubmitButton>
          <SaveAndRunDownstreamButton
            formId="icp-edit-form"
            runDownstreamAction={updateIcpAndRunDownstreamAction.bind(null, businessId, productId, icp.id)}
            saveOnlyAction={updateIcpAction.bind(null, businessId, productId, icp.id)}
            affectedLabels={downstreamGroupLabels("icp")}
          />
        </div>
      </form>

      <div className="flex flex-col gap-3">
        <h3 className="font-medium">Version history</h3>
        <IcpVersionHistory versions={versions} />
      </div>

      {personaSection}
    </div>
  );
}
