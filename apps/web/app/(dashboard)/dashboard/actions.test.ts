import { beforeEach, describe, expect, it, vi } from "vitest";

/** PLATFORM-P1-10.15: a business just created opens on its own address, never as a bare
 * `/<slug>/...` path on the address the person is on (which 404s there). */
const h = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  }),
  createBusiness: vi.fn(),
  createRun: vi.fn(),
  host: { base: "ark.example" as string | null, protocol: "https", port: undefined as string | undefined },
}));
vi.mock("next/navigation", () => ({ redirect: h.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@cofounderai/module-discovery/lib/tenancy/mutations", () => ({ createBusiness: h.createBusiness, createProduct: vi.fn() }));
vi.mock("@cofounderai/module-discovery/lib/website-onboarding/mutations", () => ({ createWebsiteOnboardingRun: h.createRun }));
vi.mock("@cofounderai/core/businesses/manage-organizations", () => ({ createBusinessWithAddress: vi.fn() }));
vi.mock("@/lib/business-path", () => ({ businessPath: vi.fn(async () => "/home-wonderapps-biz") }));
vi.mock("@/lib/org-host", () => ({ getRequestHost: vi.fn(async () => ({ target: { kind: "organization", label: "acme" }, ...h.host })) }));

import { createBusinessAction, createBusinessFromWebsiteAction } from "./actions";

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};
async function redirectOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    return (error as { url: string }).url;
  }
  throw new Error("expected a redirect");
}

beforeEach(() => {
  vi.clearAllMocks();
  h.host = { base: "ark.example", protocol: "https", port: undefined };
  h.createBusiness.mockResolvedValue({ id: "b1" });
});

describe("creating a business", () => {
  it("from a website, opens the new organization's own address, signing in there, then its Business page", async () => {
    const url = await redirectOf(() => createBusinessFromWebsiteAction("acc", null, form({ website: "https://home.wonderapps.biz" })));
    expect(url).toBe("https://home-wonderapps-biz.ark.example/login?next=%2Fbusiness");
    expect(h.createRun).toHaveBeenCalledWith("b1", expect.stringContaining("home.wonderapps.biz"));
  });

  it("by hand without an address, opens the new organization's own address too", async () => {
    const url = await redirectOf(() => createBusinessAction("acc", null, form({ name: "Home" })));
    expect(url).toBe("https://home-wonderapps-biz.ark.example/login");
  });

  it("keeps the path form where organization addresses are off", async () => {
    h.host = { base: null, protocol: "http", port: "3000" };
    expect(await redirectOf(() => createBusinessFromWebsiteAction("acc", null, form({ website: "https://home.wonderapps.biz" })))).toBe(
      "/home-wonderapps-biz/business",
    );
    expect(await redirectOf(() => createBusinessAction("acc", null, form({ name: "Home" })))).toBe("/home-wonderapps-biz");
  });

  it("refuses an invalid website without creating anything", async () => {
    const state = await createBusinessFromWebsiteAction("acc", null, form({ website: "not a url" }));
    expect(state).toMatchObject({ error: expect.any(String) });
    expect(h.createBusiness).not.toHaveBeenCalled();
  });
});
