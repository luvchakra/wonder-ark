import { beforeEach, describe, expect, it, vi } from "vitest";

/** DISC-CAMP-P0-07.1: Activate and Resume send the emails already due straight away. */
const h = vi.hoisted(() => ({
  after: vi.fn(),
  tick: vi.fn(),
  activate: vi.fn(),
  resume: vi.fn(),
  pause: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: h.after }));
vi.mock("@/lib/business-path", () => ({ businessPath: vi.fn(async () => "/biz") }));
vi.mock("@cofounderai/module-discovery/lib/campaigns/tick", () => ({ runCampaignTick: h.tick }));
vi.mock("@cofounderai/module-discovery/lib/campaigns/campaigns", () => ({
  activateCampaign: h.activate,
  resumeCampaign: h.resume,
  pauseCampaign: h.pause,
  confirmCampaignPreview: vi.fn(),
  createCampaign: vi.fn(),
  finishCampaign: vi.fn(),
  replaceCampaignSteps: vi.fn(),
  saveCampaignTemplate: vi.fn(),
  updateCampaignSettings: vi.fn(),
}));
vi.mock("@cofounderai/module-discovery/lib/campaigns/mailbox", () => ({ saveSenderMailbox: vi.fn(), sendMailboxTest: vi.fn() }));
vi.mock("@cofounderai/module-discovery/lib/campaigns/preview", () => ({ sendCampaignTest: vi.fn() }));
vi.mock("@cofounderai/module-discovery/lib/campaigns/tasks", () => ({ markTaskDone: vi.fn() }));
vi.mock("@cofounderai/module-discovery/lib/campaigns/write-messages", () => ({ writeCampaignMessages: vi.fn() }));

import { activateCampaignAction, pauseCampaignAction, resumeCampaignAction } from "./actions";

/** Runs whatever was handed to after(), as Next does once the response is sent. */
const runAfter = async () => {
  for (const [callback] of h.after.mock.calls) await callback();
};

beforeEach(() => {
  vi.clearAllMocks();
  h.tick.mockResolvedValue({ sent: 1 });
});

describe("campaign status actions", () => {
  it("Activate sends the first batch after the response", async () => {
    h.activate.mockResolvedValue({ status: "activated" });
    expect(await activateCampaignAction("b", "p", "c-1")).toBeNull();
    expect(h.tick).not.toHaveBeenCalled();
    await runAfter();
    expect(h.tick).toHaveBeenCalledWith({ campaignId: "c-1", maxSends: 5 });
  });

  it("Resume sends what is already due after the response, the same way", async () => {
    h.resume.mockResolvedValue({ status: "saved" });
    expect(await resumeCampaignAction("b", "p", "c-1")).toBeNull();
    await runAfter();
    expect(h.tick).toHaveBeenCalledWith({ campaignId: "c-1", maxSends: 5 });
  });

  it("a refused Resume sends nothing and says why", async () => {
    h.resume.mockResolvedValue({ status: "needs_preview", message: "Preview it first." });
    expect(await resumeCampaignAction("b", "p", "c-1")).toEqual({ error: "Preview it first." });
    expect(h.after).not.toHaveBeenCalled();
    expect(h.tick).not.toHaveBeenCalled();
  });

  it("Pause never sends", async () => {
    h.pause.mockResolvedValue({ status: "saved" });
    await pauseCampaignAction("b", "p", "c-1");
    expect(h.after).not.toHaveBeenCalled();
  });

  it("a failing batch is logged, not thrown at the person", async () => {
    h.resume.mockResolvedValue({ status: "saved" });
    h.tick.mockRejectedValue(new Error("smtp down"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await resumeCampaignAction("b", "p", "c-1")).toBeNull();
    await runAfter();
    expect(log).toHaveBeenCalledWith("The first campaign batch failed:", "smtp down");
  });
});
