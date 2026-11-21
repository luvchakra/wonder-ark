/**
 * The email-link callback turns whatever a Supabase auth link carries into a session.
 * Three properties hold it together: every link shape Supabase can send is consumed (the
 * project's email template decides which arrives, so assuming one silently breaks the
 * others), a link that cannot be consumed says why rather than dumping the founder on a
 * blank login page, and `next` — which arrives on the URL and is therefore
 * attacker-controllable — only ever steers a *successfully authenticated* visitor.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClient, cookieStore } = vi.hoisted(() => ({
  createClient: vi.fn(),
  cookieStore: { get: vi.fn() },
}));
vi.mock("@cofounderai/core/db/server", () => ({ createClient }));
vi.mock("next/headers", () => ({ cookies: async () => cookieStore }));
const { refuseNonMemberOnOrgAddress } = vi.hoisted(() => ({ refuseNonMemberOnOrgAddress: vi.fn() }));
vi.mock("../../../lib/org-sign-in-gate", () => ({ refuseNonMemberOnOrgAddress }));

const { mainAddressLanding } = vi.hoisted(() => ({ mainAddressLanding: vi.fn() }));
vi.mock("../../../lib/sign-in-landing", () => ({ mainAddressLanding }));

const { GET } = await import("./route");

const ORIGIN = "https://app.example.com";

function mockAuth(
  results: { exchange?: { error: unknown }; verify?: { error: unknown }; businesses?: { data: unknown; error: unknown } } = {},
) {
  const exchangeCodeForSession = vi.fn().mockResolvedValue(results.exchange ?? { error: null });
  const verifyOtp = vi.fn().mockResolvedValue(results.verify ?? { error: null });
  // An existing user with a business, unless a test says otherwise.
  const businesses = results.businesses ?? { data: [{ id: "b1" }], error: null };
  const schema = vi.fn(() => ({ from: () => ({ select: () => ({ limit: async () => businesses }) }) }));
  createClient.mockResolvedValue({ auth: { exchangeCodeForSession, verifyOtp }, schema });
  return { exchangeCodeForSession, verifyOtp, schema };
}

function request(query: string) {
  return new Request(`${ORIGIN}/auth/callback${query}`);
}

/** The reason a failed link carries through to the page it lands on. */
function reason(response: Response): string | null {
  return new URL(response.headers.get("location")!).searchParams.get("error");
}

function path(response: Response): string {
  return new URL(response.headers.get("location")!).pathname;
}

beforeEach(() => {
  vi.clearAllMocks();
  cookieStore.get.mockReturnValue(undefined);
  mainAddressLanding.mockResolvedValue("/dashboard");
});

// PLATFORM-P1-10.16: a social or emailed-link sign-in that asked for no page lands a
// platform admin on the console; a page that was asked for is left alone.
describe("GET /auth/callback — where a platform admin lands", () => {
  it("lands on the console when no page was asked for", async () => {
    mockAuth();
    mainAddressLanding.mockResolvedValue("/platform");

    expect(path(await GET(request("?code=one-time-code")))).toBe("/platform");
    expect(path(await GET(request("?token_hash=abc&type=email")))).toBe("/platform");
  });

  it("keeps the page that was asked for", async () => {
    mockAuth();
    mainAddressLanding.mockResolvedValue("/platform");

    expect(path(await GET(request("?code=one-time-code&next=/reset-password")))).toBe("/reset-password");
    expect(mainAddressLanding).not.toHaveBeenCalled();
  });
});

describe("GET /auth/callback — PKCE code links", () => {
  it("exchanges the code and redirects to the default destination", async () => {
    const { exchangeCodeForSession } = mockAuth();

    const response = await GET(request("?code=one-time-code"));

    expect(exchangeCodeForSession).toHaveBeenCalledWith("one-time-code");
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`${ORIGIN}/dashboard`);
  });

  it("honours an explicit next destination", async () => {
    mockAuth();

    const response = await GET(request("?code=c&next=/onboarding"));

    expect(response.headers.get("location")).toBe(`${ORIGIN}/onboarding`);
  });
});

/**
 * The token-hash shape is what makes a reset requested on one device usable on another:
 * everything needed is in the URL, with no code verifier cookie to match. A project whose
 * template sends this shape would have had every reset link dead-end at /login without it.
 */
