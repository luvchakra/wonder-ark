import { z } from "zod";
import { createClient } from "../db/server";
import { requireSuperadmin } from "../rbac/platform-admin";
import { encryptApiKey, fingerprintApiKey } from "../crypto/api-key";
import { listAiProviders, setAiProviderKey, updateAiProviderConfig } from "./platform-ai-providers";
import {
  DEPLOYMENT_ONLY_VARIABLES,
  PLATFORM_AI_KEY_ENV,
  PLATFORM_KEYS,
  platformKeyHint,
  platformKeyProblem,
  platformKeySpec,
  type PlatformKeySpec,
} from "./platform-key-registry";
import { resetPlatformKeyCache } from "./platform-key-store";

/**
 * PLATFORM-P1-14.1/14.2 ("Platform Keys" / "Import from deployment"): what the Platform
 * Admin portal's Keys page reads and does.
 *
 * Same authorization shape as `platform-ai-providers.ts`: the request-scoped,
 * cookie-authenticated client, every write through a SECURITY DEFINER function that checks
 * `platform.is_superadmin()` itself and records a reason, with `requireSuperadmin()` here
 * as defence in depth.
 *
 * A plaintext value exists in this process only for as long as it takes to check and
 * encrypt it. It is never logged, never returned and never sent to Postgres: the function
 * receives the ciphertext, a display hint and a non-reversible fingerprint. There is no
 * function here, or anywhere, that returns a saved value to a caller.
 *
 * "Import from deployment" is how values move without anyone handling them: the server
 * reads its own environment variables and saves each one that is set and not yet on the
 * platform. The values never leave the server. It reports names only.
 */

export type PlatformKeyState = "platform" | "deployment" | "unset";

export type PlatformKeyStatus = PlatformKeySpec & {
  /** Where the value in use comes from. */
  state: PlatformKeyState;
  /** What to show: a masked hint or, for a value that is not secret, the value. */
  shown: string | null;
  /** Saved on the platform by a person, or copied from the deployment. */
  origin: "admin" | "deployment" | null;
  updatedAt: string | null;
  /** The deployment still sets a variable of this name. */
  inDeployment: boolean;
  /** Saved on the platform and identical to the deployment's variable: that variable can go. */
  deploymentRedundant: boolean;
};

export type PlatformKeysOverview = {
  keys: PlatformKeyStatus[];
  ai: {
    /** An enabled provider has a key on the AI Providers page. */
    onPlatform: boolean;
    /** The deployment sets PLATFORM_AI_API_KEY. */
    inDeployment: boolean;
  };
  deploymentOnly: { name: string; reason: string; set: boolean }[];
  /** How many values "Import from deployment" would copy now. */
  importable: number;
};

type StatusRow = { name: string; value_hint: string; value_fingerprint: string; origin: "admin" | "deployment"; updated_at: string };

async function readStatusRows(): Promise<Map<string, StatusRow>> {
  const supabase = await createClient({ schema: "platform" });
  const { data, error } = await supabase.rpc("platform_key_status");
  if (error) throw error;
  return new Map(((data ?? []) as StatusRow[]).map((row) => [row.name, row]));
}

/** Every key with where it is set, masked. Never a secret value. */
export async function getPlatformKeysOverview(env: Record<string, string | undefined> = process.env): Promise<PlatformKeysOverview> {
  await requireSuperadmin();
  const [rows, providers] = await Promise.all([readStatusRows(), listAiProviders()]);

  const keys = PLATFORM_KEYS.map((spec): PlatformKeyStatus => {
    const row = rows.get(spec.name);
    const deployed = env[spec.name]?.trim() || "";
    if (row) {
      return {
        ...spec,
        state: "platform",
        shown: row.value_hint,
        origin: row.origin,
        updatedAt: row.updated_at,
        inDeployment: Boolean(deployed),
        deploymentRedundant: Boolean(deployed) && fingerprintApiKey(deployed) === row.value_fingerprint,
      };
    }
    return {
      ...spec,
      state: deployed ? "deployment" : "unset",
      // A deployment secret is never shown, not even masked: it was not entered here.
      shown: deployed && spec.plain ? deployed : null,
      origin: null,
      updatedAt: null,
      inDeployment: Boolean(deployed),
      deploymentRedundant: false,
    };
  });

  const aiOnPlatform = providers.some((provider) => provider.enabled && provider.configured);
  const aiInDeployment = Boolean(env[PLATFORM_AI_KEY_ENV]?.trim());
  return {
    keys,
    ai: { onPlatform: aiOnPlatform, inDeployment: aiInDeployment },
    deploymentOnly: DEPLOYMENT_ONLY_VARIABLES.map((variable) => ({ ...variable, set: Boolean(env[variable.name]?.trim()) })),
    importable: keys.filter((key) => key.state === "deployment").length + (aiInDeployment && !aiOnPlatform ? 1 : 0),
  };
}

const reasonSchema = z.string().trim().min(1, "A reason is required.").max(500, "Keep the reason under 500 characters.");

