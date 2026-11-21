"use server";

import { redirect } from "next/navigation";
import { createClient } from "@cofounderai/core/db/server";
import { requireBusinessAdmin } from "@cofounderai/core/rbac/platform-admin";
import { seedDemoData, deleteDemoData } from "@cofounderai/module-inventory/lib/admin/seed";

function adminPath(userId: string, businessId: string) {
  return `/dashboard/admin?userId=${userId}&businessId=${businessId}`;
}

export async function seedDemoDataAction(userId: string, businessId: string) {
  await requireBusinessAdmin();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const result = await seedDemoData(businessId, userId, user.id);
  redirect(`${adminPath(userId, businessId)}&seeded=${result.recordCount}`);
}

export async function deleteDemoDataAction(userId: string, businessId: string) {
  await requireBusinessAdmin();

  const result = await deleteDemoData(businessId);
  redirect(`${adminPath(userId, businessId)}&deletedRecords=${result.deletedRecords}&deletedBatches=${result.deletedBatches}`);
}
