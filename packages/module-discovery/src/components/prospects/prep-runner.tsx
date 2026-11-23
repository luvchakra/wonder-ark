"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pause, Play } from "lucide-react";
import { Button } from "@cofounderai/core/ui/button";
import { Progress } from "@cofounderai/core/ui/progress";
import { useAppPathname } from "@cofounderai/core/shell/org-address-context";

type PrepResult = {
  remaining: number;
  stepsLeft: number;
  did: string | null;
  failedId?: string;
  error?: string;
  limitReached?: boolean;
  needsAiSetup?: boolean;
};
type Candidate = { id: string; name: string; steps: number };
type Phase = "choose" | "running" | "paused" | "done" | "stopped";

/**
 * DISC-AUTO-P0-01.3: preparing picked prospects (research, score, plan, first-message
 * draft), only the ones the person chooses and only when they press Prepare, so no AI
 * credits are spent on prospects they didn't pick (owner, 2026-11-23). On To do it lists the
 * prospects still to prepare with a box each; elsewhere one line says how many and links to
 * To do. Running, it shows a progress bar of steps done and a Pause button; paused, Resume.
 * Each step is one short server call; Pause lets the step in flight finish and starts no
 * other. Stops, and says why, on a failure every prospect would hit (AI key, credits, daily
 * send limit); skips, and says why, a prospect that fails on its own.
 */
