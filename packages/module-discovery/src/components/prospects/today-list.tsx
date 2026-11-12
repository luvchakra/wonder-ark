import Link from "next/link";
import { Button } from "@cofounderai/core/ui/button";
import type { AiActionState } from "@cofounderai/core/actions/ai-action-state";
import type { CampaignTasks } from "../../lib/campaigns/tasks";
import { STEP_CHANNEL_LABEL, TASK_DRAFT_LABEL, TEMPLATE_ORIGIN_LABEL, type TaskOutcome } from "../../lib/campaigns/types";
import type { TodayRow } from "../../lib/prospects/today";
import { TaskDoneButton } from "../campaigns/task-done-button";

/**
 * DISC-NAV-P0-01.2: the Today list at the top of Prospects. One line per thing that is
 * waiting, each with the single action that opens it; when nothing is waiting, one line
 * says so. The rows are built by `buildTodayList` from the offering's own prospects and
 * suggestions -- nothing here is estimated or sampled.
 *
 * Layout: the person's task on Prospects is to work the list below, so this stays a
 * short, quiet block above it: text on the left, the action on the right, the same on a
 * phone (the text wraps; the action keeps its place).
 *
 * DISC-CAMP-P0-06.1: a running campaign's call, WhatsApp and LinkedIn steps that are due
 * are rows here too, one per prospect, oldest first and a few at a time. Each shows who,
 * the number or page the step is done with (a link where there is one to open), the
 * draft with that prospect's details filled in and labelled with where its text came
 * from, and one action, "Mark done". WonderArk sends nothing for these, and no row says
 * it did.
 */
export function TodayList({
  rows,
  tasks,
  taskAction,
}: {
  rows: TodayRow[];
  tasks?: CampaignTasks;
  taskAction?: (enrollmentId: string) => (outcome: TaskOutcome) => Promise<AiActionState>;
}) {
  const due = taskAction ? (tasks?.tasks ?? []) : [];
  return (
    <section aria-labelledby="today-heading" className="rounded-lg border bg-card">
      <h2 id="today-heading" className="border-b px-4 py-2 text-sm font-medium">
        Today
      </h2>
      {rows.length === 0 && due.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">Nothing is waiting for you today.</p>
      ) : (
        <ul className="divide-y">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
              <span className="min-w-0">{row.text}</span>
              <Button asChild size="sm" variant="outline" className="shrink-0">
                <Link href={row.href}>{row.action}</Link>
              </Button>
            </li>
          ))}
          {due.map((task) => (
            <li key={task.enrollmentId} className="flex items-start justify-between gap-3 px-4 py-2 text-sm">
              <div className="flex min-w-0 flex-col gap-1">
                <span className="break-words">
                  {STEP_CHANNEL_LABEL[task.channel]} <span className="font-medium">{task.company}</span>
                  {": "}
                  {task.detail.href ? (
                    <a href={task.detail.href} className="underline underline-offset-2" {...(task.detail.href.startsWith("tel:") ? {} : { target: "_blank", rel: "noreferrer" })}>
                      {task.detail.text}
                    </a>
                  ) : (
                    task.detail.text
                  )}
                </span>
                <span className="text-xs text-muted-foreground">
                  {TASK_DRAFT_LABEL[task.channel]} · {TEMPLATE_ORIGIN_LABEL[task.origin]}
                </span>
                <p className="whitespace-pre-wrap break-words text-muted-foreground">{task.draft}</p>
              </div>
              <TaskDoneButton company={task.company} action={taskAction!(task.enrollmentId)} />
            </li>
          ))}
          {tasks && due.length > 0 && tasks.more > 0 ? (
            <li className="px-4 py-2 text-sm text-muted-foreground">
              {tasks.atLeast ? "At least " : ""}
              {tasks.more} more campaign {tasks.more === 1 ? "task is" : "tasks are"} due. {tasks.more === 1 ? "It appears" : "They appear"} here as these are marked done.
            </li>
          ) : null}
        </ul>
      )}
    </section>
  );
}
