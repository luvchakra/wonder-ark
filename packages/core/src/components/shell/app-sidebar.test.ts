import { describe, expect, it } from "vitest";
import { inferModuleFromPath } from "./app-sidebar";

// E2E-DEF-009: the rail opens the section the URL names; Service and CRM used to be
// missing, so their pages fell back to whatever was last stored in localStorage.
describe("inferModuleFromPath", () => {
  it("maps every module's business-scoped URL to its module key", () => {
    expect(inferModuleFromPath("/acme/discovery/dashboard")).toBe("discovery");
    expect(inferModuleFromPath("/acme/inventory/products")).toBe("inventory");
    expect(inferModuleFromPath("/acme/service/jobs")).toBe("fsm");
    expect(inferModuleFromPath("/acme/fsm/jobs")).toBe("fsm");
    expect(inferModuleFromPath("/acme/crm/leads")).toBe("crm");
    expect(inferModuleFromPath("/acme/finance/accounts")).toBe("gst");
  });

  it("names no module for account-level and non-module pages", () => {
    expect(inferModuleFromPath("/dashboard")).toBeNull();
    expect(inferModuleFromPath("/platform/modules")).toBeNull();
    expect(inferModuleFromPath("/acme/admin/users")).toBeNull();
    expect(inferModuleFromPath("/acme/billing")).toBeNull();
    // PLATFORM-NAV-P0-03.2: the Business page is a row above the modules, in none of them.
    expect(inferModuleFromPath("/acme/business")).toBeNull();
  });
});
