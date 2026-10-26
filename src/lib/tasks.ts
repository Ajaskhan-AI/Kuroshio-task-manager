import type { Priority, Profile, Task, TaskStatus } from "../types";
import { parseLocalDate, todayStr } from "./utils";

export const STATUSES: { id: TaskStatus; label: string; cls: string }[] = [
  { id: "todo", label: "To Do", cls: "c-todo" },
  { id: "in_progress", label: "In Progress", cls: "c-prog" },
  { id: "in_review", label: "Review", cls: "c-review" },
  { id: "done", label: "Done", cls: "c-done" },
];
export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  in_review: "Review",
  done: "Done",
};

export const PRIORITIES: { id: Priority; label: string }[] = [
  { id: "critical", label: "Critical" },
  { id: "high", label: "High" },
  { id: "med", label: "Medium" },
  { id: "low", label: "Low" },
];
export const PRIORITY_LABEL: Record<Priority, string> = { critical: "Critical", high: "High", med: "Medium", low: "Low" };
const PRIORITY_ORDER: Record<Priority, number> = { critical: 0, high: 1, med: 2, low: 3 };

/** Done tasks untouched for this long drop out of the Done column (still reachable via "show older"). */
export const DONE_FRESH_DAYS = 7;
/** In-progress tasks untouched for this long count as "stuck". */
export const STUCK_DAYS = 5;
const DAY = 86400000;

export function normStatus(s: Task["status"]): TaskStatus {
  return s === "in_progress" || s === "in_review" || s === "done" ? s : "todo";
}
export function normPriority(p: Task["priority"]): Priority {
  return p === "critical" || p === "high" || p === "low" ? p : "med";
}

export type DueState = "over" | "today" | "soon" | "later";

export function dueInfo(d: string | null | undefined, done = false): { state: DueState; label: string } | null {
  if (!d) return null;
  const dt = parseLocalDate(d);
  const today = parseLocalDate(todayStr());
  const diff = Math.round((dt.getTime() - today.getTime()) / DAY);
  const short = dt.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  if (done) return { state: "later", label: short };
  if (diff < 0) return { state: "over", label: diff === -1 ? "Yesterday" : short };
  if (diff === 0) return { state: "today", label: "Today" };
  if (diff === 1) return { state: "soon", label: "Tomorrow" };
  if (diff < 7) return { state: "later", label: dt.toLocaleDateString(undefined, { weekday: "short" }) };
  return { state: "later", label: short };
}

export function isOverdue(t: Task): boolean {
  return normStatus(t.status) !== "done" && dueInfo(t.due_date)?.state === "over";
}
export function isStuck(t: Task): boolean {
  if (normStatus(t.status) !== "in_progress" || !t.updated_at) return false;
  return Date.now() - new Date(t.updated_at).getTime() > STUCK_DAYS * DAY;
}
export function isStaleDone(t: Task): boolean {
  if (normStatus(t.status) !== "done" || !t.updated_at) return false;
  return Date.now() - new Date(t.updated_at).getTime() > DONE_FRESH_DAYS * DAY;
}

/** Overdue first, then priority, then soonest due date (no date last). Done: most recent first. */
export function sortTasks(list: Task[]): Task[] {
  return [...list].sort((a, b) => {
    const sa = normStatus(a.status);
    const sb = normStatus(b.status);
    if (sa === "done" && sb === "done") return (b.updated_at || "").localeCompare(a.updated_at || "");
    const oa = isOverdue(a) ? 0 : 1;
    const ob = isOverdue(b) ? 0 : 1;
    if (oa !== ob) return oa - ob;
    const pa = PRIORITY_ORDER[normPriority(a.priority)];
    const pb = PRIORITY_ORDER[normPriority(b.priority)];
    if (pa !== pb) return pa - pb;
    const da = a.due_date || "9999-12-31";
    const db = b.due_date || "9999-12-31";
    return da.localeCompare(db);
  });
}

const PROJECT_COLORS = ["#1f54cc", "#0f9d6b", "#c2771d", "#7d4ba3", "#0b7a86", "#c0493b", "#4a6b2e", "#b5852e", "#2e7d9e"];
export function projectColor(name: string): string {
  let s = 0;
  for (let i = 0; i < name.length; i++) s = (s * 31 + name.toLowerCase().charCodeAt(i)) >>> 0;
  return PROJECT_COLORS[s % PROJECT_COLORS.length];
}

// ---------------------------------------------------------------------------
// Quick add: "Fix meter parser @parthiv !high fri #cbam"
// ---------------------------------------------------------------------------

export interface QuickAdd {
  title: string;
  assignees: string[];
  priority: Priority | null;
  due: string | null;
  project: string | null;
  unknownPeople: string[];
}

