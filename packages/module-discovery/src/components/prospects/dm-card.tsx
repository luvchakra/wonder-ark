"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { Textarea } from "@cofounderai/core/ui/textarea";
import type { AiActionState } from "@cofounderai/core/actions/ai-action-state";

type FormAction = (prevState: AiActionState, formData: FormData) => Promise<AiActionState>;

/**
 * DISC-REACH-P0-01.1: one direct message on the Prospects tab. WonderArk never sends on Instagram,
 * Facebook, LinkedIn or WhatsApp, so the card does the two things it can: "Copy and open"
 * puts the message on the clipboard and opens the channel's own page in a new tab, where
 * the person pastes and sends it; "Mark as sent" then records that they did. The link opens
 * even when the browser refuses the copy, and the card says so, so nothing is claimed that
 * didn't happen.
 *
 * DISC-REACH-P0-01.4: "Edit" opens the message in place: Save keeps the person's own text
 * (then marked as edited by them), "Rewrite with AI" writes it again in the current style.
 * Copy always takes the text as last saved.
 */
export function DmCard({
  name,
  detail,
  text,
  platform,
  profileLink,
  prospectHref,
  markSentAction,
  editAction,
  rewriteAction,
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
  editAction: FormAction;
  rewriteAction: FormAction;
}) {
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");
  const [editing, setEditing] = useState(false);
  const [edited, setEdited] = useState(false);
  const [message, setMessage] = useState(text);
  const [editState, saveAction] = useActionState<AiActionState, FormData>(async (prev, formData) => {
    const result = await editAction(prev, formData);
    if (!result) {
      setMessage(String(formData.get("content") ?? "").trim());
      setEdited(true);
      setEditing(false);
    }
    return result;
  }, null);
  const [rewriteState, rewrite] = useActionState<AiActionState, FormData>(async (prev, formData) => {
    const result = await rewriteAction(prev, formData);
    if (!result) {
      setEdited(false);
      setEditing(false);
    }
    return result;
  }, null);

  // A refresh brings the saved text (after a rewrite, the new one).
  useEffect(() => setMessage(text), [text]);

  async function copyText() {
    try {
      await navigator.clipboard.writeText(message);
      setCopy("copied");
    } catch {
      setCopy("failed");
    }
  }

  const error = editState?.error ?? rewriteState?.error ?? null;

  return (
    <li className="flex min-w-0 flex-col gap-2 rounded-lg border bg-card p-3 text-sm">
      <div className="flex min-w-0 items-baseline justify-between gap-3">
        <Link href={prospectHref} className="min-w-0 truncate font-medium hover:underline">
          {name}
        </Link>
        {detail ? <span className="shrink-0 text-xs text-muted-foreground">{detail}</span> : null}
      </div>
      {editing ? (
        <div className="flex flex-col gap-2">
          <form action={saveAction} className="flex flex-col gap-2">
            <Textarea name="content" defaultValue={message} rows={5} required aria-label={`Message to ${name}`} autoFocus />
            <div className="flex flex-wrap items-center gap-2">
              <SubmitButton size="sm" pendingText="Saving...">
                Save
              </SubmitButton>
              <button type="button" onClick={() => setEditing(false)} className="text-xs font-medium text-muted-foreground hover:underline">
                Cancel
              </button>
            </div>
          </form>
          <form action={rewrite}>
            <SubmitButton size="sm" variant="ghost" pendingText="Rewriting..." className="h-7 px-0 text-xs text-primary">
              Rewrite with AI
            </SubmitButton>
          </form>
        </div>
      ) : (
        <>
          <p className="whitespace-pre-wrap text-muted-foreground">{message}</p>
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
            <button type="button" onClick={() => setEditing(true)} className="text-xs font-medium text-primary hover:underline">
              Edit
            </button>
          </div>
        </>
      )}
      <p aria-live="polite" className="text-xs text-muted-foreground">
        {error
          ? error
          : copy === "copied"
            ? "Copied. Paste it in a message there and send, then press Mark as sent."
            : copy === "failed"
              ? "Couldn't copy here: press Edit, select the text and copy it."
              : `${edited ? "Edited by you" : "AI-generated"}. You send it yourself; WonderArk never sends on this platform.`}
      </p>
    </li>
  );
}
