import { redirect } from "next/navigation";
import { requireBusinessAdmin } from "@cofounderai/core/rbac/platform-admin";
import { listAllUsers, listBusinessesForUser } from "@cofounderai/core/admin/queries";
import { listSeedBatches } from "@cofounderai/core/admin/demo-seed-tracking";
import { formatDateTime } from "@cofounderai/core/lib/format";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@cofounderai/core/ui/table";
import { Database, Sparkles } from "lucide-react";
import { DeleteDemoDataButton } from "@cofounderai/module-inventory/components/admin/delete-demo-data-button";
import { AutoSubmitSelect } from "@/components/forms/auto-submit-select";
import { seedDemoDataAction, deleteDemoDataAction } from "./actions";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{
    userId?: string;
    businessId?: string;
    seeded?: string;
    deletedRecords?: string;
    deletedBatches?: string;
  }>;
}) {
  try {
    await requireBusinessAdmin();
  } catch {
    redirect("/dashboard");
  }

  const { userId = "", businessId = "", seeded, deletedRecords, deletedBatches } = await searchParams;

  const users = await listAllUsers();
  const businesses = userId ? await listBusinessesForUser(userId) : [];
  const selectedBusiness = businesses.find((b) => b.id === businessId);
  const batches = businessId ? await listSeedBatches(businessId) : [];

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Demo data</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Seed or clear a realistic demo dataset for any business, on behalf of any user.
        </p>
      </div>

      {seeded ? (
        <p className="rounded-md border bg-muted p-3 text-sm">
          Seeded {seeded} demo record{seeded === "1" ? "" : "s"}.
        </p>
      ) : null}
      {deletedRecords ? (
        <p className="rounded-md border bg-muted p-3 text-sm">
          {deletedRecords === "0"
            ? "No demo data to delete for this business."
            : `Deleted ${deletedRecords} demo record(s) across ${deletedBatches} batch(es).`}
        </p>
      ) : null}

      <div className="flex flex-col gap-4 rounded-md border p-4">
        <div>
          <p className="text-sm font-medium">1. User</p>
          <p className="text-sm text-muted-foreground">Pick the user whose businesses you want to browse.</p>
        </div>
        <form method="GET">
          <AutoSubmitSelect name="userId" defaultValue={userId}>
            <option value="">Select a user</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name ? `${u.full_name} - ${u.email}` : (u.email ?? u.id)}
              </option>
            ))}
          </AutoSubmitSelect>
        </form>
      </div>

      {userId ? (
        <div className="flex flex-col gap-4 rounded-md border p-4">
          <div>
            <p className="text-sm font-medium">2. Business</p>
            <p className="text-sm text-muted-foreground">Every business this user belongs to.</p>
          </div>
          {businesses.length === 0 ? (
            <p className="text-sm text-muted-foreground">This user doesn&apos;t belong to any business yet.</p>
          ) : (
            <form method="GET">
              <input type="hidden" name="userId" value={userId} />
              <AutoSubmitSelect name="businessId" defaultValue={businessId}>
                <option value="">Select a business</option>
                {businesses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.role})
                  </option>
                ))}
              </AutoSubmitSelect>
            </form>
          )}
        </div>
      ) : null}

      {businessId && selectedBusiness ? (
        <div className="flex flex-col gap-5 rounded-md border p-4">
          <div>
            <p className="text-sm font-medium">3. Seed or clear demo data</p>
            <p className="text-sm text-muted-foreground">
              Populates warehouses, categories, suppliers, customers, products (with opening
              stock), a pending purchase order, and a draft sales order for{" "}
              <span className="font-medium">{selectedBusiness.name}</span>. Every row this
              creates is tracked, so it can be removed again without touching any real data.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <form action={seedDemoDataAction.bind(null, userId, businessId)}>
              <SubmitButton pendingText="Seeding...">
                <Sparkles className="size-4" aria-hidden="true" />
                Seed demo data
              </SubmitButton>
            </form>

            <DeleteDemoDataButton
              businessName={selectedBusiness.name}
              batchCount={batches.length}
              action={deleteDemoDataAction.bind(null, userId, businessId)}
              disabled={batches.length === 0}
            />
          </div>

          <div>
            <p className="mb-2 flex items-center gap-2 text-sm font-medium">
              <Database className="size-4" aria-hidden="true" /> Seed history
            </p>
            {batches.length === 0 ? (
              <p className="text-sm text-muted-foreground">No demo data has been seeded for this business yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Seeded</TableHead>
                    <TableHead>For user</TableHead>
                    <TableHead>By admin</TableHead>
                    <TableHead className="text-right">Records</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batches.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell>{formatDateTime(b.created_at)}</TableCell>
                      <TableCell className="text-muted-foreground">{b.targetUserEmail ?? "-"}</TableCell>
                      <TableCell className="text-muted-foreground">{b.requestedByEmail ?? "-"}</TableCell>
                      <TableCell className="text-right">{b.record_count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
