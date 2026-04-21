/**
 * Task scheduler.
 *
 * Rationale (methodology-critical): if the user picks which task to run
 * each session based on mood, every Phase-3 context correlation is
 * contaminated by selection bias. The app therefore picks the task, not
 * the user.
 *
 * Assignment rule:
 *   1. Pick the task with the oldest last-session timestamp (least
 *      recently completed).
 *   2. Ties broken randomly.
 *   3. If the user hasn't run a given task at all, that task is
 *      considered infinitely-old (runs first).
 *
 * Deferral tracking: if the user declines the assigned task, a Deferral
 * Record is saved (with telemetry) before another task is assigned. This
 * makes selection pressure itself observable in analysis.
 *
 * Manual override: the user CAN pick a specific task from a settings
 * screen, but any session created that way is flagged wasAssigned=false
 * and excluded from the primary analysis (it can still be inspected in
 * the raw-plot view).
 */

import type { Session, TaskId } from "../types";
import { TASK_DEFINITIONS } from "../types";

const ALL_TASKS: TaskId[] = ["gonogo", "stroop", "digitspan", "nback"];

/**
 * Pick the next task for the user to run.
 * @param sessions all prior sessions (any task), chronologically sorted
 * @param excluded optional: tasks to exclude from this draw (used when
 *        re-rolling after a deferral within the same app open)
 */
export function assignNextTask(
  sessions: Session[],
  excluded: TaskId[] = [],
): TaskId {
  const candidates = ALL_TASKS.filter((t) => !excluded.includes(t));
  const pool = candidates.length > 0 ? candidates : ALL_TASKS;

  // Build a map: taskId → last completed timestamp (ISO) or null if never run.
  const lastRun: Record<TaskId, string | null> = {
    gonogo: null,
    stroop: null,
    digitspan: null,
    nback: null,
  };
  for (const s of sessions) {
    const t = s.task;
    if (lastRun[t] === null || s.timestamp > lastRun[t]!) {
      lastRun[t] = s.timestamp;
    }
  }

  // Find tasks with the oldest last-run (null = infinitely old, goes first).
  let oldestValue: string | null = null;
  let oldestIsNull = false;
  for (const t of pool) {
    const lr = lastRun[t];
    if (lr === null) {
      oldestIsNull = true;
      break;
    }
  }

  let tied: TaskId[];
  if (oldestIsNull) {
    tied = pool.filter((t) => lastRun[t] === null);
  } else {
    for (const t of pool) {
      const lr = lastRun[t]!;
      if (oldestValue === null || lr < oldestValue) oldestValue = lr;
    }
    tied = pool.filter((t) => lastRun[t] === oldestValue);
  }

  return tied[Math.floor(Math.random() * tied.length)]!;
}

/**
 * Status line for the home screen. Describes why this task was chosen.
 */
export function explainAssignment(task: TaskId, sessions: Session[]): string {
  const nForThis = sessions.filter((s) => s.task === task).length;
  if (nForThis === 0) return `First time running ${TASK_DEFINITIONS[task].name}.`;
  const lastFor = [...sessions]
    .filter((s) => s.task === task)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];
  if (!lastFor) return "";
  const hoursAgo = Math.round(
    (Date.now() - new Date(lastFor.timestamp).getTime()) / (1000 * 60 * 60),
  );
  if (hoursAgo < 24) return `Last run ${hoursAgo} h ago — least recently run task.`;
  const days = Math.round(hoursAgo / 24);
  return `Last run ${days} day${days === 1 ? "" : "s"} ago — least recently run task.`;
}