describe("GET /auth/callback — token hash links", () => {
  it("verifies a recovery link and forwards to the reset form", async () => {
    const { verifyOtp, exchangeCodeForSession } = mockAuth();

    const response = await GET(
      request("?token_hash=hash-123&type=recovery&next=/reset-password"),
    );

    expect(verifyOtp).toHaveBeenCalledWith({ type: "recovery", token_hash: "hash-123" });
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe(`${ORIGIN}/reset-password`);
  });

  it("verifies the other email link types the same way", async () => {
    const { verifyOtp } = mockAuth();

    await GET(request("?token_hash=hash-123&type=signup&next=/onboarding"));

    expect(verifyOtp).toHaveBeenCalledWith({ type: "signup", token_hash: "hash-123" });
  });

  it("prefers the token hash when a link somehow carries both shapes", async () => {
    const { verifyOtp, exchangeCodeForSession } = mockAuth();

    await GET(request("?token_hash=hash-123&type=recovery&code=also-here"));

    expect(verifyOtp).toHaveBeenCalled();
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("ignores a token hash with no type, since verifyOtp needs both", async () => {
    const { verifyOtp } = mockAuth();

    const response = await GET(request("?token_hash=hash-123"));

    expect(verifyOtp).not.toHaveBeenCalled();
    expect(path(response)).toBe("/login");
  });
});

describe("GET /auth/callback — links that cannot be consumed", () => {
  it("passes Supabase's own rejection through instead of swallowing it", async () => {
    mockAuth();

    const response = await GET(
      request(
        "?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired&next=/reset-password",
      ),
    );

    expect(reason(response)).toBe("Email link is invalid or has expired");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("falls back to the bare error code when there is no description", async () => {
    mockAuth();

    const response = await GET(request("?error=access_denied"));

    expect(reason(response)).toBe("access_denied");
  });

  it("sends a failed recovery link to forgot-password, where a new one can be requested", async () => {
    mockAuth({ verify: { error: { message: "Email link is invalid or has expired" } } });

    const response = await GET(request("?token_hash=stale&type=recovery&next=/reset-password"));

    expect(path(response)).toBe("/forgot-password");
    expect(reason(response)).toBe("Email link is invalid or has expired");
  });

  it("recognises a recovery link by its destination when the type is absent", async () => {
    mockAuth({ exchange: { error: { message: "expired" } } });

    const response = await GET(request("?code=stale&next=/reset-password"));

    expect(path(response)).toBe("/forgot-password");
  });

  it("sends every other failed link to login", async () => {
    mockAuth({ exchange: { error: { message: "code expired" } } });

    const response = await GET(request("?code=stale&next=/onboarding"));

    expect(path(response)).toBe("/login");
    expect(reason(response)).toBe("code expired");
  });

  it("translates the cross-device PKCE failure into something a founder can act on", async () => {
    mockAuth({
      exchange: {
        error: { message: "invalid request: both auth code and code verifier should be non-empty" },
      },
    });

    const response = await GET(request("?code=stale&next=/reset-password"));

    expect(reason(response)).toMatch(/different browser or device/);
    expect(reason(response)).not.toMatch(/code verifier/);
  });

  it("says so when the link carries nothing to consume at all", async () => {
    mockAuth();

    const response = await GET(request("?next=/onboarding"));

    expect(createClient).not.toHaveBeenCalled();
    expect(path(response)).toBe("/login");
    expect(reason(response)).toMatch(/missing its confirmation code/);
  });
});

describe("GET /auth/callback — open redirect", () => {
  it("never redirects off-origin on the failure path", async () => {
    mockAuth({ exchange: { error: { message: "bad" } } });

    const response = await GET(request("?code=x&next=https://evil.example/steal"));

    expect(new URL(response.headers.get("location")!).origin).toBe(ORIGIN);
  });

  // `next` is attacker-controllable. Gluing it onto the origin was never safe on its own:
  // "@evil.example" turns "https://app.example.com" into a URL whose *host* is
  // evil.example. Anything that isn't a plain on-site path now falls back to the dashboard.
  it.each([
    ["an absolute URL", "https://evil.example/steal"],
    ["a protocol-relative host", "//evil.example/steal"],
    ["the userinfo trick", "@evil.example/steal"],
    ["a backslash host", "/\\evil.example"],
  ])("cannot be steered to an attacker's host by %s in `next`", async (_label, next) => {
    mockAuth();

    const response = await GET(request(`?code=valid&next=${encodeURIComponent(next)}`));
    const location = new URL(response.headers.get("location")!);

    expect(location.origin).toBe(ORIGIN);
    expect(location.pathname).toBe("/dashboard");
  });

  it("keeps the same guarantee for a token-hash link", async () => {
    mockAuth();

    const response = await GET(
      request("?token_hash=h&type=recovery&next=https://evil.example/steal"),
    );

    expect(new URL(response.headers.get("location")!).hostname).not.toBe("evil.example");
  });
});

describe("GET /auth/callback — first sign-in through Google, Microsoft or LinkedIn", () => {
  it("sends a brand-new account (no business yet) to the dashboard, not an onboarding wizard", async () => {
    mockAuth({ businesses: { data: [], error: null } });

    expect(path(await GET(request("?code=valid")))).toBe("/dashboard");
  });

  it("sends a returning user to the dashboard", async () => {
    mockAuth();

    expect(path(await GET(request("?code=valid")))).toBe("/dashboard");
  });

  it("leaves an invitee on their way to the invitation", async () => {
    mockAuth({ businesses: { data: [], error: null } });
    cookieStore.get.mockReturnValue({ value: "invite-token" });

    expect(path(await GET(request("?code=valid")))).toBe("/dashboard");
  });

  it("keeps the original destination if it can't tell", async () => {
    mockAuth({ businesses: { data: null, error: { message: "boom" } } });

    expect(path(await GET(request("?code=valid")))).toBe("/dashboard");
  });

  it("never overrides an explicit destination such as a password reset", async () => {
    mockAuth({ businesses: { data: [], error: null } });

    expect(path(await GET(request("?code=valid&next=/reset-password")))).toBe("/reset-password");
  });
});

// PLATFORM-P1-10.2: on an organization's address, social sign-in keeps the session only for
// that organization's members.
describe("on an organization's address", () => {
  it("refuses a non-member after the code exchange and says why", async () => {
    mockAuth();
    refuseNonMemberOnOrgAddress.mockResolvedValueOnce("This account isn't a member of Acme.");
    const response = await GET(request("?code=abc&next=/"));
    expect(response.headers.get("location")).toContain("/login?error=");
    expect(reason(response)).toBe("This account isn't a member of Acme.");
  });

  it("lets a member through to the destination", async () => {
    mockAuth();
    refuseNonMemberOnOrgAddress.mockResolvedValueOnce(null);
    const response = await GET(request("?code=abc&next=/"));
    expect(response.headers.get("location")).toBe(`${ORIGIN}/`);
  });
});

