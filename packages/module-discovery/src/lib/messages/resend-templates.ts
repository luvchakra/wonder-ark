import { Resend } from "resend";
import { platformKey } from "@cofounderai/core/admin/platform-key-store";

export type ResendTemplateSummary = { id: string; name: string };

export type ResendTemplateVariable = {
  key: string;
  type: "string" | "number";
  fallback_value: string | number | null;
};

export type ResendTemplateDetail = {
  id: string;
  name: string;
  subject: string | null;
  variables: ResendTemplateVariable[];
};

async function resendClient(): Promise<Resend> {
  const apiKey = await platformKey("RESEND_API_KEY");
  if (!apiKey) {
    throw new Error("Email sending isn't configured yet -- set RESEND_API_KEY.");
  }
  return new Resend(apiKey);
}

/**
 * Lists the founder's Resend templates for the "generate message from a template"
 * picker (lib/ai/generate-message.ts) -- published only, since a draft template's
 * content/variables can still change before the founder finishes editing it in Resend.
 * Templates live in the platform's single shared Resend account (same as
 * RESEND_API_KEY/RESEND_FROM_EMAIL elsewhere in this module), so every business sees the
 * same set -- there's no per-workspace template ownership to enforce here.
 */
export async function listResendTemplates(): Promise<ResendTemplateSummary[]> {
  const resend = await resendClient();
  const { data, error } = await resend.templates.list();
  if (error) throw new Error(error.message);
  return (data?.data ?? [])
    .filter((t) => t.status === "published")
    .map((t) => ({ id: t.id, name: t.name }));
}

/** Fetches one template's variable definitions server-side (never trusts a client-
 * supplied variable list) right before generating a message from it, so the AI fills in
 * exactly the keys/types Resend will actually substitute at send time. */
export async function getResendTemplate(templateId: string): Promise<ResendTemplateDetail | null> {
  const resend = await resendClient();
  const { data, error } = await resend.templates.get(templateId);
  if (error) {
    if (error.name === "not_found") return null;
    throw new Error(error.message);
  }
  if (!data) return null;

  return {
    id: data.id,
    name: data.name,
    subject: data.subject,
    variables: (data.variables ?? []).map((v) => ({
      key: v.key,
      type: v.type,
      fallback_value: v.fallback_value,
    })),
  };
}
