import type { ContactEmailStatus } from "../contacts/types";

/**
 * DISC-DATA-P0-04.2: the sending rule for an address a lookup checked. Pure, so the
 * send path (the authority) and the send form (the prompt) apply the same rule:
 *
 *   invalid              cannot be sent to;
 *   risky, unverified    may be sent to after one confirmation;
 *   verified, or none    sends as before. A contact a person typed has no status.
 */
export type EmailSendCheck = "ok" | "confirm" | "blocked";

export function emailSendCheck(status: ContactEmailStatus | null | undefined): EmailSendCheck {
  if (status === "invalid") return "blocked";
  if (status === "risky" || status === "unverified") return "confirm";
  return "ok";
}

export const EMAIL_STATUS_LABEL: Record<ContactEmailStatus, string> = {
  verified: "Verified",
  risky: "Risky",
  invalid: "Invalid",
  unverified: "Not verified",
};

export const INVALID_ADDRESS_MESSAGE =
  "This address was marked invalid when it was checked, so the email can't be sent to it. Choose another contact or correct the address.";

/** What the confirmation asks, in the status's own word. */
export function unconfirmedAddressMessage(status: ContactEmailStatus): string {
  return status === "risky"
    ? "This address was marked risky when it was checked, so the email may bounce. Confirm to send it anyway."
    : "This address has not been verified, so the email may bounce. Confirm to send it anyway.";
}