export const setPlatformKeySchema = z.object({
  name: z.string(),
  value: z.string().trim(),
  reason: reasonSchema,
});
export type SetPlatformKeyInput = z.input<typeof setPlatformKeySchema>;

type Result = { ok: true } | { ok: false; error: string };

async function save(spec: PlatformKeySpec, value: string, origin: "admin" | "deployment", reason: string): Promise<Result> {
  const problem = platformKeyProblem(spec, value);
  if (problem) return { ok: false, error: problem };
  const supabase = await createClient({ schema: "platform" });
  const { error } = await supabase.rpc("set_platform_key", {
    p_name: spec.name,
    p_encrypted_value: encryptApiKey(value),
    p_value_hint: platformKeyHint(spec, value),
    p_value_fingerprint: fingerprintApiKey(value),
    p_origin: origin,
    p_reason: reason,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Sets or replaces one key. The new value is in use everywhere within a minute. */
export async function setPlatformKey(input: SetPlatformKeyInput): Promise<Result> {
  await requireSuperadmin();
  const parsed = setPlatformKeySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const spec = platformKeySpec(parsed.data.name);
  if (!spec) return { ok: false, error: "Unknown key." };

  const result = await save(spec, parsed.data.value, "admin", parsed.data.reason);
  if (result.ok) resetPlatformKeyCache();
  return result;
}

export const removePlatformKeySchema = z.object({ name: z.string(), reason: reasonSchema });
export type RemovePlatformKeyInput = z.input<typeof removePlatformKeySchema>;

/** Removes one saved key. The deployment's variable of the same name, if any, is used again. */
export async function removePlatformKey(input: RemovePlatformKeyInput): Promise<Result> {
  await requireSuperadmin();
  const parsed = removePlatformKeySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  if (!platformKeySpec(parsed.data.name)) return { ok: false, error: "Unknown key." };

  const supabase = await createClient({ schema: "platform" });
  const { error } = await supabase.rpc("remove_platform_key", { p_name: parsed.data.name, p_reason: parsed.data.reason });
  if (error) return { ok: false, error: error.message };
  resetPlatformKeyCache();
  return { ok: true };
}

export type ImportOutcome = {
  /** Names copied from the deployment onto the platform. */
  imported: string[];
  /** Names that could not be copied, each with why. Never a value. */
  failed: { name: string; error: string }[];
};

/**
 * Copies every value the deployment sets, and the platform does not have yet, onto the
 * platform. A value already saved on the platform is left as it is. The AI key goes to the
 * AI Providers page's own store, which tests it against the provider first, and its
 * provider is switched on so the key is used.
 *
 * Safe to press twice: the second run finds nothing left to copy.
 */
export async function importPlatformKeysFromDeployment(
  input: { reason: string },
  env: Record<string, string | undefined> = process.env,
): Promise<{ ok: true; outcome: ImportOutcome } | { ok: false; error: string }> {
  await requireSuperadmin();
  const reason = reasonSchema.safeParse(input.reason);
  if (!reason.success) return { ok: false, error: reason.error.issues[0]?.message ?? "A reason is required." };
  const why = `Imported from the deployment: ${reason.data}`.slice(0, 500);

  const outcome: ImportOutcome = { imported: [], failed: [] };
  const saved = await readStatusRows();

  for (const spec of PLATFORM_KEYS) {
    const deployed = env[spec.name]?.trim();
    if (!deployed || saved.has(spec.name)) continue;
    const result = await save(spec, deployed, "deployment", why);
    if (result.ok) outcome.imported.push(spec.name);
    else outcome.failed.push({ name: spec.name, error: result.error });
  }

  const aiKey = env[PLATFORM_AI_KEY_ENV]?.trim();
  if (aiKey) {
    const providers = await listAiProviders();
    const anthropic = providers.find((provider) => provider.provider === "anthropic");
    // The deployment's AI key has always been an Anthropic key (ai/platform-credential.ts).
    if (anthropic && !providers.some((provider) => provider.enabled && provider.configured)) {
      const keyResult = anthropic.configured ? ({ ok: true } as const) : await setAiProviderKey({ provider: "anthropic", apiKey: aiKey, reason: why });
      const enabled =
        keyResult.ok && !anthropic.enabled
          ? await updateAiProviderConfig({
              provider: "anthropic",
              enabled: true,
              models: anthropic.models.join(", "),
              defaultModel: anthropic.defaultModel ?? "",
              fallbackModel: anthropic.fallbackModel ?? "",
              rateLimits: JSON.stringify(anthropic.rateLimits ?? {}),
              costControls: JSON.stringify(anthropic.costControls ?? {}),
              reason: why,
            })
          : keyResult;
      if (keyResult.ok && enabled.ok) outcome.imported.push(PLATFORM_AI_KEY_ENV);
      else outcome.failed.push({ name: PLATFORM_AI_KEY_ENV, error: !keyResult.ok ? keyResult.error : !enabled.ok ? enabled.error : "Could not be saved." });
    }
  }

  if (outcome.imported.length > 0) resetPlatformKeyCache();
  return { ok: true, outcome };
}
