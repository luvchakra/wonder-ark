import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { createAdminClient } from "../db/admin";
import { createClient } from "../db/server";
import { renderEmailHtml, renderEmailText } from "../email/render";
import { BRAND_NAME } from "../lib/brand";
import { SITE_URL } from "../site";
import { platformKey } from "../admin/platform-key-store";

/**
 * RBAC-07..RBAC-17, RBAC-25..RBAC-30 -- people and roles in a business.
 *
 * Reads go through the signed-in user's session (RLS decides what they see). Every write
 * is one call to a core.* SECURITY DEFINER function that re-checks the caller's
 * permission in that business, enforces the privilege ceiling, and audits
 * (supabase/migrations/20260926150100_core_rbac_members.sql). This file only validates
 * shape and turns database refusals into readable messages.
 */

export type MemberStatus = "invited" | "active" | "suspended" | "removed";

export type BusinessMember = {
  id: string;
  userId: string;
  name: string | null;
  email: string | null;
  roleId: string;
  roleName: string;
  roleKey: string;
  roleType: "system" | "custom";
  status: MemberStatus;
  joinedAt: string | null;
  createdAt: string;
  isMe: boolean;
};

export type BusinessRoleSummary = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  roleType: "system" | "custom";
  templateKey: string | null;
  archived: boolean;
  permissionKeys: string[];
  memberCount: number;
};

export type PermissionEntry = { key: string; module: string; description: string | null };

export type Invitation = {
  id: string;
  email: string;
  invitedName: string | null;
  roleId: string;
  roleName: string;
  status: "pending" | "accepted" | "expired" | "revoked";
  expiresAt: string;
  createdAt: string;
};

export type RoleTemplate = { key: string; name: string; description: string; permissionKeys: string[] };

const core = () => createClient({ schema: "core" });

export async function listBusinessMembers(businessId: string): Promise<BusinessMember[]> {
  const supabase = await core();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("business_members")
    .select("id, user_id, role_id, status, joined_at, created_at")
    .eq("business_id", businessId)
    .neq("status", "removed")
    .order("created_at", { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as { id: string; user_id: string; role_id: string; status: MemberStatus; joined_at: string | null; created_at: string }[];
  if (rows.length === 0) return [];
  const [{ data: roles, error: rolesError }, { data: profiles, error: profilesError }] = await Promise.all([
    supabase.from("roles").select("id, key, name, role_type").in("id", Array.from(new Set(rows.map((r) => r.role_id)))),
    supabase.from("user_profiles").select("id, full_name, email").in("id", rows.map((r) => r.user_id)),
  ]);
  if (rolesError) throw rolesError;
  if (profilesError) throw profilesError;
  const roleById = new Map(((roles ?? []) as { id: string; key: string; name: string; role_type: "system" | "custom" }[]).map((r) => [r.id, r]));
  const profileById = new Map(((profiles ?? []) as { id: string; full_name: string | null; email: string | null }[]).map((p) => [p.id, p]));
  return rows.map((r) => {
    const role = roleById.get(r.role_id);
    const profile = profileById.get(r.user_id);
    return {
      id: r.id,
      userId: r.user_id,
      name: profile?.full_name ?? null,
      email: profile?.email ?? null,
      roleId: r.role_id,
      roleName: role?.name ?? "Unknown role",
      roleKey: role?.key ?? "",
      roleType: role?.role_type ?? "system",
      status: r.status,
      joinedAt: r.joined_at,
      createdAt: r.created_at,
      isMe: r.user_id === user?.id,
    };
  });
}

export async function listBusinessRoles(businessId: string, { includeArchived = false } = {}): Promise<BusinessRoleSummary[]> {
  const supabase = await core();
  let query = supabase
    .from("roles")
    .select("id, key, name, description, role_type, template_key, archived_at, business_id, created_at")
    .or(`business_id.is.null,business_id.eq.${businessId}`)
    .order("created_at", { ascending: true });
  if (!includeArchived) query = query.is("archived_at", null);
  const { data, error } = await query;
  if (error) throw error;
  const roles = (data ?? []) as {
    id: string;
    key: string;
    name: string;
    description: string | null;
    role_type: "system" | "custom";
    template_key: string | null;
    archived_at: string | null;
  }[];
  const ids = roles.map((r) => r.id);
  const [{ data: grants, error: grantsError }, { data: members, error: membersError }] = await Promise.all([
    supabase.from("role_permission_grants").select("role_id, permission_key").in("role_id", ids),
    supabase.from("business_members").select("role_id, status").eq("business_id", businessId).in("status", ["active", "suspended", "invited"]),
  ]);
  if (grantsError) throw grantsError;
  if (membersError) throw membersError;
  const keysByRole = new Map<string, string[]>();
  for (const g of (grants ?? []) as { role_id: string; permission_key: string }[]) {
    keysByRole.set(g.role_id, [...(keysByRole.get(g.role_id) ?? []), g.permission_key]);
  }
  const countByRole = new Map<string, number>();
  for (const m of (members ?? []) as { role_id: string }[]) countByRole.set(m.role_id, (countByRole.get(m.role_id) ?? 0) + 1);
  const systemOrder = ["owner", "admin", "inventory_manager", "procurement_manager", "sales_manager", "accountant", "warehouse_operator", "viewer"];
  return roles
    .map((r) => ({
      id: r.id,
      key: r.key,
      name: r.name,
      description: r.description,
      roleType: r.role_type,
      templateKey: r.template_key,
      archived: r.archived_at !== null,
      permissionKeys: (keysByRole.get(r.id) ?? []).sort(),
      memberCount: countByRole.get(r.id) ?? 0,
    }))
    .sort((a, b) =>
      a.roleType === b.roleType
        ? a.roleType === "system"
          ? systemOrder.indexOf(a.key) - systemOrder.indexOf(b.key)
          : a.name.localeCompare(b.name)
        : a.roleType === "system"
          ? -1
          : 1,
    );
}

export async function listPermissionCatalogue(): Promise<PermissionEntry[]> {
  const supabase = await core();
  const { data, error } = await supabase.from("permissions").select("key, module, description").order("key");
  if (error) throw error;
  return (data ?? []) as PermissionEntry[];
}

export async function listRoleTemplates(): Promise<RoleTemplate[]> {
  const supabase = await core();
  const { data, error } = await supabase.from("role_templates").select("key, name, description, permission_keys").order("display_order");
  if (error) throw error;
  return ((data ?? []) as { key: string; name: string; description: string; permission_keys: string[] }[]).map((t) => ({
    key: t.key,
    name: t.name,
    description: t.description,
    permissionKeys: t.permission_keys,
  }));
}

export async function listInvitations(businessId: string): Promise<Invitation[]> {
  const supabase = await core();
  const { data, error } = await supabase
    .from("business_invitations")
    .select("id, email, invited_name, role_id, status, expires_at, created_at")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  const rows = (data ?? []) as { id: string; email: string; invited_name: string | null; role_id: string; status: Invitation["status"]; expires_at: string; created_at: string }[];
  const roleIds = Array.from(new Set(rows.map((r) => r.role_id)));
  const { data: roles } = roleIds.length ? await supabase.from("roles").select("id, name").in("id", roleIds) : { data: [] };
  const nameById = new Map(((roles ?? []) as { id: string; name: string }[]).map((r) => [r.id, r.name]));
  const now = Date.now();
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    invitedName: r.invited_name,
    roleId: r.role_id,
    roleName: nameById.get(r.role_id) ?? "Role",
    status: r.status === "pending" && new Date(r.expires_at).getTime() <= now ? "expired" : r.status,
    expiresAt: r.expires_at,
    createdAt: r.created_at,
  }));
}

