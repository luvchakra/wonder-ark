"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy } from "lucide-react";
import { Button } from "@cofounderai/core/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@cofounderai/core/ui/alert-dialog";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { toast } from "@cofounderai/core/ui/sonner";
import type { CloneableIcpSource } from "../../lib/icp/queries";

type CloneResult = { error: string } | { success: true };

/**
 * DISC-OFFER-P0-02.2's "ICP can be cloned" -- picks another offering's existing ICP and
 * copies it onto this one's, confirmed behind an `AlertDialog` since it overwrites
 * whatever ICP this offering already has (matching this platform's own "confirm an
 * irreversible overwrite" convention).
 */
export function CloneIcpButton({ sources, hasExistingIcp, cloneAction }: { sources: CloneableIcpSource[]; hasExistingIcp: boolean; cloneAction: (icpId: string) => Promise<CloneResult> }) {
  const router = useRouter();
  const [selectedIcpId, setSelectedIcpId] = useState(sources[0]?.icpId ?? "");
  const [pending, startTransition] = useTransition();

  function confirmClone() {
    startTransition(async () => {
      const result = await cloneAction(selectedIcpId);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      router.refresh();
      toast.success("Ideal customer cloned.");
    });
  }

  if (sources.length === 0) return null;

  return (
    <AlertDialog>
      <div className="flex items-center gap-2">
        <NativeSelect value={selectedIcpId} onChange={(e) => setSelectedIcpId(e.target.value)} className="h-8 w-auto text-xs">
          {sources.map((source) => (
            <option key={source.icpId} value={source.icpId}>
              {source.productName}
            </option>
          ))}
        </NativeSelect>
        <AlertDialogTrigger asChild>
          <Button variant="outline" size="sm" disabled={pending}>
            <Copy className="size-3.5" aria-hidden="true" />
            Clone ideal customer
          </Button>
        </AlertDialogTrigger>
      </div>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Clone this ideal customer?</AlertDialogTitle>
          <AlertDialogDescription>
            {hasExistingIcp
              ? "This replaces this offering's own ideal customer with a copy of the selected one. It's saved as a draft, so you can review and edit it before approving."
              : "This creates a new ideal customer for this offering as a copy of the selected one, saved as a draft for you to review and edit before approving."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={confirmClone}>Clone</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