export function PrepRunner({
  candidates,
  prepareAction,
  todoPath,
  autoSend = false,
}: {
  candidates: Candidate[];
  prepareAction: (chosen: string[], skip: string[]) => Promise<PrepResult>;
  /** The offering's To do page, where the choosing happens. */
  todoPath: string;
  /** DISC-AUTO-P0-03.1: "Send automatically" is on: first emails go out as they are written. */
  autoSend?: boolean;
}) {
  const router = useRouter();
  const pathname = useAppPathname();
  const [phase, setPhase] = useState<Phase>("choose");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [total, setTotal] = useState(0);
  const [stepsLeft, setStepsLeft] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [last, setLast] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [stopped, setStopped] = useState<string | null>(null);
  const [setupLink, setSetupLink] = useState(false);
  const [skippedCount, setSkippedCount] = useState(0);

  // The loop reads the latest action, router and pause flag through refs, so a refresh
  // (which rebinds the action) never restarts or stops it.
  const action = useRef(prepareAction);
  const routerRef = useRef(router);
  const paused = useRef(false);
  const running = useRef(false);
  const unmounted = useRef(false);
  const chosen = useRef<string[]>([]);
  const skip = useRef<string[]>([]);

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

  async function loop() {
    if (running.current) return;
    running.current = true;
    try {
      for (;;) {
        if (paused.current || unmounted.current) return;
        let result: PrepResult;
        try {
          result = await action.current(chosen.current, skip.current);
        } catch {
          if (!unmounted.current) {
            setStopped("Preparation stopped: the server didn't answer. Press Prepare to try again.");
            setPhase("stopped");
          }
          return;
        }
        if (unmounted.current) return;
        if (result.failedId) {
          skip.current = [...skip.current, result.failedId];
          setSkippedCount(skip.current.length);
          setProblem(result.error ?? null);
        }
        if (result.did) setLast(result.did);
        setStepsLeft(result.stepsLeft);
        setRemaining(result.remaining);
        routerRef.current.refresh();
        if (result.limitReached) {
          setStopped(`Preparation stopped: ${result.error ?? "AI credits are used up."}`);
          setSetupLink(Boolean(result.needsAiSetup));
          setPhase("stopped");
          return;
        }
        if (result.remaining === 0) {
          setPhase("done");
          return;
        }
      }
    } finally {
      running.current = false;
    }
  }

  function start() {
    const ids = candidates.filter((c) => selected.has(c.id)).map((c) => c.id);
    if (ids.length === 0) return;
    const steps = candidates.filter((c) => selected.has(c.id)).reduce((sum, c) => sum + c.steps, 0);
    chosen.current = ids;
    skip.current = [];
    setSkippedCount(0);
    setProblem(null);
    setStopped(null);
    setLast(null);
    setTotal(steps);
    setStepsLeft(steps);
    setRemaining(ids.length);
    setSelected(new Set());
    paused.current = false;
    setPhase("running");
    void loop();
  }

  function pause() {
    paused.current = true;
    setPhase("paused");
  }

  function resume() {
    paused.current = false;
    setPhase("running");
    void loop();
  }

  const active = phase === "running" || phase === "paused";
  if (!active && phase !== "done" && phase !== "stopped" && candidates.length === 0) return null;

  // Away from To do, idle: one line pointing there.
  const onTodo = pathname === todoPath;
  if (phase === "choose" && !onTodo) {
    return (
      <p className="rounded-lg border bg-card px-4 py-2.5 text-sm">
        {candidates.length} {candidates.length === 1 ? "prospect" : "prospects"} to prepare.{" "}
        <Link href={todoPath} className="font-medium text-primary hover:underline">
          Choose on To do
        </Link>
      </p>
    );
  }

  const percent = total > 0 ? Math.round(((total - stepsLeft) / total) * 100) : 0;
  const allSelected = candidates.length > 0 && selected.size === candidates.length;

  return (
    <section aria-label="Prepare prospects" className="flex flex-col gap-3 rounded-lg border bg-card px-4 py-3 text-sm">
      {active ? (
        <>
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium">
              {phase === "paused" ? "Paused" : "Preparing"}: {remaining} {remaining === 1 ? "prospect" : "prospects"} left
            </span>
            {phase === "running" ? (
              <Button type="button" size="sm" variant="outline" onClick={pause} className="gap-1.5">
                <Pause className="size-4" aria-hidden="true" />
                Pause
              </Button>
            ) : (
              <Button type="button" size="sm" onClick={resume} className="gap-1.5">
                <Play className="size-4" aria-hidden="true" />
                Resume
              </Button>
            )}
          </div>
          <div role="status" className="flex flex-col gap-1">
            <Progress value={percent} aria-label={`${percent}% prepared`} />
            <span className="text-xs text-muted-foreground">
              {percent}% · {last ? `Last: ${last}` : "Starting"} · {autoSend ? "First emails are sent as they are written." : "Nothing is sent."}
            </span>
          </div>
          {problem ? <span className="text-xs text-muted-foreground">{problem} Skipped.</span> : null}
        </>
      ) : (
        <>
          {phase === "done" || phase === "stopped" ? (
            <p role="status">
              {phase === "stopped" ? (
                <>
                  {stopped}{" "}
                  {setupLink ? (
                    <Link href="/dashboard/settings/ai-provider" className="font-medium text-primary hover:underline">
                      Fix the AI key
                    </Link>
                  ) : null}
                </>
              ) : skippedCount === 0 ? (
                autoSend ? "Done. First emails were sent; anything else waits for you below." : "Done. Their first messages are ready for you to send below."
              ) : (
                `Done, except ${skippedCount} that couldn't be prepared. ${problem ?? ""}`
              )}
            </p>
          ) : null}
          {candidates.length > 0 ? (
            <>
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-medium">
                  Prepare prospects ({candidates.length}): research, score and a first message (AI)
                </span>
                <button
                  type="button"
                  onClick={() => setSelected(allSelected ? new Set() : new Set(candidates.map((c) => c.id)))}
                  className="shrink-0 text-xs font-medium text-primary hover:underline"
                >
                  {allSelected ? "Clear" : "Select all"}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Choose which ones. Each uses about three AI calls; nothing starts until you press Prepare.
              </p>
              <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                {candidates.map((c) => (
                  <li key={c.id}>
                    <label className="flex min-w-0 items-center gap-2 rounded-md px-1 py-1 hover:bg-accent/40">
                      <input
                        type="checkbox"
                        className="size-4 shrink-0"
                        checked={selected.has(c.id)}
                        onChange={() =>
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (next.has(c.id)) next.delete(c.id);
                            else next.add(c.id);
                            return next;
                          })
                        }
                      />
                      <span className="truncate">{c.name}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <Button type="button" size="sm" onClick={start} disabled={selected.size === 0} className="gap-1.5 self-start">
                <Play className="size-4" aria-hidden="true" />
                {selected.size === 0 ? "Prepare" : `Prepare ${selected.size}`}
              </Button>
            </>
          ) : null}
        </>
      )}
    </section>
  );
}
