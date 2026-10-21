/**
 * PLATFORM-P1-10.1 / 10.3: the proxy on an organization's address and on the main address,
 * with Supabase and the host lookup faked out. The host decides which business a request is
 * for, never who may see it; an unknown address is 404, a failed lookup 503.
 */
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  getClaims: vi.fn(),
  createServerClient: vi.fn(),
  lookUpOrgHost: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({ createServerClient: h.createServerClient }));
vi.mock("./org-host-lookup", () => ({ lookUpOrgHost: h.lookUpOrgHost }));

const { updateSession, LAST_ORG_COOKIE_NAME } = await import("./middleware");

function request(url: string) {
  const u = new URL(url);
  return new NextRequest(url, { headers: { host: u.host } });
}

function signedIn(on: boolean) {
  h.getClaims.mockResolvedValue({ data: on ? { claims: { sub: "user-1" } } : null, error: null });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "publishable";
  process.env.BASE_APP_HOST = "ark.example.com";
  delete process.env.ORG_ADDRESS_REQUIRED;
  h.createServerClient.mockReturnValue({
    auth: { getClaims: h.getClaims },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
  });
  h.lookUpOrgHost.mockResolvedValue("found");
});

afterEach(() => {
  delete process.env.BASE_APP_HOST;
  delete process.env.ORG_ADDRESS_REQUIRED;
});

describe("an organization's address", () => {
  it("answers 404 when no organization lives there, without falling back to another", async () => {
    signedIn(true);
    h.lookUpOrgHost.mockResolvedValue("missing");
    const response = await updateSession(request("https://nobody.ark.example.com/discovery"));
    expect(response.status).toBe(404);
    expect(response.headers.get("x-middleware-rewrite")).toContain("/organization-not-found");
  });

  it("answers 503 when the lookup fails", async () => {
    signedIn(true);
    h.lookUpOrgHost.mockResolvedValue("error");
    const response = await updateSession(request("https://acme.ark.example.com/"));
    expect(response.status).toBe(503);
    expect(response.headers.get("x-middleware-rewrite")).toContain("/service-unavailable");
  });

  it("answers the API in JSON", async () => {
    signedIn(false);
    h.lookUpOrgHost.mockResolvedValue("missing");
    const response = await updateSession(request("https://nobody.ark.example.com/api/v1/things"));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "ORGANIZATION_NOT_FOUND" });
  });

  it("refuses a malformed address", async () => {
    signedIn(false);
    const response = await updateSession(request("https://a.b.ark.example.com/"));
    expect(response.status).toBe(404);
    expect(h.lookUpOrgHost).not.toHaveBeenCalled();
  });

  it("sends a signed-out visitor to sign in on the same address", async () => {
    signedIn(false);
    const response = await updateSession(request("https://acme.ark.example.com/"));
    expect(response.headers.get("location")).toBe("https://acme.ark.example.com/login");
  });

  it("serves the organization's pages from the address root and remembers the address", async () => {
    signedIn(true);
    const response = await updateSession(request("https://acme.ark.example.com/discovery/dashboard"));
    expect(response.headers.get("x-middleware-rewrite")).toBe("https://acme.ark.example.com/acme/discovery/dashboard");
    const cookie = response.cookies.get(LAST_ORG_COOKIE_NAME);
    expect(cookie?.value).toBe("acme");
    expect(cookie?.domain).toBe(".ark.example.com");
  });

  it("leaves the app's own paths alone", async () => {
    signedIn(true);
    const response = await updateSession(request("https://acme.ark.example.com/legal/accept"));
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("turns a slug-carrying link into the address-root form", async () => {
    signedIn(true);
    const response = await updateSession(request("https://acme.ark.example.com/acme/crm?tab=1"));
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("https://acme.ark.example.com/crm?tab=1");
  });

  it("sends a signed-in visitor from sign-in to the organization's home, not the dashboard", async () => {
    signedIn(true);
    const response = await updateSession(request("https://acme.ark.example.com/login"));
    expect(response.headers.get("location")).toBe("https://acme.ark.example.com/");
  });

  it("keeps the vendor console on the main address", async () => {
    signedIn(true);
    const response = await updateSession(request("https://acme.ark.example.com/platform/health"));
    expect(response.headers.get("location")).toBe("https://ark.example.com/platform/health");
  });
});

describe("the main address", () => {
  it("routes as before while ORG_ADDRESS_REQUIRED is off", async () => {
    signedIn(true);
    const response = await updateSession(request("https://ark.example.com/"));
    expect(response.headers.get("location")).toBe("https://ark.example.com/dashboard");
  });

  it("is the landing page only when required: an organization's page goes to its address", async () => {
    process.env.ORG_ADDRESS_REQUIRED = "true";
    signedIn(true);
    const response = await updateSession(request("https://ark.example.com/acme/discovery?x=1"));
    expect(response.headers.get("location")).toBe("https://acme.ark.example.com/discovery?x=1");
  });

  it("hands a signed-in visitor at the front door to /go", async () => {
    process.env.ORG_ADDRESS_REQUIRED = "true";
    signedIn(true);
    for (const path of ["/", "/dashboard", "/login"]) {
      const response = await updateSession(request(`https://ark.example.com${path}`));
      expect(response.headers.get("location")).toBe("https://ark.example.com/go");
    }
  });

  it("keeps the API, auth and the console on the main address", async () => {
    process.env.ORG_ADDRESS_REQUIRED = "true";
    signedIn(true);
    for (const path of ["/api/cron/drain-events", "/auth/callback", "/platform/health", "/dashboard/settings"]) {
      const response = await updateSession(request(`https://ark.example.com${path}`));
      expect(response.headers.get("location") ?? "").not.toContain("go");
      expect(response.headers.get("location") ?? "").not.toMatch(/https:\/\/[a-z-]+\.ark\.example\.com/);
    }
  });
});

describe("the main address's own public pages", () => {
  // PLATFORM-P1-13.1: /careers is served on the main address only. With ORG_ADDRESS_REQUIRED
  // it was handed to careers.<host> as if it were an organization's address.
  it("serves /careers on the main address instead of handing it to an organization", async () => {
    process.env.ORG_ADDRESS_REQUIRED = "true";
    signedIn(false);
    for (const path of ["/careers", "/careers/job_1", "/careers/status?t=abc"]) {
      const response = await updateSession(request(`https://ark.example.com${path}`));
      expect(response.headers.get("location")).toBeNull();
    }
  });
});

describe("addresses off (no BASE_APP_HOST)", () => {
  it("changes nothing", async () => {
    delete process.env.BASE_APP_HOST;
    signedIn(true);
    const response = await updateSession(request("https://wonderark-git-x.vercel.app/acme/discovery"));
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
    expect(response.headers.get("location")).toBeNull();
    expect(h.lookUpOrgHost).not.toHaveBeenCalled();
  });
});
