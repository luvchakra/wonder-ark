import { describe, expect, it } from "vitest";
import { prospectProgress } from "./prospect-progress";

// DISC-NAV-P0-01.12
const done = (stage: Parameters<typeof prospectProgress>[0], outcome: "open" | "won" | "lost" = "open") =>
  prospectProgress(stage, outcome).filter((s) => s.done).map((s) => s.label);

describe("prospectProgress", () => {
  it("ticks nothing for a new prospect", () => {
    expect(done("new")).toEqual([]);
  });
  it("ticks Research and Score once scored, not Write while only a strategy exists", () => {
    expect(done("scored")).toEqual(["Research", "Score"]);
    expect(done("strategized")).toEqual(["Research", "Score"]);
  });
  it("ticks Write once a message is written, Send once sent, Reply once replied", () => {
    expect(done("messaged")).toEqual(["Research", "Score", "Write"]);
    expect(done("sent")).toEqual(["Research", "Score", "Write", "Send"]);
    expect(done("replied")).toEqual(["Research", "Score", "Write", "Send", "Reply"]);
  });
  it("ticks Won only for a won outcome", () => {
    expect(done("closed", "won")).toContain("Won");
    expect(done("closed", "lost")).not.toContain("Won");
  });
});