const PRIORITY_WORDS: Record<string, Priority> = {
  low: "low",
  med: "med",
  medium: "med",
  normal: "med",
  high: "high",
  urgent: "critical",
  critical: "critical",
  crit: "critical",
};
const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function iso(d: Date): string {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

function dayMonth(day: number, mon: number): string | null {
  if (mon < 0 || mon > 11 || day < 1 || day > 31) return null;
  const today = parseLocalDate(todayStr());
  let d = new Date(today.getFullYear(), mon, day);
  if (d.getMonth() !== mon) return null;
  if (d < today) d = new Date(today.getFullYear() + 1, mon, day); // "5 jan" in December means next year
  return iso(d);
}

/** Parses a date phrase made of one or two words. Returns null when it isn't a date. */
export function parseDuePhrase(phrase: string): string | null {
  const p = phrase.toLowerCase().trim();
  const today = parseLocalDate(todayStr());
  const plus = (n: number) => iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() + n));
  if (p === "today" || p === "eod") return plus(0);
  if (p === "tomorrow" || p === "tmr" || p === "tmrw") return plus(1);
  if (p === "next week") return plus(((8 - today.getDay()) % 7) || 7);
  let m = /^in (\d{1,3}) ?(d|days?|w|weeks?)$/.exec(p);
  if (m) return plus(+m[1] * (m[2].startsWith("w") ? 7 : 1));
  const wd = p.length >= 3 ? WEEKDAYS.findIndex((w) => fullWeekday(w).startsWith(p)) : -1; // fri, thurs, monday
  if (wd >= 0) return plus(((wd - today.getDay() + 7) % 7) || 7);
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(p);
  if (m) return p;
  m = /^(\d{1,2})[/.](\d{1,2})$/.exec(p); // 12/11 → 12 Nov (day first)
  if (m) return dayMonth(+m[1], +m[2] - 1);
  m = /^(\d{1,2}) ?([a-z]{3,9})$/.exec(p); // 12 nov, 12nov, 12 november
  if (m) return dayMonth(+m[1], MONTHS.indexOf(m[2].slice(0, 3)));
  m = /^([a-z]{3,9}) ?(\d{1,2})$/.exec(p); // nov 12
  if (m) return dayMonth(+m[2], MONTHS.indexOf(m[1].slice(0, 3)));
  return null;
}
function fullWeekday(w: string): string {
  return { sun: "sunday", mon: "monday", tue: "tuesday", wed: "wednesday", thu: "thursday", fri: "friday", sat: "saturday" }[w] || w;
}

function matchPerson(token: string, people: Profile[], userId: string): Profile | null {
  const t = token.toLowerCase();
  if (t === "me") return people.find((p) => p.id === userId) || null;
  const full = people.filter((p) => (p.full_name || "").toLowerCase().replace(/\s+/g, "") === t);
  if (full.length === 1) return full[0];
  const first = people.filter((p) => (p.full_name || "").toLowerCase().split(/\s+/)[0] === t);
  if (first.length === 1) return first[0];
  const prefix = people.filter((p) => (p.full_name || "").toLowerCase().replace(/\s+/g, "").startsWith(t));
  return prefix.length === 1 ? prefix[0] : null;
}

export function parseQuickAdd(input: string, people: Profile[], userId: string, projects: string[]): QuickAdd {
  const out: QuickAdd = { title: "", assignees: [], priority: null, due: null, project: null, unknownPeople: [] };
  const words: string[] = [];
  for (const tok of input.trim().split(/\s+/).filter(Boolean)) {
    if (tok.length > 1 && tok[0] === "@") {
      const p = matchPerson(tok.slice(1), people, userId);
      if (p) {
        if (!out.assignees.includes(p.id)) out.assignees.push(p.id);
      } else out.unknownPeople.push(tok.slice(1));
      continue;
    }
    if (tok.length > 1 && tok[0] === "!" && PRIORITY_WORDS[tok.slice(1).toLowerCase()]) {
      out.priority = PRIORITY_WORDS[tok.slice(1).toLowerCase()];
      continue;
    }
    if (tok.length > 1 && tok[0] === "#") {
      const raw = tok.slice(1).replace(/[-_]/g, " ");
      out.project = projects.find((x) => x.toLowerCase() === raw.toLowerCase()) || raw;
      continue;
    }
    words.push(tok);
  }
  // A date is only read from the END of the title, so "Fix sat comms" stays intact
  // while "Send report fri" or "Call client 12 nov" picks up a due date.
  for (const n of [3, 2, 1]) {
    if (words.length > n) {
      const d = parseDuePhrase(words.slice(-n).join(" "));
      if (d) {
        out.due = d;
        words.splice(words.length - n, n);
        break;
      }
    }
  }
  out.title = words.join(" ");
  return out;
}
