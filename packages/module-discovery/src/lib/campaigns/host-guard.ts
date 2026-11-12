import { lookup as dnsLookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

/**
 * DISC-CAMP-P0-02.4: a mail server's host name is typed by a user, and this server then
 * connects to it. Without a check, "smtp host" is a way to make the platform open
 * connections inside its own network. So before any connection:
 *  - the name must be a plain DNS name (or a public IP), with no scheme, path or port;
 *  - it is resolved here, and refused if any address it resolves to is private,
 *    loopback, link-local, a cloud metadata address, or otherwise not a public unicast
 *    address;
 *  - the caller connects to the address returned here, not to the name again, so the
 *    name cannot resolve to something else between the check and the connection;
 *  - only the mail ports are allowed: 465 and 587 for SMTP, 993 for IMAP.
 */

export const SMTP_PORTS = [465, 587] as const;
export const IMAP_PORT = 993;

const blocked = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8], // "this network"
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, incl. the 169.254.169.254 metadata address
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // protocol assignments
  ["192.0.2.0", 24], // documentation
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // documentation
  ["203.0.113.0", 24], // documentation
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved, incl. broadcast
] as const) {
  blocked.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of [
  ["::", 128], // unspecified
  ["::1", 128], // loopback
  ["64:ff9b::", 96], // NAT64: reaches IPv4 addresses, private ones included
  ["100::", 64], // discard
  ["2001:db8::", 32], // documentation
  ["fc00::", 7], // unique local, incl. fd00:ec2::254 metadata
  ["fe80::", 10], // link-local
  ["ff00::", 8], // multicast
] as const) {
  blocked.addSubnet(network, prefix, "ipv6");
}

/** Whether an address is one this server may connect out to. */
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !blocked.check(address, "ipv4");
  if (family !== 6) return false;
  // An IPv4 address written as IPv6 is judged as the IPv4 address it is.
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(address);
  if (mapped) return isPublicAddress(mapped[1]!);
  if (/^::ffff:/i.test(address)) return false;
  return !blocked.check(address, "ipv6");
}

const HOST_NAME = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const INTERNAL_SUFFIXES = [".local", ".localhost", ".internal", ".lan", ".home", ".corp", ".intranet"];

export type HostLookup = (host: string) => Promise<{ address: string; family: number }[]>;

const systemLookup: HostLookup = (host) => dnsLookup(host, { all: true });

export type SafeHost =
  | { ok: true; host: string; address: string }
  | { ok: false; reason: "invalid_host" | "invalid_port" | "private_address" | "not_found" };

/** The words the page uses for a refusal. Fixed: nothing a server said is echoed. */
export const HOST_REFUSAL_MESSAGE: Record<Extract<SafeHost, { ok: false }>["reason"], string> = {
  invalid_host: "Enter the mail server's host name, such as smtp.example.com, without http:// or a port.",
  invalid_port: "Use port 465 or 587 for sending, and 993 for reading replies.",
  private_address: "That mail server's address is on a private network, so WonderArk won't connect to it.",
  not_found: "That mail server's host name couldn't be found.",
};

/**
 * Checks a user-supplied mail host and port, and returns the public address to connect
 * to. `lookup` is injected in tests; nothing here opens a connection.
 */
export async function resolveSafeHost(
  rawHost: string,
  port: number,
  allowedPorts: readonly number[],
  lookup: HostLookup = systemLookup,
): Promise<SafeHost> {
  if (!allowedPorts.includes(port)) return { ok: false, reason: "invalid_port" };
  const host = rawHost.trim().toLowerCase().replace(/\.$/, "");

  if (isIP(host) !== 0) {
    return isPublicAddress(host) ? { ok: true, host, address: host } : { ok: false, reason: "private_address" };
  }
  if (!HOST_NAME.test(host) || INTERNAL_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    return { ok: false, reason: "invalid_host" };
  }

  let addresses: { address: string; family: number }[];
  try {
    addresses = await lookup(host);
  } catch {
    return { ok: false, reason: "not_found" };
  }
  if (addresses.length === 0) return { ok: false, reason: "not_found" };
  // One private address among several is enough to refuse: which one a later connection
  // would pick is not ours to assume.
  if (!addresses.every((entry) => isPublicAddress(entry.address))) return { ok: false, reason: "private_address" };
  return { ok: true, host, address: addresses[0]!.address };
}
