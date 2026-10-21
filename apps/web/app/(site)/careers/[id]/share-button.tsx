"use client";

import { useState } from "react";
import { Check, Share2 } from "lucide-react";

/**
 * PLATFORM-P1-13.1 -- share a job's own careers address. Uses the device's share sheet
 * where there is one; otherwise copies the link and says so.
 */
export function ShareButton({ title, path }: { title: string; path: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = new URL(path, window.location.origin).toString();
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, url });
        return;
      } catch (error) {
        // Closing the share sheet isn't a failure; anything else falls back to copying.
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt("Copy this link", url);
    }
  }

  return (
    <button
      type="button"
      onClick={share}
      className="inline-flex h-10 items-center gap-2 rounded-full border border-landing-surface-border bg-landing-surface px-5 text-sm font-medium text-landing-fg hover:border-landing-accent hover:text-landing-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-landing-accent"
    >
      {copied ? <Check className="size-4" aria-hidden="true" /> : <Share2 className="size-4" aria-hidden="true" />}
      <span aria-live="polite">{copied ? "Link copied" : "Share"}</span>
    </button>
  );
}
