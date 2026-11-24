import { describe, expect, it } from "vitest";
import { updateEmailProviderConfigSchema } from "./platform-email-provider";

const validInput = {
  provider: "GoDaddy (SMTP)",
  fromEmail: "notifications@wonderark.com",
  replyTo: "support@wonderark.com",
  reason: "Recording our real ESP after the initial platform launch review.",
};

describe("updateEmailProviderConfigSchema (PLATFORM-P0-11.1)", () => {
  it("accepts a fully valid config", () => {
    const result = updateEmailProviderConfigSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("normalizes empty optional fields to null (provider not yet decided)", () => {
    const result = updateEmailProviderConfigSchema.safeParse({
      ...validInput,
      provider: "",
      fromEmail: "",
      replyTo: "",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.provider).toBeNull();
      expect(result.data.fromEmail).toBeNull();
      expect(result.data.replyTo).toBeNull();
    }
  });

  it("rejects a malformed from email", () => {
    const result = updateEmailProviderConfigSchema.safeParse({ ...validInput, fromEmail: "not-an-email" });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed reply-to address", () => {
    const result = updateEmailProviderConfigSchema.safeParse({ ...validInput, replyTo: "also not an email" });
    expect(result.success).toBe(false);
  });

  it("rejects a blank reason", () => {
    const result = updateEmailProviderConfigSchema.safeParse({ ...validInput, reason: "   " });
    expect(result.success).toBe(false);
  });

  it("trims whitespace around a provider label", () => {
    const result = updateEmailProviderConfigSchema.safeParse({ ...validInput, provider: "  SendGrid  " });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.provider).toBe("SendGrid");
  });

  it("rejects an overlong provider label", () => {
    const result = updateEmailProviderConfigSchema.safeParse({ ...validInput, provider: "x".repeat(121) });
    expect(result.success).toBe(false);
  });
});
