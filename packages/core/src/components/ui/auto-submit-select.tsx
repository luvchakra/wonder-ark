"use client";

import { useRef, type ComponentProps } from "react";
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
 *
 * A choice made with the pointer submits at once. Arrow keys (and typing a letter) step a
 * closed select through its options, firing a change at each one; those are not choices
 * yet, so a keyboard change waits for Enter or for the field to lose focus and then
 * submits once. Otherwise arrowing from "new" to "won" would save every status between.
 */
export function AutoSubmitSelect({ onChange, onKeyDown, onKeyUp, onPointerDown, onBlur, disabled, ...props }: ComponentProps<"select">) {
  const { pending } = useFormStatus();
  const stepping = useRef(false);
  const waiting = useRef(false);
  const submit = (select: HTMLSelectElement) => {
    stepping.current = false;
    waiting.current = false;
    select.form?.requestSubmit();
  };
  return (
    <NativeSelect
      {...props}
      disabled={disabled || pending}
      aria-busy={pending}
      onPointerDown={(event) => {
        onPointerDown?.(event);
        stepping.current = false;
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (isSteppingKey(event.key)) stepping.current = true;
      }}
      onKeyUp={(event) => {
        onKeyUp?.(event);
        if (event.key === "Enter" && waiting.current) submit(event.currentTarget);
      }}
      onChange={(event) => {
        onChange?.(event);
        if (stepping.current) waiting.current = true;
        else submit(event.currentTarget);
      }}
      onBlur={(event) => {
        onBlur?.(event);
        if (waiting.current) submit(event.currentTarget);
      }}
    />
  );
}

/** Keys that move a closed select to another option without the user having settled on it. */
export function isSteppingKey(key: string): boolean {
  return /^(Arrow(Up|Down|Left|Right)|Home|End|PageUp|PageDown)$/.test(key) || key.length === 1;
}
