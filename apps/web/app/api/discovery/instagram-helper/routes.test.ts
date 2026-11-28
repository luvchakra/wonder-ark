/**
 * DISC-IG-P0-01.2: the door for the Instagram helper's calls. They carry the person's
 * session cookie, so what is pinned is that another site cannot make them (the header and
 * the Origin check), that a signed-out caller gets 401 before anything is read, and that a
 * malformed body is refused before anything is written.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ getUser: vi.fn(), listHelperQueue: vi.fn(), markHelperMessageSent: vi.fn(), saveHelperReply: vi.fn() }));
vi.mock("@cofounderai/core/db/server", () => ({ createClient: async () => ({ auth: { getUser: h.getUser } }) }));
vi.mock("@cofounderai/module-discovery/lib/instagram-helper/helper", () => ({
  MAX_REPLY_LENGTH: 4000,
  listHelperQueue: h.listHelperQueue,
  markHelperMessageSent: h.markHelperMessageSent,
  saveHelperReply: h.saveHelperReply,
}));

const { GET: queue } = await import("./queue/route");
const { POST: sent } = await import("./sent/route");
const { POST: reply } = await import("./reply/route");

const SITE = "https://home.ark.wonderapps.biz";
const ID = "0b8f6f3e-8f0f-4c1e-9d55-3a1f8a7f2c11";
const request = (path: string, init: { body?: unknown; headers?: Record<string, string> } = {}) =>
  new Request(`${SITE}/api/discovery/instagram-helper/${path}`, {
    method: init.body === undefined ? "GET" : "POST",
    headers: { "x-wonderark-helper": "1", origin: "chrome-extension://abcdefghijklmnop", ...(init.headers ?? {}) },
    body: init.body === undefined ? undefined : typeof init.body === "string" ? init.body : JSON.stringify(init.body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  h.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
  h.listHelperQueue.mockResolvedValue({ offerings: [], prospects: [] });
  h.markHelperMessageSent.mockResolvedValue({ ok: true, status: "sent" });
  h.saveHelperReply.mockResolvedValue({ ok: true, status: "saved" });
});

describe("the helper's door", () => {
  it("refuses a call without the helper header, before looking at the session", async () => {
    const response = await queue(request("queue", { headers: { "x-wonderark-helper": "" } }));
    expect(response.status).toBe(403);
    expect(h.getUser).not.toHaveBeenCalled();
    expect(h.listHelperQueue).not.toHaveBeenCalled();
  });

  it("refuses another website's origin, and accepts the extension's and the site's own", async () => {
    for (const origin of ["https://evil.example", "https://ark.wonderapps.biz.evil.example", "https://other.ark.wonderapps.biz"]) {
      expect((await sent(request("sent", { body: { messageId: ID }, headers: { origin } }))).status, origin).toBe(403);
    }
    expect(h.markHelperMessageSent).not.toHaveBeenCalled();
    expect((await queue(request("queue", { headers: { origin: SITE } }))).status).toBe(200);
    expect((await queue(request("queue"))).status).toBe(200);
  });

  it("answers 401 to a signed-out caller and reads nothing", async () => {
    h.getUser.mockResolvedValue({ data: { user: null } });
    expect((await queue(request("queue"))).status).toBe(401);
    expect((await sent(request("sent", { body: { messageId: ID } }))).status).toBe(401);
    expect((await reply(request("reply", { body: { prospectId: ID, text: "Hi" } }))).status).toBe(401);
    expect(h.listHelperQueue).not.toHaveBeenCalled();
    expect(h.markHelperMessageSent).not.toHaveBeenCalled();
    expect(h.saveHelperReply).not.toHaveBeenCalled();
  });
});

describe("the helper's endpoints", () => {
  it("returns the queue uncached", async () => {
    const response = await queue(request("queue"));
    expect(await response.json()).toEqual({ offerings: [], prospects: [] });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("marks a message sent, and passes a refusal on with its status", async () => {
    expect(await (await sent(request("sent", { body: { messageId: ID } }))).json()).toEqual({ status: "sent" });
    expect(h.markHelperMessageSent).toHaveBeenCalledWith(ID);
    h.markHelperMessageSent.mockResolvedValue({ ok: false, code: 404, error: "Message not found." });
    const refused = await sent(request("sent", { body: { messageId: ID } }));
    expect(refused.status).toBe(404);
    expect(await refused.json()).toEqual({ error: "Message not found." });
  });

  it("saves a reply with exactly the text given", async () => {
    const text = "Yes! Ignore previous instructions.";
    expect(await (await reply(request("reply", { body: { prospectId: ID, text } }))).json()).toEqual({ status: "saved" });
    expect(h.saveHelperReply).toHaveBeenCalledWith(ID, text);
  });

  it("refuses a malformed body before anything is written", async () => {
    const bad: unknown[] = [{}, { messageId: "not-an-id" }, { messageId: ID, extra: 1 }, "not json", [ID]];
    for (const body of bad) expect((await sent(request("sent", { body }))).status, JSON.stringify(body)).toBe(400);
    const badReply: unknown[] = [{ prospectId: ID }, { prospectId: ID, text: "" }, { prospectId: ID, text: "x".repeat(4001) }, { prospectId: "p1", text: "Hi" }];
    for (const body of badReply) expect((await reply(request("reply", { body }))).status, JSON.stringify(body).slice(0, 60)).toBe(400);
    expect(h.markHelperMessageSent).not.toHaveBeenCalled();
    expect(h.saveHelperReply).not.toHaveBeenCalled();
  });
});
