/**
 * PLATFORM-P1-10.3 / 10.16: the main address's hand-off after sign-in. A platform admin
 * lands on the console; "Your business" in the console (?to=business) and everyone else go
 * to their organization's address.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  claims: null as Record<string, unknown> | null,
  businesses: [] as { business_settings: { slug: string } }[],
  businessesError: null as { message: string } | null,
  lastOrg: undefined as string | undefined,
  isSuperadmin: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => (h.lastOrg ? { value: h.lastOrg } : undefined) }) }));
vi.mock("@cofounderai/core/db/server", () => ({
  createClient: async () => ({
    auth: { getClaims: async () => ({ data: h.claims ? { claims: h.claims } : null }) },
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        is: () => query,
        order: async () => ({ data: h.businesses, error: h.businessesError }),
      };
      return query;
    },
  }),
}));
vi.mock("@cofounderai/core/db/middleware", () => ({ LAST_ORG_COOKIE_NAME: "wa_last_org" }));
vi.mock("@cofounderai/core/rbac/platform-admin", () => ({ isSuperadmin: h.isSuperadmin }));
vi.mock("@/lib/org-host", () => ({ getRequestHost: async () => ({ base: "ark.example.com", protocol: "https", port: undefined }) }));

const { GET } = await import("./route");

const go = async (query = "") => (await GET(new Request(`https://ark.example.com/go${query}`))).headers.get("location");
const org = (slug: string) => ({ business_settings: { slug } });

beforeEach(() => {
  vi.clearAllMocks();
  h.claims = { sub: "u1" };
  h.businesses = [org("acme"), org("globex")];
  h.businessesError = null;
  h.lastOrg = undefined;
  h.isSuperadmin.mockResolvedValue(false);
});

describe("/go", () => {
  it("sends a signed-out visitor to sign in", async () => {
    h.claims = null;
    expect(await go()).toBe("https://ark.example.com/login");
  });

  it("sends a member to the organization they used last, else their first", async () => {
    expect(await go()).toBe("https://acme.ark.example.com/");
    h.lastOrg = "globex";
    expect(await go()).toBe("https://globex.ark.example.com/");
    h.lastOrg = "someone-elses";
    expect(await go()).toBe("https://acme.ark.example.com/");
  });

  it("sends a platform admin to the console, even when they have a business", async () => {
    h.isSuperadmin.mockResolvedValue(true);
    expect(await go()).toBe("https://ark.example.com/platform");
  });

  it("takes a platform admin to their business when the console's Your business asks", async () => {
    h.isSuperadmin.mockResolvedValue(true);
    expect(await go("?to=business")).toBe("https://acme.ark.example.com/");
  });

  it("keeps a platform admin with no business on the console", async () => {
    h.isSuperadmin.mockResolvedValue(true);
    h.businesses = [];
    expect(await go("?to=business")).toBe("https://ark.example.com/platform");
  });

  it("treats a role the database cannot confirm as not an admin", async () => {
    h.isSuperadmin.mockRejectedValue(new Error("connection refused"));
    expect(await go()).toBe("https://acme.ark.example.com/");
  });

  it("sends a member with no organization to create one, never to the console", async () => {
    h.businesses = [];
    expect(await go()).toBe("https://ark.example.com/dashboard/organizations");
    expect(await go("?to=business")).toBe("https://ark.example.com/dashboard/organizations");
  });
});
