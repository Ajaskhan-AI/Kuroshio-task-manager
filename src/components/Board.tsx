import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sb } from "../lib/supabase";
import { useClickOutside } from "../lib/useClickOutside";
import { parseLocalDate, todayStr } from "../lib/utils";
import {
  PRIORITIES, PRIORITY_LABEL, PRIORITY_ORDER, STATUSES, STATUS_LABEL, canReview, distinct, fmtHours,
  isBlocked, isDone, isDueToday, isDueWithin, isOverdue, normPriority, normStatus, openPrereqs, subtaskProgress,
} from "../lib/tasks";
import { useWorkspace } from "../workspace";
import type { Priority, Task, TaskStatus } from "../types";
import { Empty } from "./common";

type View = "board" | "table";
type Quick = "all" | "mine" | "overdue" | "blocked" | "review";
type Deadline = "" | "overdue" | "today" | "week" | "none";

interface Filters {
  view: View;
  quick: Quick;
  assignee: string;
  status: "" | TaskStatus;
  priority: "" | Priority;
  deadline: Deadline;
  project: string;
  q: string;
}

const DEFAULT_FILTERS: Filters = { view: "board", quick: "all", assignee: "", status: "", priority: "", deadline: "", project: "", q: "" };
const STORE_KEY = "kuro-task-filters";

function loadFilters(): Filters {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return { ...DEFAULT_FILTERS, ...JSON.parse(raw), q: "" };
  } catch {
    /* storage unavailable */
  }
  return DEFAULT_FILTERS;
}

const COLUMNS: { id: TaskStatus; cls: string; countId: string }[] = [
  { id: "todo", cls: "c-todo", countId: "n-todo" },
  { id: "in_progress", cls: "c-prog", countId: "n-prog" },
  { id: "in_review", cls: "c-review", countId: "n-review" },
  { id: "done", cls: "c-done", countId: "n-done" },
];

const QUICK: { id: Quick; label: string }[] = [
  { id: "all", label: "All tasks" },
  { id: "mine", label: "My tasks" },
  { id: "overdue", label: "Overdue" },
  { id: "blocked", label: "Blocked" },
  { id: "review", label: "Pending reviews" },
];

function byPriorityThenDue(a: Task, b: Task) {
  const p = PRIORITY_ORDER[normPriority(a.priority)] - PRIORITY_ORDER[normPriority(b.priority)];
  if (p) return p;
  return (a.due_date || "9999").localeCompare(b.due_date || "9999");
}

