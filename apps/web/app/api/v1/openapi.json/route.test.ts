import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const resolveApiKey = vi.fn();

vi.mock("@cofounderai/core/db/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));
vi.mock("@cofounderai/core/api-v1/auth.server", () => ({ resolveApiKey: (r: Request) => resolveApiKey(r) }));
vi.mock("../dispatch", () => ({
  serveOpenApiSpec: () => new Response(JSON.stringify({ openapi: "3.0.3" }), { status: 200 }),
}));

const { GET } = await import("./route");
const { ApiError } = await import("@cofounderai/core/api-v1/response");

describe("GET /api/v1/openapi.json", () => {
  beforeEach(() => {
    getUser.mockReset();
    resolveApiKey.mockReset();
  });

  it("refuses an anonymous caller", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(new Request("https://x.test/api/v1/openapi.json"));
    expect(res.status).toBe(401);
    expect(await res.text()).not.toContain("openapi");
  });

  it("serves a signed-in user", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const res = await GET(new Request("https://x.test/api/v1/openapi.json"));
    expect(res.status).toBe(200);
  });

  it("serves a valid API key and refuses a bad one", async () => {
    const withKey = () =>
      new Request("https://x.test/api/v1/openapi.json", { headers: { authorization: "Bearer sk_live_x" } });
    resolveApiKey.mockResolvedValueOnce({ id: "k1" });
    expect((await GET(withKey())).status).toBe(200);
    resolveApiKey.mockRejectedValueOnce(new ApiError(401, "unauthorized", "Invalid API key."));
    expect((await GET(withKey())).status).toBe(401);
    expect(getUser).not.toHaveBeenCalled();
  });
});
