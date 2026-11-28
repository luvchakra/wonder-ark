/** DISC-IG-P0-01.3: the helper's download is a real zip of the extension, for signed-in people. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("@cofounderai/core/db/server", () => ({ createClient: async () => ({ auth: { getUser: h.getUser } }) }));

const { GET } = await import("./route");

beforeEach(() => h.getUser.mockResolvedValue({ data: { user: { id: "u1" } } }));

describe("GET /api/discovery/instagram-helper/download", () => {
  it("answers 401 when signed out", async () => {
    h.getUser.mockResolvedValue({ data: { user: null } });
    expect((await GET()).status).toBe(401);
  });

  it("serves the extension as a zip attachment holding its manifest", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/zip");
    expect(response.headers.get("content-disposition")).toMatch(/^attachment; filename="wonderark-instagram-helper-\d+\.\d+\.\d+\.zip"$/);
    const bytes = Buffer.from(await response.arrayBuffer());
    expect(bytes.subarray(0, 4).toString("latin1")).toBe("PK\u0003\u0004");
    // Stored, not compressed, so the file names and the manifest are readable in the bytes.
    const text = bytes.toString("latin1");
    expect(text).toContain("wonderark-instagram-helper/manifest.json");
    expect(text).toContain('"manifest_version": 3');
    expect(text).not.toContain("wonderark-instagram-helper/e2e-mock");
  });
});