export function Board() {
  const { tasks, isAdmin, user, ix, nameOf, people } = useWorkspace();
  const [f, setF] = useState<Filters>(loadFilters);
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ ...f, q: "" }));
    } catch {
      /* ignore */
    }
  }, [f]);

  const today = todayStr();
  const projects = useMemo(() => distinct(tasks, (t) => t.project), [tasks]);

  const matchesQuick = useCallback(
    (t: Task) => {
      switch (f.quick) {
        case "mine": return (t.assignee_ids || []).includes(user.id);
        case "overdue": return isOverdue(t, today);
        case "blocked": return isBlocked(t, ix);
        case "review": return !!ix.pendingByTask[t.id] && (canReview(t, user.id, isAdmin) || (t.assignee_ids || []).includes(user.id));
        default: return true;
      }
    },
    [f.quick, user.id, today, ix, isAdmin],
  );

  const quickCounts = useMemo(() => {
    const c: Record<Quick, number> = { all: tasks.length, mine: 0, overdue: 0, blocked: 0, review: 0 };
    tasks.forEach((t) => {
      if ((t.assignee_ids || []).includes(user.id) && !isDone(t)) c.mine++;
      if (isOverdue(t, today)) c.overdue++;
      if (isBlocked(t, ix)) c.blocked++;
      if (ix.pendingByTask[t.id] && (canReview(t, user.id, isAdmin) || (t.assignee_ids || []).includes(user.id))) c.review++;
    });
    return c;
  }, [tasks, user.id, today, ix, isAdmin]);

  const q = f.q.trim().toLowerCase();
  const filtered = tasks
    .filter(matchesQuick)
    .filter((t) => !f.assignee || (f.assignee === "none" ? !(t.assignee_ids || []).length : (t.assignee_ids || []).includes(f.assignee)))
    .filter((t) => !f.status || normStatus(t.status) === f.status)
    .filter((t) => !f.priority || normPriority(t.priority) === f.priority)
    .filter((t) => !f.project || (f.project === "none" ? !t.project : t.project === f.project))
    .filter((t) => {
      switch (f.deadline) {
        case "overdue": return isOverdue(t, today);
        case "today": return isDueToday(t, today);
        case "week": return isDueWithin(t, 7, today);
        case "none": return !t.due_date;
        default: return true;
      }
    })
    .filter((t) => !q || (t.title || "").toLowerCase().includes(q) || (t.description || "").toLowerCase().includes(q) || (t.tags || []).some((g) => g.toLowerCase().includes(q)))
    .sort(byPriorityThenDue);

  const anyFilter = !!(f.assignee || f.status || f.priority || f.deadline || f.project || q);

  return (
    <section>
      {isAdmin && <AddBar />}

      <div className="task-toolbar">
        <div className="quick-views" role="tablist" aria-label="Task views">
          {QUICK.map((v) => (
            <button key={v.id} role="tab" aria-selected={f.quick === v.id} className={"qv" + (f.quick === v.id ? " on" : "")} onClick={() => set("quick", v.id)}>
              {v.label}
              {v.id !== "all" && quickCounts[v.id] > 0 && <span className="qv-n">{quickCounts[v.id]}</span>}
            </button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="Layout">
          <button className={f.view === "board" ? "on" : ""} onClick={() => set("view", "board")}>▦ Board</button>
          <button className={f.view === "table" ? "on" : ""} onClick={() => set("view", "table")}>☰ Table</button>
        </div>
      </div>

      <div className="filters">
        <input className="field f-search" placeholder="Search title, description or tag…" value={f.q} onChange={(e) => set("q", e.target.value)} />
        <select className="field" aria-label="Assignee" value={f.assignee} onChange={(e) => set("assignee", e.target.value)}>
          <option value="">Anyone</option>
          <option value="none">Unassigned</option>
          {people.map((p) => <option key={p.id} value={p.id}>{p.full_name || "(no name)"}{p.id === user.id ? " (you)" : ""}</option>)}
        </select>
        <select className="field" aria-label="Status" value={f.status} onChange={(e) => set("status", e.target.value as Filters["status"])}>
          <option value="">Any status</option>
          {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <select className="field" aria-label="Priority" value={f.priority} onChange={(e) => set("priority", e.target.value as Filters["priority"])}>
          <option value="">Any priority</option>
          {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
        </select>
        <select className="field" aria-label="Deadline" value={f.deadline} onChange={(e) => set("deadline", e.target.value as Deadline)}>
          <option value="">Any deadline</option>
          <option value="overdue">Overdue</option>
          <option value="today">Due today</option>
          <option value="week">Due in 7 days</option>
          <option value="none">No due date</option>
        </select>
        <select className="field" aria-label="Project" value={f.project} onChange={(e) => set("project", e.target.value)}>
          <option value="">All projects</option>
          <option value="none">No project</option>
          {projects.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        {anyFilter && (
          <button className="link" onClick={() => setF((x) => ({ ...DEFAULT_FILTERS, view: x.view, quick: x.quick }))}>Clear filters</button>
        )}
      </div>

      {f.view === "board" ? (
        <div className="board board-4">
          {COLUMNS.map((col) => {
            const list = filtered.filter((t) => normStatus(t.status) === col.id);
            return (
              <section key={col.id} className={"col " + col.cls}>
                <div className="col-head">
                  <span className="dot" />
                  <h2>{STATUS_LABEL[col.id]}</h2>
                  <span className="count" id={col.countId}>{list.length}</span>
                </div>
                <div className="cards">
                  {list.length === 0 ? <Empty>Nothing here</Empty> : list.map((t) => <TaskCard key={t.id} task={t} />)}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <TaskTable tasks={filtered} nameOf={nameOf} />
      )}
    </section>
  );
}

// ---------------------------------------------------------------- card

export function TaskCard({ task: t }: { task: Task }) {
  const { user, isAdmin, nameOf, setTasks, loadTasks, openTask, ix } = useWorkspace();
  const st = normStatus(t.status);
  const ids = t.assignee_ids || [];
  const mine = ids.includes(user.id);
  const blocked = isBlocked(t, ix);
  const prog = subtaskProgress(t, ix);
  const pending = ix.pendingByTask[t.id];
  const reviewer = canReview(t, user.id, isAdmin);

  let who: string;
  if (mine) who = ids.length > 1 ? "You +" + (ids.length - 1) : "You";
  else if (ids.length) who = ids.slice(0, 2).map(nameOf).join(", ") + (ids.length > 2 ? " +" + (ids.length - 2) : "");
  else who = "Unassigned";

  async function setStatus(status: TaskStatus) {
    const prev = t.status;
    setTasks((ts) => ts.map((x) => (x.id === t.id ? { ...x, status } : x))); // optimistic
    const { error } = await sb.from("tasks").update({ status }).eq("id", t.id);
    if (error) {
      setTasks((ts) => ts.map((x) => (x.id === t.id ? { ...x, status: prev } : x)));
      alert(error.message);
      loadTasks();
    }
  }

  async function remove() {
    if (!window.confirm(`Delete “${t.title || "this task"}”? Its subtasks, discussion, submissions and time logs are deleted too.`)) return;
    const { error } = await sb.from("tasks").delete().eq("id", t.id);
    if (error) alert("Couldn't delete: " + error.message);
    else loadTasks();
  }

  const pr = normPriority(t.priority);
  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };

  return (
    <div
      className={"tcard" + (st === "done" ? " done" : "") + (blocked ? " is-blocked" : "")}
      onClick={() => openTask(t.id)}
      onKeyDown={(e) => e.key === "Enter" && e.target === e.currentTarget && openTask(t.id)}
      tabIndex={0}
      role="button"
      aria-label={"Open task " + (t.title || "")}
    >
      {t.project && <div className="t-project">{t.project}</div>}
      <p className="t-title">{t.title || "Untitled task"}</p>
      <div className="meta">
        <span className={mine ? "mine" : undefined}>{who}</span>
        <span className={"pill " + pr}>{PRIORITY_LABEL[pr]}</span>
        {t.due_date && <Due d={t.due_date} done={st === "done"} />}
        {prog.total > 0 && <span className="sub-prog" title="Subtasks done">☑ {prog.done}/{prog.total}</span>}
        {t.requires_approval && <span className="flag" title="Needs review before it's done">✓ review</span>}
        {t.recurrence !== "none" && <span className="flag" title={"Repeats " + t.recurrence}>↻ {t.recurrence}</span>}
        {blocked && <span className="flag flag-blocked" title={t.blocked_reason || "Waiting on: " + openPrereqs(t, ix).map((p) => p.title).join(", ")}>⛔ blocked</span>}
      </div>
      {(t.tags || []).length > 0 && (
        <div className="chips t-tags">
          {(t.tags || []).slice(0, 3).map((g) => <span key={g} className="chip">{g}</span>)}
        </div>
      )}
      <div className="actions">
        {(isAdmin || mine) && (
          <>
            {st !== "todo" && st !== "in_review" && <button className="mini" onClick={stop(() => setStatus("todo"))}>◀ To Do</button>}
            {st === "todo" && <button className="mini" onClick={stop(() => setStatus("in_progress"))}>Start ▶</button>}
            {st === "done" && <button className="mini" onClick={stop(() => setStatus("in_progress"))}>◀ In Progress</button>}
            {st !== "done" && st !== "in_review" && !t.requires_approval && (
              <button className="mini" onClick={stop(() => setStatus("done"))}>Done ✓</button>
            )}
            {st !== "done" && st !== "in_review" && t.requires_approval && mine && (
              <button className="mini" onClick={stop(() => openTask(t.id, "deliverables"))}>Submit ▶</button>
            )}
          </>
        )}
        {st === "in_review" && pending && reviewer && (
          <button className="mini mini-accent" onClick={stop(() => openTask(t.id, "deliverables"))}>Review</button>
        )}
        <button className="mini" onClick={stop(() => openTask(t.id, "discussion"))}>💬 Chat</button>
        {isAdmin && <button className="mini del" onClick={stop(remove)}>Delete</button>}
      </div>
    </div>
  );
}

export function Due({ d, done }: { d: string; done?: boolean }) {
  const dt = parseLocalDate(d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return (
    <span className={"due" + (!done && dt < today ? " over" : "")}>
      ◷ {dt.toLocaleDateString(undefined, { day: "numeric", month: "short" })}
    </span>
  );
}

// ---------------------------------------------------------------- table

type SortKey = "title" | "project" | "status" | "priority" | "start" | "due" | "estimate";

function TaskTable({ tasks, nameOf }: { tasks: Task[]; nameOf: (id: string) => string }) {
  const { openTask, ix } = useWorkspace();
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "due", dir: 1 });

  const sorted = [...tasks].sort((a, b) => {
    const d = sort.dir;
    switch (sort.key) {
      case "title": return d * (a.title || "").localeCompare(b.title || "");
      case "project": return d * (a.project || "~").localeCompare(b.project || "~");
      case "status": return d * (STATUSES.indexOf(normStatus(a.status)) - STATUSES.indexOf(normStatus(b.status)));
      case "priority": return d * (PRIORITY_ORDER[normPriority(a.priority)] - PRIORITY_ORDER[normPriority(b.priority)]);
      case "start": return d * (a.start_date || "9999").localeCompare(b.start_date || "9999");
      case "estimate": return d * ((a.estimate_hours ?? -1) - (b.estimate_hours ?? -1));
      default: return d * (a.due_date || "9999").localeCompare(b.due_date || "9999");
    }
  });

  const th = (key: SortKey, label: string) => (
    <th aria-sort={sort.key === key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button className="th-btn" onClick={() => setSort((s) => ({ key, dir: s.key === key ? ((-s.dir) as 1 | -1) : 1 }))}>
        {label} {sort.key === key ? (sort.dir === 1 ? "▲" : "▼") : ""}
      </button>
    </th>
  );

  if (!tasks.length) return <Empty style={{ marginTop: 20 }}>No tasks match these filters.</Empty>;

  return (
    <div className="table-wrap">
      <table className="ttable">
        <thead>
          <tr>
            {th("title", "Task")}
            {th("project", "Project")}
            <th>Assignees</th>
            {th("status", "Status")}
            {th("priority", "Priority")}
            {th("start", "Start")}
            {th("due", "Due")}
            {th("estimate", "Est.")}
            <th>Subtasks</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((t) => {
            const st = normStatus(t.status);
            const pr = normPriority(t.priority);
            const prog = subtaskProgress(t, ix);
            return (
              <tr key={t.id} onClick={() => openTask(t.id)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && openTask(t.id)}>
                <td className="tt-title">
                  {t.title || "Untitled task"}
                  {isBlocked(t, ix) && <span className="flag flag-blocked">⛔</span>}
                  {(t.tags || []).length > 0 && <div className="tt-tags">{(t.tags || []).join(" · ")}</div>}
                </td>
                <td>{t.project || <span className="muted">—</span>}</td>
                <td>{(t.assignee_ids || []).map(nameOf).join(", ") || <span className="muted">Unassigned</span>}</td>
                <td><span className={"st-badge st-" + st}>{STATUS_LABEL[st]}</span></td>
                <td><span className={"pill " + pr}>{PRIORITY_LABEL[pr]}</span></td>
                <td className="num">{t.start_date ? parseLocalDate(t.start_date).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "—"}</td>
                <td className="num">{t.due_date ? <Due d={t.due_date} done={st === "done"} /> : "—"}</td>
                <td className="num">{fmtHours(t.estimate_hours)}</td>
                <td className="num">{prog.total ? `${prog.done}/${prog.total}` : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------- quick add (admins)

function AddBar() {
  const { user, people, nameOf, loadTasks, openEditor } = useWorkspace();
  const [title, setTitle] = useState("");
  const [assignees, setAssignees] = useState<string[]>([]);
  const [due, setDue] = useState("");
  const [priority, setPriority] = useState<Priority>("med");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const msRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useClickOutside(msRef, open, close);

  function toggleAssignee(id: string, on: boolean) {
    setAssignees((a) => (on ? (a.includes(id) ? a : [...a, id]) : a.filter((x) => x !== id)));
  }

  async function add() {
    const tt = title.trim();
    if (!tt) return titleRef.current?.focus();
    setBusy(true);
    const { error } = await sb.from("tasks").insert({
      title: tt,
      assignee_ids: assignees,
      due_date: due || null,
      priority,
      status: "todo",
      created_by: user.id,
    });
    setBusy(false);
    if (error) return alert("Couldn't add task: " + error.message);
    setTitle("");
    setDue("");
    setAssignees([]);
    setOpen(false);
    titleRef.current?.focus();
    loadTasks();
  }

  const n = assignees.length;
  const label = n === 0 ? "Assign to…" : n === 1 ? nameOf(assignees[0]) : n + " people assigned";

  return (
    <div className="addbar">
      <input
        ref={titleRef}
        className="field"
        id="t-title"
        placeholder="New task — what needs doing?"
        maxLength={160}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && add()}
      />
      <div className="ms" id="t-assignee-ms" ref={msRef}>
        <button type="button" className="field ms-btn" onClick={() => setOpen((o) => !o)}>{label}</button>
        {open && (
          <div className="ms-panel">
            {people.map((m) => (
              <label key={m.id} className="ms-opt">
                <input type="checkbox" checked={assignees.includes(m.id)} onChange={(e) => toggleAssignee(m.id, e.target.checked)} />
                <span>{(m.full_name || "(no name)") + (m.id === user.id ? " (you)" : "")}</span>
              </label>
            ))}
          </div>
        )}
      </div>
      <input className="field" id="t-due" type="date" aria-label="Due date" value={due} onChange={(e) => setDue(e.target.value)} />
      <select className="field" id="t-priority" aria-label="Priority" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
        {PRIORITIES.slice().reverse().map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
      </select>
      <button className="btn" onClick={add} disabled={busy}>Add task</button>
      <button className="btn ghost" onClick={() => openEditor(null)} title="All fields: description, subtasks, dates, review, templates…">More options…</button>
    </div>
  );
}
