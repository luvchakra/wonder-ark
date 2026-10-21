"use server";

import { revalidatePath } from "next/cache";
import { clearCareersKey, saveCareersKey } from "@cofounderai/core/careers/connection";
import { testWonderJobsConnection, type ConnectionTest } from "@cofounderai/core/careers/wonderjobs";
import { requireSuperadmin } from "@cofounderai/core/rbac/platform-admin";

/**
 * PLATFORM-P1-13.2 -- the career-site key's console actions. Each checks SUPERADMIN itself
 * (the layout's check is not an authorization boundary for a server action), and none
 * returns the key: a save answers with the mask only.
 */

export async function saveCareersKeyAction(input: { key: string }): Promise<{ ok: true; masked: string } | { ok: false; error: string }> {
  const result = await saveCareersKey(input);
  if (result.ok) revalidatePath("/platform/careers");
  return result;
}

export async function clearCareersKeyAction(): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await clearCareersKey();
  if (result.ok) revalidatePath("/platform/careers");
  return result;
}

export async function testCareersConnectionAction(): Promise<ConnectionTest> {
  await requireSuperadmin();
  return testWonderJobsConnection();
}
