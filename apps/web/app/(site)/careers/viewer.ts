import "server-only";
import { isSuperadmin } from "@cofounderai/core/rbac/platform-admin";

/** Whether the visitor is a platform superadmin, so the Careers pages can show them why
 * careers isn't working. Never throws: a public page treats any doubt as "not an admin". */
export async function viewerIsPlatformAdmin(): Promise<boolean> {
  try {
    return await isSuperadmin();
  } catch {
    return false;
  }
}
