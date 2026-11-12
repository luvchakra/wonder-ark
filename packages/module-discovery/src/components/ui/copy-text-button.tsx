"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@cofounderai/core/ui/button";

/**
 * DISC-CONS-P0-02.2: copies a draft to the clipboard for the person to paste where they
 * choose. Copying is all it does: nothing is sent or posted. Says so when the browser
 * refuses (an insecure page, a denied permission), rather than claiming it copied.
 */
export function CopyTextButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("failed");
    }
  }
  return (
    <Button type="button" size="sm" variant="outline" onClick={copy} aria-live="polite">
      {state === "copied" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      {state === "copied" ? "Copied" : state === "failed" ? "Couldn't copy: select the text instead" : label}
    </Button>
  );
}
