"use server";

import { revalidatePath } from "next/cache";
import {
  importPlatformKeysFromDeployment,
  removePlatformKey,
  setPlatformKey,
  type ImportOutcome,
  type RemovePlatformKeyInput,
  type SetPlatformKeyInput,
} from "@cofounderai/core/admin/platform-keys";

/**
 * PLATFORM-P1-14.1/14.2. Thin `revalidatePath` wrappers over the audited mutations in
 * `platform-keys.ts`. No action here returns a value, plain or encrypted, to the client.
 */

type Result = { ok: true } | { ok: false; error: string };

function revalidate() {
  revalidatePath("/platform/keys");
  revalidatePath("/platform/ai-providers");
  revalidatePath("/platform/health");
}

export async function setPlatformKeyAction(input: SetPlatformKeyInput): Promise<Result> {
  const result = await setPlatformKey(input);
  if (result.ok) revalidate();
  return result;
}

export async function removePlatformKeyAction(input: RemovePlatformKeyInput): Promise<Result> {
  const result = await removePlatformKey(input);
  if (result.ok) revalidate();
  return result;
}

export async function importFromDeploymentAction(input: { reason: string }): Promise<{ ok: true; outcome: ImportOutcome } | { ok: false; error: string }> {
  const result = await importPlatformKeysFromDeployment(input);
  if (result.ok) revalidate();
  return result;
}
