"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardCheck, PartyPopper } from "lucide-react";
import { Button, buttonVariants } from "@cofounderai/core/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@cofounderai/core/ui/dialog";
import { fireConfetti } from "./confetti";

/**
 * The terminal celebration for the Overview -> ICP -> Prospects auto-populate flow
 * (see AutoPopulateStepBanner) -- rendered on the Prospects page once the last step's
 * own navigation carries `?autopopulated=<count>`. Fires the confetti burst exactly
 * once per landing (a ref guard, since `resultCount` is a stable prop for the whole
 * time this dialog is open) and shows the same guidance regardless of count: the
 * founder should review Overview/ICP/Prospects and re-run Discover themselves if this
 * one auto-found prospect isn't a good match, rather than auto-populate silently trying
 * again on their behalf.
 *
 * DISC-AI-APPROVAL-01: in "Review each step" the last step reports what is waiting for
 * the founder instead of a count (`icp_review`: the ICP is a draft, so nothing was
 * searched; `suggestions_review`: what AI found is on the Discover page, not yet a
 * prospect) -- no celebration, and the one button goes to where that review happens.
 */
const REVIEW_RESULTS = {
  icp_review: {
    title: "Your ideal customer is waiting for your review",
    body: "Approve it, then use Find to look for matching companies.",
    action: "Review ideal customer",
  },
  suggestions_review: {
    title: "AI found a prospect for your review",
    body: "It is under Find, in To review, and is added to Prospects only when you approve it.",
    action: "Review it",
  },
} as const;

export function AutoPopulateCompleteDialog({
  resultCount,
  basePath,
  icpHref,
}: {
  resultCount?: string;
  basePath: string;
  icpHref: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(Boolean(resultCount));
  const firedRef = useRef(false);

  const review = resultCount === "icp_review" || resultCount === "suggestions_review" ? REVIEW_RESULTS[resultCount] : null;

  useEffect(() => {
    if (!resultCount || firedRef.current) return;
    firedRef.current = true;
    setOpen(true);
    if (review) return;
    return fireConfetti();
  }, [resultCount, review]);

  if (!resultCount) return null;

  function close() {
    setOpen(false);
    router.replace(basePath);
  }

  if (review) {
    const href = resultCount === "icp_review" ? icpHref : `${basePath}/discover`;
    return (
      <Dialog open={open} onOpenChange={(next) => !next && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardCheck className="size-5 text-primary" aria-hidden="true" />
              {review.title}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{review.body}</p>
          <DialogFooter>
            <Link href={href} className={buttonVariants()}>
              {review.action}
            </Link>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PartyPopper className="size-5 text-primary" aria-hidden="true" />
            {resultCount === "0"
              ? "Auto-populate finished"
              : `Found ${resultCount} prospect${resultCount === "1" ? "" : "s"}!`}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          If you are not satisfied with the search results, please review Overview, ICP,
          Prospects pages to update information and perform Discover action under Prospects
          again.
        </p>
        <DialogFooter>
          <Button onClick={close}>Got it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
