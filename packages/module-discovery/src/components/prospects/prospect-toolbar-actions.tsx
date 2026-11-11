"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@cofounderai/core/ui/button";
import { AddProspectModal } from "./add-prospect-modal";

/**
 * The Prospects page's one action of its own: add a prospect by hand.
 *
 * DISC-NAV-P0-01.1: "Import CSV" and "Discover" used to sit beside it. Both are ways of
 * finding prospects, and both now live under the offering's Find tab (Search and
 * Import), so this page no longer repeats them.
 */
export function ProspectToolbarActions({
  createAction,
}: {
  createAction: (formData: FormData) => Promise<void>;
}) {
  const [addOpen, setAddOpen] = useState(false);

  return (
    <>
      <Button size="sm" className="px-2.5" onClick={() => setAddOpen(true)}>
        <Plus className="size-4" aria-hidden="true" />
        Add
      </Button>

      {addOpen ? (
        <AddProspectModal action={createAction} onClose={() => setAddOpen(false)} />
      ) : null}
    </>
  );
}
