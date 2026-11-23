"use client";

import Link from "next/link";
import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";

/**
 * DISC-REACH-P0-01.1: one direct message on To do. WonderArk never sends on Instagram,
 * Facebook, LinkedIn or WhatsApp, so the card does the two things it can: "Copy and open"
 * puts the message on the clipboard and opens the channel's own page in a new tab, where
 * the person pastes and sends it; "Mark as sent" then records that they did. The link opens
 * even when the browser refuses the copy, and the card says so, so nothing is claimed that
 * didn't happen. The name opens the prospect, where the message can be edited.
 */
export function DmCard({
  name,
  detail,
  text,
  platform,
  profileLink,
  prospectHref,
  markSentAction,
}: {
  name: string;
  /** "2,741 followers" */
  detail: string | null;
  text: string;
  /** "Instagram" */
  platform: string;
  profileLink: string | null;
  prospectHref: string;
  markSentAction: () => void | Promise<void>;
}) {
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");

  async function copyText() {
    try {
      await navigator.clipboard.writeText(text);
      setCopy("copied");
    } catch {
      setCopy("failed");
    }
  }

  return (
    <li className="flex min-w-0 flex-col gap-2 rounded-lg border bg-card p-3 text-sm">
      <div className="flex min-w-0 items-baseline justify-between gap-3">
        <Link href={prospectHref} className="min-w-0 truncate font-medium hover:underline">
          {name}
        </Link>
        {detail ? <span className="shrink-0 text-xs text-muted-foreground">{detail}</span> : null}
      </div>
      <p className="line-clamp-3 whitespace-pre-wrap text-muted-foreground">{text}</p>
      <div className="flex flex-wrap items-center gap-2">
        {profileLink ? (
          <a
            href={profileLink}
            target="_blank"
            rel="noreferrer"
            onClick={() => void copyText()}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            Copy and open {platform}
            <ExternalLink className="size-3.5" aria-hidden="true" />
          </a>
        ) : (
          <button type="button" onClick={() => void copyText()} className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90">
            Copy message
          </button>
        )}
        <form action={markSentAction}>
          <SubmitButton size="sm" variant="outline" pendingText="Saving...">
            Mark as sent
          </SubmitButton>
        </form>
      </div>
      <p aria-live="polite" className="text-xs text-muted-foreground">
        {copy === "copied"
          ? "Copied. Paste it in a message there and send, then press Mark as sent."
          : copy === "failed"
            ? "Couldn't copy here: open the prospect, select the text and copy it."
            : "AI-generated. You send it yourself; WonderArk never sends on this platform."}
      </p>
    </li>
  );
}
