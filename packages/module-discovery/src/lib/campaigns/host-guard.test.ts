/**
 * DISC-CAMP-P0-02.4: the guard on a user-supplied mail host. Nothing here opens a
 * connection; the DNS lookup is injected.
 */
import { describe, expect, it, vi } from "vitest";
import { IMAP_PORT, SMTP_PORTS, isPublicAddress, resolveSafeHost } from "./host-guard";

const resolvesTo = (...addresses: string[]) => vi.fn(async () => addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 })));

describe("isPublicAddress", () => {
  it.each([
    "127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.10", "169.254.169.254", "100.64.0.1", "0.0.0.0",
    "224.0.0.1", "255.255.255.255", "::1", "::", "fe80::1", "fc00::1", "fd00:ec2::254", "ff02::1",
    "::ffff:127.0.0.1", "::ffff:10.0.0.1", "::ffff:7f00:1", "64:ff9b::a00:1", "not-an-address", "",
  ])("refuses %s", (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });

  it.each(["8.8.8.8", "142.250.183.109", "172.32.0.1", "2607:f8b0:4004:c07::6d", "::ffff:8.8.8.8"])("allows %s", (address) => {
    expect(isPublicAddress(address)).toBe(true);
  });
});

describe("resolveSafeHost", () => {
  it("returns the public address to connect to, for the normalised name", async () => {
    const lookup = resolvesTo("142.250.183.109");
    expect(await resolveSafeHost(" SMTP.Example.com. ", 587, SMTP_PORTS, lookup)).toEqual({
      ok: true,
      host: "smtp.example.com",
      address: "142.250.183.109",
    });
    expect(lookup).toHaveBeenCalledWith("smtp.example.com");
  });

  it.each([25, 2525, 993, 80, 0])("refuses SMTP port %d before resolving anything", async (port) => {
    const lookup = resolvesTo("142.250.183.109");
    expect(await resolveSafeHost("smtp.example.com", port, SMTP_PORTS, lookup)).toEqual({ ok: false, reason: "invalid_port" });
    expect(lookup).not.toHaveBeenCalled();
  });

  it("allows only 993 for IMAP", async () => {
    expect(await resolveSafeHost("imap.example.com", 143, [IMAP_PORT], resolvesTo("8.8.8.8"))).toMatchObject({ ok: false, reason: "invalid_port" });
    expect(await resolveSafeHost("imap.example.com", 993, [IMAP_PORT], resolvesTo("8.8.8.8"))).toMatchObject({ ok: true });
  });

  it.each(["10.0.0.5", "127.0.0.1", "169.254.169.254", "192.168.0.20", "fd00::1"])("refuses a name that resolves to %s", async (address) => {
    expect(await resolveSafeHost("smtp.example.com", 465, SMTP_PORTS, resolvesTo(address))).toEqual({ ok: false, reason: "private_address" });
  });

  it("refuses when any one of several addresses is private", async () => {
    expect(await resolveSafeHost("smtp.example.com", 465, SMTP_PORTS, resolvesTo("8.8.8.8", "10.0.0.5"))).toEqual({
      ok: false,
      reason: "private_address",
    });
  });

  it("judges an IP literal directly, without a lookup", async () => {
    const lookup = resolvesTo("8.8.8.8");
    expect(await resolveSafeHost("127.0.0.1", 587, SMTP_PORTS, lookup)).toEqual({ ok: false, reason: "private_address" });
    expect(await resolveSafeHost("169.254.169.254", 587, SMTP_PORTS, lookup)).toEqual({ ok: false, reason: "private_address" });
    expect(await resolveSafeHost("8.8.4.4", 587, SMTP_PORTS, lookup)).toEqual({ ok: true, host: "8.8.4.4", address: "8.8.4.4" });
    expect(lookup).not.toHaveBeenCalled();
  });

  it.each([
    "localhost", "mailhost", "smtp.internal", "db.local", "http://smtp.example.com", "smtp.example.com:587", "smtp.example.com/path",
    "smtp example.com", "user@smtp.example.com", "", "-bad.example.com", "2130706433", "0x7f.0.0.1",
  ])("refuses %j as a host name without resolving it", async (host) => {
    const lookup = resolvesTo("8.8.8.8");
    const result = await resolveSafeHost(host, 587, SMTP_PORTS, lookup);
    expect(result.ok).toBe(false);
    expect(lookup).not.toHaveBeenCalled();
  });

  it("reports a name that does not resolve", async () => {
    const failing = vi.fn(async () => {
      throw new Error("ENOTFOUND");
    });
    expect(await resolveSafeHost("smtp.example.com", 587, SMTP_PORTS, failing)).toEqual({ ok: false, reason: "not_found" });
    expect(await resolveSafeHost("smtp.example.com", 587, SMTP_PORTS, resolvesTo())).toEqual({ ok: false, reason: "not_found" });
  });
});
