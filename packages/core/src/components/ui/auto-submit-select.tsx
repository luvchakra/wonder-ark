"use client";

import type { ComponentProps } from "react";
import { useFormStatus } from "react-dom";
import { NativeSelect } from "./native-select";

/**
 * PLATFORM-NAV-P0-02.x -- a select that submits its own form when its value changes, so a
 * one-field form (a row's status or owner, a single filter) needs no Apply/Update button
 * beside it. The same `form.requestSubmit()` the audit log's filters and the Finance
 * period pickers already call inline; this is that, once.
 *
 * It only submits the form it sits in: what runs, and whether the user may run it, is
 * still the form's own action. Disabled while that action is in flight, so a second
 * change cannot overlap the first.
 */
export function AutoSubmitSelect({ onChange, disabled, ...props }: ComponentProps<"select">) {
  const { pending } = useFormStatus();
  return (
    <NativeSelect
      {...props}
      disabled={disabled || pending}
      aria-busy={pending}
      onChange={(event) => {
        onChange?.(event);
        event.currentTarget.form?.requestSubmit();
      }}
    />
  );
}
