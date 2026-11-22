"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

type PrepResult = { remaining: number; did: string | null; failedId?: string; error?: string; limitReached?: boolean; needsAiSetup?: boolean };

/**
 * DISC-AUTO-P0-01.1: prepares picked prospects by itself while the offering is open: one
 * step at a time (research, score, plan, first-message draft), each a short server call,
 * until none is left. Nothing is sent. Shows one line saying what it is doing, and says so
 * plainly when it stops on a failure or on used-up AI credits.
 */
export function PrepRunner({
  initialRemaining,
  prepareAction,
}: {
  initialRemaining: number;
  prepareAction: (skip: string[]) => Promise<PrepResult>;
}) {
  const router = useRouter();
  const [remaining, setRemaining] = useState(initialRemaining);
  const [last, setLast] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [stopped, setStopped] = useState<string | null>(null);
  const [setupLink, setSetupLink] = useState(false);
  // DISC-AUTO-P0-01.2: how many were skipped, so the end line never claims all are ready.
  const [skipped, setSkipped] = useState(0);
  const started = useRef(false);
  // The bound action and router change identity on every refresh; the loop reads the latest
  // through refs, so a refresh never restarts or stops it.
  const action = useRef(prepareAction);
  const routerRef = useRef(router);
  const unmounted = useRef(false);

  useEffect(() => {
    action.current = prepareAction;
    routerRef.current = router;
  });

  useEffect(() => {
    unmounted.current = false;
    return () => {
      unmounted.current = true;
    };
  }, []);

  useEffect(() => {
    if (started.current || initialRemaining === 0) return;
    started.current = true;
    const skip: string[] = [];
    (async () => {
      for (;;) {
        let result: PrepResult;
        try {
          result = await action.current(skip);
        } catch {
          if (!unmounted.current) setStopped("Preparation stopped: the server didn't answer. It carries on next time you open this offering.");
          return;
        }
        if (unmounted.current) return;
        if (result.failedId) {
          skip.push(result.failedId);
          setSkipped(skip.length);
          setProblem(result.error ?? null);
        }
        if (result.did) setLast(result.did);
        setRemaining(result.remaining);
        routerRef.current.refresh();
        if (result.limitReached) {
          setStopped(`Preparation stopped: ${result.error ?? "AI credits are used up."}`);
          setSetupLink(Boolean(result.needsAiSetup));
          return;
        }
        if (result.remaining === 0) return;
      }
    })();
  }, [initialRemaining]);

  if (initialRemaining === 0) return null;
  const done = remaining === 0 && !stopped;
  return (
    <div role="status" className="flex flex-col gap-0.5 rounded-lg border bg-card px-4 py-2.5 text-sm">
      {stopped ? (
        <span>
          {stopped}{" "}
          {setupLink ? (
            <Link href="/dashboard/settings/ai-provider" className="font-medium text-primary hover:underline">
              Fix the AI key
            </Link>
          ) : null}
        </span>
      ) : done ? (
        <span>
          {skipped === 0
            ? "All picked prospects are prepared. Their first messages are ready for you to send."
            : `Prepared what could be prepared. ${skipped} couldn't be and will be tried again next time you open this offering.`}
        </span>
      ) : (
        <span className="flex items-center gap-2">
          <Loader2 className="size-4 shrink-0 animate-spin text-primary" aria-hidden="true" />
          Preparing {remaining} {remaining === 1 ? "prospect" : "prospects"}: research, score, first message (AI). Nothing is sent.
        </span>
      )}
      {last && !done ? <span className="text-xs text-muted-foreground">Last: {last}</span> : null}
      {problem ? <span className="text-xs text-muted-foreground">{problem} Skipped for now.</span> : null}
    </div>
  );
}