// ---------------------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------------------

export type Result<T = undefined> = { ok: true; value?: T } | { ok: false; error: string };

/** Database refusals come back with the function's own sentence; anything else is generic. */
function fromDbError(error: { code?: string; message?: string }): { ok: false; error: string } {
  if (error.code && ["42501", "22023", "23505", "23503", "P0002", "54000", "23514"].includes(error.code) && error.message) {
    return { ok: false, error: error.message };
  }
  return { ok: false, error: "Something went wrong. Please try again." };
}

export const hashInvitationToken = (token: string) => createHash("sha256").update(token).digest("hex");

const INVITATION_DAYS = 7;

export const inviteSchema = z.object({
  businessId: z.string().uuid(),
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  name: z
    .string()
    .trim()
    .max(120)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional(),
  roleId: z.string().uuid("Choose a role."),
  message: z
    .string()
    .trim()
    .max(500)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional(),
});

/**
 * RBAC-07 / RBAC-27 -- creates the invitation and emails the link. The token is 32 random
 * bytes, sent once in the email and stored only as its SHA-256 (§18); nothing else ever
 * sees it (not the audit trail, not logs).
 */
export async function inviteMember(input: z.input<typeof inviteSchema>): Promise<Result<{ emailed: boolean }>> {
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid invitation." };
  const d = parsed.data;
  const token = randomBytes(32).toString("base64url");
  const supabase = await core();
  const { error } = await supabase.rpc("invite_member", {
    p_business_id: d.businessId,
    p_email: d.email,
    p_invited_name: d.name ?? null,
    p_role_id: d.roleId,
    p_message: d.message ?? null,
    p_token_hash: hashInvitationToken(token),
    p_expires_at: new Date(Date.now() + INVITATION_DAYS * 86400_000).toISOString(),
  });
  if (error) return fromDbError(error);
  const emailed = await sendInvitationEmail(d.businessId, d.email, d.roleId, token, d.message ?? null);
  return { ok: true, value: { emailed } };
}

