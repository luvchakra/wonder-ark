/**
 * Auth server actions. These are the only unauthenticated write path into the app, and
 * every one of them ends in a redirect() — which Next implements by throwing — so a test
 * that doesn't model that would pass while the action silently fell through. The mocked
 * redirect throws a sentinel for exactly that reason.
 *
 * The substance under test is the validation that happens *before* Supabase is called
 * (an action that forwards empty credentials wastes a round trip and leaks a worse error
 * to the founder), the redirect target chosen afterwards, and the origin-derived callback
 * URL that makes confirmation links work outside localhost.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { redirect } = vi.hoisted(() => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
}));
const { headers } = vi.hoisted(() => ({ headers: vi.fn() }));
const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/headers", () => ({ headers }));
vi.mock("@cofounderai/core/db/server", () => ({ createClient }));
const { recordSignupAcceptance } = vi.hoisted(() => ({ recordSignupAcceptance: vi.fn() }));
vi.mock("@cofounderai/core/privacy/legal-acceptance", () => ({ recordSignupAcceptance }));
const gate = vi.hoisted(() => ({ orgAddressClosedReason: vi.fn(), refuseNonMemberOnOrgAddress: vi.fn(), onOrgAddress: vi.fn() }));
vi.mock("@/lib/org-sign-in-gate", () => ({ orgAddressClosedReason: gate.orgAddressClosedReason, refuseNonMemberOnOrgAddress: gate.refuseNonMemberOnOrgAddress }));
vi.mock("@/lib/org-host", () => ({ onOrgAddress: gate.onOrgAddress }));

const {
  login,
  requestPasswordReset,
  signInWithOAuthProvider,
  signOut,
  signup,
  updatePassword,
} = await import("./actions");

const ORIGIN = "https://app.example.com";

/** Builds a Supabase auth double; each method defaults to success. */
function mockAuth(overrides: Record<string, unknown> = {}) {
  const auth = {
    signInWithPassword: vi.fn().mockResolvedValue({ data: {}, error: null }),
    signUp: vi.fn().mockResolvedValue({ data: { session: { access_token: "t" } }, error: null }),
    resetPasswordForEmail: vi.fn().mockResolvedValue({ error: null }),
    updateUser: vi.fn().mockResolvedValue({ error: null }),
    signInWithOAuth: vi.fn().mockResolvedValue({ data: { url: "https://google.example/oauth" }, error: null }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
    ...overrides,
  };
  createClient.mockResolvedValue({ auth });
  return auth;
}

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

/** Runs an action that is expected to redirect, returning the target it redirected to. */
async function captureRedirect(run: () => Promise<unknown>): Promise<string> {
  await expect(run()).rejects.toThrow(/^NEXT_REDIRECT:/);
  return redirect.mock.calls.at(-1)![0] as string;
}

beforeEach(() => {
  vi.clearAllMocks();
  headers.mockResolvedValue(new Headers({ origin: ORIGIN }));
});

describe("login", () => {
  it("signs in and redirects to the dashboard", async () => {
    const auth = mockAuth();

    expect(await captureRedirect(() => login(null, form({ email: "a@b.com", password: "pw" })))).toBe(
      "/dashboard",
    );
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: "a@b.com", password: "pw" });
  });

  it("trims the email before sending it", async () => {
    const auth = mockAuth();

    await captureRedirect(() => login(null, form({ email: "  a@b.com  ", password: "pw" })));

    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: "a@b.com", password: "pw" });
  });

  it.each([
    ["a missing email", { password: "pw" }],
    ["a missing password", { email: "a@b.com" }],
    ["a whitespace-only email", { email: "   ", password: "pw" }],
    ["both missing", {}],
  ])("rejects %s without calling Supabase", async (_label, fields) => {
    const auth = mockAuth();

    expect(await login(null, form(fields))).toEqual({ error: "Email and password are required." });
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("returns the provider's error as state rather than redirecting", async () => {
    mockAuth({
      signInWithPassword: vi.fn().mockResolvedValue({ error: { message: "Invalid login credentials" } }),
    });

    expect(await login(null, form({ email: "a@b.com", password: "wrong" }))).toEqual({
      error: "Invalid login credentials",
    });
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("login — back to the help page that sent you here", () => {
  it("returns to the help page named in `next`", async () => {
    mockAuth();

    expect(await captureRedirect(() => login(null, form({ email: "a@b.com", password: "pw", next: "/help/finance" })))).toBe(
      "/help/finance",
    );
  });

  it("PLATFORM-P1-10.15: returns to a new organization's Business page", async () => {
    mockAuth();

    expect(await captureRedirect(() => login(null, form({ email: "a@b.com", password: "pw", next: "/business" })))).toBe("/business");
  });

  // PLATFORM-P1-10.16: "Platform admin" from an organization's address signs in on the main
  // one and lands on the console's front page. The proxy still decides who is served it.
  it("returns to the console's front page when sign-in was asked for from it", async () => {
    mockAuth();

    expect(await captureRedirect(() => login(null, form({ email: "a@b.com", password: "pw", next: "/platform" })))).toBe("/platform");
  });

  it("ignores a `next` that isn't a help page", async () => {
    mockAuth();

    for (const next of ["https://evil.example", "//evil.example", "/platform/keys", "/help/../platform", "/business/../platform", "/business/x", "//business", "//platform"]) {
      expect(await captureRedirect(() => login(null, form({ email: "a@b.com", password: "pw", next }))), next).toBe("/dashboard");
    }
  });
});

describe("signup", () => {
  it("answers an already-registered email exactly like a new signup (no account enumeration)", async () => {
    mockAuth({
      signUp: vi.fn().mockResolvedValue({
        data: { user: null, session: null },
        error: { code: "user_already_exists", message: "User already registered" },
      }),
    });

    expect(
      await captureRedirect(() => signup(null, form({ email: "taken@b.com", password: "longenough" }))),
    ).toBe("/signup/check-email");
  });

  it("creates the account and goes to the dashboard when a session comes back", async () => {
    mockAuth();

    expect(
      await captureRedirect(() => signup(null, form({ email: "a@b.com", password: "longenough" }))),
    ).toBe("/dashboard");
  });

  // PLATFORM-P1-09.4: creating an account accepts the active Terms and Privacy Policy.
  it("records the policy acceptance for a genuinely new user", async () => {
    recordSignupAcceptance.mockResolvedValue(undefined);
    mockAuth({ signUp: vi.fn().mockResolvedValue({ data: { user: { id: "new-user", identities: [{ id: "i" }] }, session: null }, error: null }) });

    await captureRedirect(() => signup(null, form({ email: "a@b.com", password: "longenough" })));

    expect(recordSignupAcceptance).toHaveBeenCalledWith("new-user");
  });

  it("records nothing for an address that already had an account (no identities)", async () => {
    mockAuth({ signUp: vi.fn().mockResolvedValue({ data: { user: { id: "existing-user", identities: [] }, session: null }, error: null }) });

    expect(await captureRedirect(() => signup(null, form({ email: "taken@b.com", password: "longenough" })))).toBe("/signup/check-email");
    expect(recordSignupAcceptance).not.toHaveBeenCalled();
  });

  it("still completes the signup when the acceptance can't be recorded", async () => {
    recordSignupAcceptance.mockRejectedValue(new Error("db down"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    mockAuth({ signUp: vi.fn().mockResolvedValue({ data: { user: { id: "new-user", identities: [{ id: "i" }] }, session: null }, error: null }) });

    expect(await captureRedirect(() => signup(null, form({ email: "a@b.com", password: "longenough" })))).toBe("/signup/check-email");
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it("goes to the check-email page when confirmation is required (no session)", async () => {
    mockAuth({ signUp: vi.fn().mockResolvedValue({ data: { session: null }, error: null }) });

    expect(
      await captureRedirect(() => signup(null, form({ email: "a@b.com", password: "longenough" }))),
    ).toBe("/signup/check-email");
  });

  it("points the confirmation link at the request's own origin, not a hardcoded host", async () => {
    const auth = mockAuth();

    await captureRedirect(() => signup(null, form({ email: "a@b.com", password: "longenough" })));

    expect(auth.signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          emailRedirectTo: `${ORIGIN}/auth/callback?next=/dashboard`,
        }),
      }),
    );
  });

  it("falls back to localhost when the request carries no origin", async () => {
    headers.mockResolvedValue(new Headers());
    const auth = mockAuth();

    await captureRedirect(() => signup(null, form({ email: "a@b.com", password: "longenough" })));

    expect(auth.signUp.mock.calls[0]![0].options.emailRedirectTo).toContain("http://localhost:3000");
  });

  it("carries a supplied name into user metadata, and omits it when blank", async () => {
    const withName = mockAuth();
    await captureRedirect(() =>
      signup(null, form({ name: "Ada", email: "a@b.com", password: "longenough" })),
    );
    expect(withName.signUp.mock.calls[0]![0].options.data).toEqual({ full_name: "Ada" });

    const withoutName = mockAuth();
    await captureRedirect(() =>
      signup(null, form({ name: "   ", email: "a@b.com", password: "longenough" })),
    );
    expect(withoutName.signUp.mock.calls[0]![0].options.data).toBeUndefined();
  });

  it("enforces a minimum password length before calling Supabase", async () => {
    const auth = mockAuth();

    expect(await signup(null, form({ email: "a@b.com", password: "short" }))).toEqual({
      error: "Password must be at least 8 characters.",
    });
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it("accepts a password of exactly the minimum length", async () => {
    const auth = mockAuth();

    await captureRedirect(() => signup(null, form({ email: "a@b.com", password: "12345678" })));

    expect(auth.signUp).toHaveBeenCalled();
  });

  it("requires both an email and a password", async () => {
    const auth = mockAuth();

    expect(await signup(null, form({ email: "", password: "hunter2hunter2" }))).toEqual({
      error: "Email and password are required.",
    });
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it("returns a provider error as state", async () => {
    mockAuth({ signUp: vi.fn().mockResolvedValue({ data: {}, error: { message: "Signups not allowed for this instance" } }) });

    expect(await signup(null, form({ email: "a@b.com", password: "longenough" }))).toEqual({
      error: "Signups not allowed for this instance",
    });
  });
});

describe("requestPasswordReset", () => {
  it("sends the reset email and redirects to the check-email page", async () => {
    const auth = mockAuth();

    expect(await captureRedirect(() => requestPasswordReset(null, form({ email: "a@b.com" })))).toBe(
      "/forgot-password/check-email",
    );
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith("a@b.com", {
      redirectTo: `${ORIGIN}/auth/callback?next=/reset-password`,
    });
  });

  it("requires an email", async () => {
    const auth = mockAuth();

    expect(await requestPasswordReset(null, form({ email: "  " }))).toEqual({
      error: "Email is required.",
    });
    expect(auth.resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("treats a submission with no email field as an empty email", async () => {
    const auth = mockAuth();

    expect(await requestPasswordReset(null, new FormData())).toEqual({
      error: "Email is required.",
    });
    expect(auth.resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("falls back to localhost when the request carries no origin", async () => {
    headers.mockResolvedValue(new Headers());
    const auth = mockAuth();

    await captureRedirect(() => requestPasswordReset(null, form({ email: "a@b.com" })));

    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith("a@b.com", {
      redirectTo: "http://localhost:3000/auth/callback?next=/reset-password",
    });
  });

  it("surfaces a request-level failure (rate limit, malformed address)", async () => {
    mockAuth({ resetPasswordForEmail: vi.fn().mockResolvedValue({ error: { message: "Email rate limit exceeded" } }) });

    expect(await requestPasswordReset(null, form({ email: "a@b.com" }))).toEqual({
      error: "Email rate limit exceeded",
    });
  });
});

describe("updatePassword", () => {
  it("ends every other session, since a reset often means someone else had the password", async () => {
    const auth = mockAuth();

    await captureRedirect(() =>
      updatePassword(null, form({ password: "hunter2hunter2", confirmPassword: "hunter2hunter2" })),
    );

    expect(auth.updateUser).toHaveBeenCalledWith({ password: "hunter2hunter2" });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "others" });
  });

  it("does not revoke sessions when the password change itself failed", async () => {
    const auth = mockAuth({
      updateUser: vi.fn().mockResolvedValue({ error: { message: "New password should be different from the old password." } }),
    });

    expect(
      await updatePassword(null, form({ password: "hunter2hunter2", confirmPassword: "hunter2hunter2" })),
    ).toEqual({ error: "New password should be different from the old password." });
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("updates the password and redirects to the dashboard", async () => {
    const auth = mockAuth();

    expect(
      await captureRedirect(() =>
        updatePassword(null, form({ password: "longenough", confirmPassword: "longenough" })),
      ),
    ).toBe("/dashboard");
    expect(auth.updateUser).toHaveBeenCalledWith({ password: "longenough" });
  });

  it("rejects a too-short password before calling Supabase", async () => {
    const auth = mockAuth();

    expect(await updatePassword(null, form({ password: "short", confirmPassword: "short" }))).toEqual({
      error: "Password must be at least 8 characters.",
    });
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("rejects a mismatched confirmation before calling Supabase", async () => {
    const auth = mockAuth();

    expect(
      await updatePassword(null, form({ password: "longenough", confirmPassword: "different1" })),
    ).toEqual({ error: "Passwords do not match." });
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("treats a submission with no password fields as too short", async () => {
    const auth = mockAuth();

    expect(await updatePassword(null, new FormData())).toEqual({
      error: "Password must be at least 8 characters.",
    });
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("surfaces a provider error", async () => {
    mockAuth({ updateUser: vi.fn().mockResolvedValue({ error: { message: "Session expired" } }) });

    expect(
      await updatePassword(null, form({ password: "longenough", confirmPassword: "longenough" })),
    ).toEqual({ error: "Session expired" });
  });
});

describe("signInWithOAuthProvider", () => {
  it("redirects to the provider URL Supabase returns", async () => {
    mockAuth();

    expect(await captureRedirect(() => signInWithOAuthProvider("google"))).toBe("https://google.example/oauth");
  });

  it("always sends the founder to the dashboard after auth", async () => {
    const auth = mockAuth();

    await captureRedirect(() => signInWithOAuthProvider("google"));
    expect(auth.signInWithOAuth.mock.calls[0]![0].options.redirectTo).toBe(
      `${ORIGIN}/auth/callback?next=/dashboard`,
    );
  });

  it("falls back to localhost for the callback when there is no origin header", async () => {
    headers.mockResolvedValue(new Headers());
    const auth = mockAuth();

    await captureRedirect(() => signInWithOAuthProvider("google"));

    expect(auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: "http://localhost:3000/auth/callback?next=/dashboard" },
    });
  });

  it("sends the founder back to login with the reason when the provider is unavailable", async () => {
    mockAuth({
      signInWithOAuth: vi.fn().mockResolvedValue({ data: {}, error: { message: "Provider not enabled" } }),
    });

    const target = await captureRedirect(() => signInWithOAuthProvider("google"));

    expect(target).toBe(`/login?error=${encodeURIComponent("Provider not enabled")}`);
  });

  it("falls back to a generic reason when Supabase returns neither URL nor error", async () => {
    mockAuth({ signInWithOAuth: vi.fn().mockResolvedValue({ data: { url: null }, error: null }) });

    expect(await captureRedirect(() => signInWithOAuthProvider("google"))).toContain("not%20available%20yet");
  });
});

describe("signInWithOAuthProvider — Microsoft and LinkedIn", () => {
  it("asks Microsoft for the email scope, which Supabase needs to create the user", async () => {
    const auth = mockAuth();

    await captureRedirect(() => signInWithOAuthProvider("azure"));

    expect(auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: "azure",
      options: { redirectTo: `${ORIGIN}/auth/callback?next=/dashboard`, scopes: "email" },
    });
  });

  it("uses LinkedIn's OpenID Connect provider", async () => {
    const auth = mockAuth();

    await captureRedirect(() => signInWithOAuthProvider("linkedin_oidc"));

    expect(auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: "linkedin_oidc",
      options: { redirectTo: `${ORIGIN}/auth/callback?next=/dashboard` },
    });
  });

  it("names the provider when it isn't switched on", async () => {
    mockAuth({
      signInWithOAuth: vi.fn().mockResolvedValue({ data: {}, error: { message: "Unsupported provider: provider is not enabled" } }),
    });

    const target = decodeURIComponent(await captureRedirect(() => signInWithOAuthProvider("linkedin_oidc")));

    expect(target).toContain("LinkedIn sign-in isn't switched on");
    expect(target).toContain("LinkedIn (OIDC)");
  });

  // Server-action arguments come from the client, so neither may be trusted as given.
  it("refuses a provider outside the allowlist without calling Supabase", async () => {
    const auth = mockAuth();

    const target = await captureRedirect(() => signInWithOAuthProvider("github" as never));

    expect(target).toContain("/login?error=");
    expect(auth.signInWithOAuth).not.toHaveBeenCalled();
  });

  it("never lets a forged `next` steer the callback", async () => {
    const auth = mockAuth();

    // A server action's arguments come from the client, which can send extras it was
    // never bound with.
    const forged = signInWithOAuthProvider as (...args: unknown[]) => Promise<void>;
    await captureRedirect(() => forged("google", "https://evil.example"));

    expect(auth.signInWithOAuth.mock.calls[0]![0].options.redirectTo).toBe(`${ORIGIN}/auth/callback?next=/dashboard`);
  });
});

describe("signInWithOAuthProvider — back to a help page", () => {
  it("carries a help page through the callback", async () => {
    const auth = mockAuth();

    await captureRedirect(() => signInWithOAuthProvider("google", "/help/getting-started"));

    expect(auth.signInWithOAuth.mock.calls[0]![0].options.redirectTo).toBe(`${ORIGIN}/auth/callback?next=/help/getting-started`);
  });

  it("drops anything that isn't a help page", async () => {
    const auth = mockAuth();

    await captureRedirect(() => signInWithOAuthProvider("google", "/platform/settings"));

    expect(auth.signInWithOAuth.mock.calls[0]![0].options.redirectTo).toBe(`${ORIGIN}/auth/callback?next=/dashboard`);
  });
});

describe("signOut", () => {
  it("signs out and returns to login", async () => {
    const auth = mockAuth();

    expect(await captureRedirect(() => signOut())).toBe("/login");
    expect(auth.signOut).toHaveBeenCalledOnce();
  });

  it("still returns to login if the provider sign-out errors", async () => {
    mockAuth({ signOut: vi.fn().mockResolvedValue({ error: { message: "network" } }) });

    expect(await captureRedirect(() => signOut())).toBe("/login");
  });
});

// PLATFORM-P1-10.2: password sign-in on an organization's address.
describe("login on an organization's address", () => {
  it("refuses a paused or missing organization before checking credentials", async () => {
    const auth = mockAuth();
    gate.orgAddressClosedReason.mockResolvedValueOnce("Acme is paused, so sign-in is closed. Contact its owner.");
    expect(await login(null, form({ email: "a@b.com", password: "pw" }))).toEqual({ error: "Acme is paused, so sign-in is closed. Contact its owner." });
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("refuses a non-member after sign-in", async () => {
    mockAuth();
    gate.refuseNonMemberOnOrgAddress.mockResolvedValueOnce("This account isn't a member of Acme.");
    expect(await login(null, form({ email: "a@b.com", password: "pw" }))).toEqual({ error: "This account isn't a member of Acme." });
  });

  it("sends a member to the organization's home", async () => {
    mockAuth();
    gate.onOrgAddress.mockResolvedValueOnce(true);
    expect(await captureRedirect(() => login(null, form({ email: "a@b.com", password: "pw" })))).toBe("/");
  });
});

