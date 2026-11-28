"use client";

import { useEffect, useRef, useState } from "react";

/**
 * DISC-DATA-P0-03.4 (owner, 2026-11-28): one box beside "To review (N)" that ticks or clears
 * every suggestion at once. It works on the form's own `ids` boxes, so what is sent is
 * still exactly what is ticked; it follows them too, showing ticked, empty or partly
 * ticked (indeterminate) as the person changes single boxes.
 */
export function SelectAllBox({ formId }: { formId: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"all" | "none" | "some">("all");

  useEffect(() => {
    const form = document.getElementById(formId);
    if (!form) return;
    const boxes = () => [...form.querySelectorAll<HTMLInputElement>('input[type="checkbox"][name="ids"]')];
    const sync = () => {
      const all = boxes();
      const ticked = all.filter((box) => box.checked).length;
      setState(ticked === 0 ? "none" : ticked === all.length ? "all" : "some");
    };
    sync();
    form.addEventListener("change", sync);
    return () => form.removeEventListener("change", sync);
  }, [formId]);

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === "some";
  }, [state]);

  function toggle() {
    const form = document.getElementById(formId);
    if (!form) return;
    const next = state !== "all";
    for (const box of form.querySelectorAll<HTMLInputElement>('input[type="checkbox"][name="ids"]')) box.checked = next;
    setState(next ? "all" : "none");
  }

  return (
    <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm text-muted-foreground">
      {state === "all" ? "Clear all" : "Select all"}
      <input ref={ref} type="checkbox" checked={state === "all"} onChange={toggle} aria-label="Select all to review" className="size-4" />
    </label>
  );
}