async function sendInvitationEmail(businessId: string, email: string, roleId: string, token: string, message: string | null): Promise<boolean> {
  const apiKey = await platformKey("RESEND_API_KEY");
  const from = await platformKey("RESEND_FROM_EMAIL");
  if (!apiKey || !from) return false;
  const admin = createAdminClient({ schema: "core" });
  const [{ data: business }, { data: role }] = await Promise.all([
    admin.from("businesses").select("name").eq("id", businessId).single(),
    admin.from("roles").select("name").eq("id", roleId).single(),
  ]);
  const link = `${SITE_URL}/invite/${token}`;
  const body = [
    `You've been invited to join **${business?.name ?? "a business"}** on ${BRAND_NAME} as **${role?.name ?? "a member"}**.`,
    message ? `Message from your team: ${message}` : null,
    `Accept the invitation: ${link}`,
    `This link works once and expires in ${INVITATION_DAYS} days. If you weren't expecting it, you can ignore this email.`,
  ]
    .filter(Boolean)
    .join("\n\n");
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [email],
        subject: `You're invited to ${business?.name ?? BRAND_NAME}`,
        html: renderEmailHtml({ brandName: BRAND_NAME, body, websiteUrl: SITE_URL, replyToEmail: from, platform: true }),
        text: renderEmailText(body),
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function revokeInvitation(invitationId: string): Promise<Result> {
  const supabase = await core();
  const { error } = await supabase.rpc("revoke_invitation", { p_invitation_id: invitationId });
  return error ? fromDbError(error) : { ok: true };
}

export type InvitationPreview = {
  status: "pending" | "accepted" | "expired" | "revoked" | "invalid" | "wrong_account";
  businessName: string | null;
  roleName: string | null;
  invitedByName: string | null;
  email: string | null;
  expiresAt: string | null;
};

export async function previewInvitation(token: string): Promise<InvitationPreview> {
  const supabase = await core();
  const { data, error } = await supabase.rpc("get_invitation", { p_token_hash: hashInvitationToken(token) });
  if (error) throw error;
  const row = ((data ?? []) as { status: InvitationPreview["status"]; business_name: string | null; role_name: string | null; invited_by_name: string | null; email: string | null; expires_at: string | null }[])[0];
  if (!row) return { status: "invalid", businessName: null, roleName: null, invitedByName: null, email: null, expiresAt: null };
  return { status: row.status, businessName: row.business_name, roleName: row.role_name, invitedByName: row.invited_by_name, email: row.email, expiresAt: row.expires_at };
}

export async function acceptInvitation(token: string): Promise<Result<{ businessId: string }>> {
  const supabase = await core();
  const { data, error } = await supabase.rpc("accept_invitation", { p_token_hash: hashInvitationToken(token) });
  if (error) return fromDbError(error);
  return { ok: true, value: { businessId: data as string } };
}

export async function changeMemberRole(memberId: string, roleId: string): Promise<Result> {
  const supabase = await core();
  const { error } = await supabase.rpc("change_member_role", { p_member_id: memberId, p_role_id: roleId });
  return error ? fromDbError(error) : { ok: true };
}

export async function setMemberStatus(memberId: string, status: "active" | "suspended" | "removed", reason: string | null): Promise<Result> {
  const supabase = await core();
  const { error } = await supabase.rpc("set_member_status", { p_member_id: memberId, p_status: status, p_reason: reason });
  return error ? fromDbError(error) : { ok: true };
}

export async function transferOwnership(businessId: string, memberId: string): Promise<Result> {
  const supabase = await core();
  const { error } = await supabase.rpc("transfer_ownership", { p_business_id: businessId, p_member_id: memberId });
  return error ? fromDbError(error) : { ok: true };
}

export const roleSchema = z.object({
  name: z.string().trim().min(1, "Give the role a name.").max(80),
  description: z
    .string()
    .trim()
    .max(500)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional(),
  permissionKeys: z.array(z.string().max(100)).max(200),
});

export async function createRole(businessId: string, input: z.input<typeof roleSchema> & { templateKey?: string | null }): Promise<Result<{ roleId: string }>> {
  const parsed = roleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid role." };
  const supabase = await core();
  const { data, error } = await supabase.rpc("create_role", {
    p_business_id: businessId,
    p_name: parsed.data.name,
    p_description: parsed.data.description ?? null,
    p_permission_keys: parsed.data.permissionKeys,
    p_template_key: input.templateKey ?? null,
  });
  if (error) return fromDbError(error);
  return { ok: true, value: { roleId: data as string } };
}

export async function updateRole(roleId: string, input: z.input<typeof roleSchema>): Promise<Result> {
  const parsed = roleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid role." };
  const supabase = await core();
  const { error } = await supabase.rpc("update_role", {
    p_role_id: roleId,
    p_name: parsed.data.name,
    p_description: parsed.data.description ?? null,
    p_permission_keys: parsed.data.permissionKeys,
  });
  return error ? fromDbError(error) : { ok: true };
}

export async function archiveRole(roleId: string): Promise<Result> {
  const supabase = await core();
  const { error } = await supabase.rpc("archive_role", { p_role_id: roleId });
  return error ? fromDbError(error) : { ok: true };
}
