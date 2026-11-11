import { notFound } from "next/navigation";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import {
  getProduct,
  getWorkspaceForProduct,
} from "@cofounderai/module-discovery/lib/tenancy/queries";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { Label } from "@cofounderai/core/ui/label";
import { Textarea } from "@cofounderai/core/ui/textarea";
import { importProspectsAction } from "./actions";

const TEMPLATE_CSV =
  "company_name,website,industry,company_size,location,description\n" +
  "Acme Inc,https://acme.com,Banking,50-500,Bengaluru,Existing customer's competitor\n";
const TEMPLATE_HREF = `data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE_CSV)}`;

export default async function ImportProspectsPage({
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

  return (
    <div className="flex flex-col gap-4">
      {/* DISC-NAV-P0-01.1: Import is a page of the Find tab, so the tab bar above leads
          everywhere; the "Back to prospects" link this page carried is gone. */}
      <h2 className="font-medium">Import prospects</h2>
      <p className="text-sm text-muted-foreground">
        Upload a CSV, Excel (.xlsx), or PDF file. Required column:{" "}
        <code className="rounded bg-muted px-1">company_name</code>. Optional:{" "}
        <code className="rounded bg-muted px-1">
          website, industry, company_size, location, description
        </code>
        . A file whose columns (or a PDF with no columns at all) don&apos;t match this exactly
        is automatically restructured by AI before importing --{" "}
        <a href={TEMPLATE_HREF} download="prospects-import-template.csv" className="underline">
          download the CSV template
        </a>{" "}
        if you&apos;d rather skip that step.
      </p>
      <form
        action={importProspectsAction.bind(null, businessId, productId, workspace.id)}
        className="flex flex-col gap-3"
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="file">File</Label>
          <input
            type="file"
            id="file"
            name="file"
            accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.pdf,application/pdf"
            className="text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground hover:file:bg-accent"
          />
        </div>

        <p className="text-xs text-muted-foreground">Or paste CSV text directly instead:</p>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="csv">CSV</Label>
          <Textarea
            id="csv"
            name="csv"
            rows={4}
            placeholder={"company_name,website,industry\nAcme Inc,https://acme.com,Banking"}
          />
        </div>
        <SubmitButton size="sm" className="self-start" pendingText="Importing...">
          Import
        </SubmitButton>
      </form>
    </div>
  );
}
