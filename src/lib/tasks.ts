import type { Priority, Recurrence, Submission, Subtask, SubtaskStatus, Task, TaskDependency, TaskStatus } from "../types";
import { parseLocalDate, todayStr } from "./utils";

export const PRIORITIES: Priority[] = ["critical", "high", "med", "low"];
export const PRIORITY_ORDER: Record<Priority, number> = { critical: 0, high: 1, med: 2, low: 3 };
export const PRIORITY_LABEL: Record<Priority, string> = { critical: "Critical", high: "High", med: "Medium", low: "Low" };

export const STATUSES: TaskStatus[] = ["todo", "in_progress", "in_review", "done"];
export const STATUS_LABEL: Record<TaskStatus, string> = { todo: "To Do", in_progress: "In Progress", in_review: "In Review", done: "Done" };
export const SUBTASK_STATUS_LABEL: Record<SubtaskStatus, string> = { todo: "To Do", in_progress: "In Progress", done: "Done" };

export const RECURRENCE_LABEL: Record<Recurrence, string> = { none: "Does not repeat", daily: "Daily", weekly: "Weekly", monthly: "Monthly" };

export function normStatus(s: Task["status"]): TaskStatus {
  return s && (STATUSES as string[]).includes(s) ? s : "todo";
}
export function normPriority(p: Task["priority"]): Priority {
  return p && p in PRIORITY_ORDER ? p : "med";
}

export function isDone(t: Task): boolean {
  return normStatus(t.status) === "done";
}
export function isOverdue(t: Task, today = todayStr()): boolean {
  return !!t.due_date && !isDone(t) && t.due_date < today;
}
export function isDueToday(t: Task, today = todayStr()): boolean {
  return !!t.due_date && !isDone(t) && t.due_date === today;
}
/** Not done and due within the next `days` days (excluding overdue). */
export function isDueWithin(t: Task, days: number, today = todayStr()): boolean {
  if (!t.due_date || isDone(t) || t.due_date < today) return false;
  const limit = parseLocalDate(today);
  limit.setDate(limit.getDate() + days);
  return parseLocalDate(t.due_date) <= limit;
}

export interface TaskIndex {
  byId: Record<string, Task>;
  /** task id → ids it depends on */
  dependsOn: Record<string, string[]>;
  /** task id → ids that depend on it */
  dependents: Record<string, string[]>;
  subtasksByTask: Record<string, Subtask[]>;
  pendingByTask: Record<string, Submission>;
}

export function buildIndex(tasks: Task[], deps: TaskDependency[], subtasks: Subtask[], pending: Submission[]): TaskIndex {
  const byId: Record<string, Task> = {};
  tasks.forEach((t) => (byId[t.id] = t));
  const dependsOn: Record<string, string[]> = {};
  const dependents: Record<string, string[]> = {};
  deps.forEach((d) => {
    (dependsOn[d.task_id] ||= []).push(d.depends_on_id);
    (dependents[d.depends_on_id] ||= []).push(d.task_id);
  });
  const subtasksByTask: Record<string, Subtask[]> = {};
  subtasks.forEach((s) => (subtasksByTask[s.task_id] ||= []).push(s));
  Object.values(subtasksByTask).forEach((l) => l.sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at)));
  const pendingByTask: Record<string, Submission> = {};
  pending.forEach((s) => {
    const cur = pendingByTask[s.task_id];
    if (!cur || cur.created_at < s.created_at) pendingByTask[s.task_id] = s;
  });
  return { byId, dependsOn, dependents, subtasksByTask, pendingByTask };
}

/** Prerequisite tasks that are not finished yet. */
export function openPrereqs(t: Task, ix: TaskIndex): Task[] {
  return (ix.dependsOn[t.id] || []).map((id) => ix.byId[id]).filter((p): p is Task => !!p && !isDone(p));
}

export function isBlocked(t: Task, ix: TaskIndex): boolean {
  if (isDone(t)) return false;
  return !!(t.blocked_reason && t.blocked_reason.trim()) || openPrereqs(t, ix).length > 0;
}

export function canReview(t: Task, userId: string, isAdmin: boolean): boolean {
  return isAdmin || t.reviewer_id === userId;
}

export function subtaskProgress(t: Task, ix: TaskIndex): { done: number; total: number } {
  const list = ix.subtasksByTask[t.id] || [];
  return { done: list.filter((s) => s.status === "done").length, total: list.length };
}

export function fmtMinutes(min: number): string {
  if (!min) return "0h";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h && m ? `${h}h ${m}m` : h ? `${h}h` : `${m}m`;
}

export function fmtHours(h: number | null | undefined): string {
  if (h == null) return "—";
  return fmtMinutes(Math.round(Number(h) * 60));
}

export function parseTags(s: string): string[] {
  return Array.from(new Set(s.split(",").map((x) => x.trim()).filter(Boolean)));
}

/** Distinct, sorted, non-empty values of a text field across tasks (for filters + suggestions). */
export function distinct(tasks: Task[], pick: (t: Task) => string | null | undefined): string[] {
  return Array.from(new Set(tasks.map(pick).filter((x): x is string => !!x && !!x.trim()))).sort((a, b) => a.localeCompare(b));
}
