"use client";

import { useTransition } from "react";
import { Fold } from "@cofounderai/core/ui/fold";
import { Switch } from "@cofounderai/core/ui/switch";
import { toast } from "@cofounderai/core/ui/sonner";
import type { TechnicianRosterRow } from "../../lib/employees/types";

/** No "Manage Users"/employee-CRUD screen exists anywhere in the platform yet -- this is
 * the minimal roster this story needs to make "assign to a technician" usable at all: a
 * business member either counts as a technician (has an active `core.employees` row)
 * or doesn't. A fuller employee record (job title, employment type, time-off) stays a
 * future story's job.
 *
 * PLATFORM-NAV-P0-02.1: who counts as a technician is set up once and rarely changed, so
 * the list sits behind one "Technicians" button under the calendar instead of showing a
 * switch for every team member on every visit. */
export function TechnicianRosterPanel({
  roster,
  toggleAction,
}: {
  roster: TechnicianRosterRow[];
  toggleAction: (userId: string, isTechnician: boolean) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();

  if (roster.length === 0) return null;

  return (
    <Fold label="Technicians" contentClassName="rounded-2xl border border-border p-4">
      <p className="text-xs text-muted-foreground">Who can be assigned schedule events.</p>
      <div className="mt-3 flex flex-col gap-2">
        {roster.map((m) => (
          <label key={m.user_id} className="flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">
              {m.full_name || m.email || m.user_id}
              <span className="ml-2 text-xs text-muted-foreground">{m.role}</span>
            </span>
            <Switch
              checked={m.is_active}
              disabled={pending}
              onCheckedChange={(checked) =>
                startTransition(async () => {
                  try {
                    await toggleAction(m.user_id, checked);
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Could not update technician status.");
                  }
                })
              }
            />
          </label>
        ))}
      </div>
    </Fold>
  );
}
