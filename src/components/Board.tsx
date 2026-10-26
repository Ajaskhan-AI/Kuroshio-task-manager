import { useCallback, useRef, useState } from "react";
import { sb } from "../lib/supabase";
import { useClickOutside } from "../lib/useClickOutside";
import { parseLocalDate } from "../lib/utils";
import { useWorkspace } from "../workspace";
import type { Priority, Task, TaskStatus } from "../types";
import { Empty } from "./common";

const PRIORITY_ORDER: Record<Priority, number> = { high: 0, med: 1, low: 2 };
const PRIORITY_LABEL: Record<Priority, string> = { high: "High", med: "Medium", low: "Low" };
const COLUMNS: { id: TaskStatus; label: string; cls: string; countId: string }[] = [
  { id: "todo", label: "To Do", cls: "c-todo", countId: "n-todo" },
  { id: "in_progress", label: "In Progress", cls: "c-prog", countId: "n-prog" },
  { id: "done", label: "Done", cls: "c-done", countId: "n-done" },
];

function normStatus(s: Task["status"]): TaskStatus {
  return s === "in_progress" || s === "done" ? s : "todo";
}

export function Board() {
  const { tasks, isAdmin } = useWorkspace();
  const sorted = [...tasks].sort(
    (a, b) => (PRIORITY_ORDER[a.priority as Priority] ?? 1) - (PRIORITY_ORDER[b.priority as Priority] ?? 1),
  );

  return (
    <section>
      {isAdmin && <AddBar />}
      <div className="board">
        {COLUMNS.map((col) => {
          const list = sorted.filter((t) => normStatus(t.status) === col.id);
          return (
            <section key={col.id} className={"col " + col.cls}>
              <div className="col-head">
                <span className="dot" />
                <h2>{col.label}</h2>
                <span className="count" id={col.countId}>{list.length}</span>
              </div>
              <div className="cards">
                {list.length === 0 ? <Empty>Nothing here</Empty> : list.map((t) => <TaskCard key={t.id} task={t} st={col.id} />)}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}

function TaskCard({ task: t, st }: { task: Task; st: TaskStatus }) {
  const { user, isAdmin, nameOf, setTasks, loadTasks, openChat } = useWorkspace();
  const ids = t.assignee_ids || [];
  const mine = ids.includes(user.id);

  let who: string;
  if (mine) who = ids.length > 1 ? "You +" + (ids.length - 1) : "You";
  else if (ids.length) who = ids.slice(0, 2).map(nameOf).join(", ") + (ids.length > 2 ? " +" + (ids.length - 2) : "");
  else who = "Unassigned";

  async function setStatus(status: TaskStatus) {
    setTasks((ts) => ts.map((x) => (x.id === t.id ? { ...x, status } : x))); // optimistic
    const { error } = await sb.from("tasks").update({ status }).eq("id", t.id);
    if (error) {
      console.warn(error);
      loadTasks();
    }
  }

  async function remove() {
    const { error } = await sb.from("tasks").delete().eq("id", t.id);
    if (error) console.warn(error);
    else loadTasks();
  }

  const pr: Priority = t.priority || "med";
  return (
    <div className={"tcard" + (st === "done" ? " done" : "")}>
      <p className="t-title">{t.title || "Untitled task"}</p>
      <div className="meta">
        <span className={mine ? "mine" : undefined}>{who}</span>
        <span className={"pill " + pr}>{PRIORITY_LABEL[pr] || "Medium"}</span>
        {t.due_date && <Due d={t.due_date} />}
      </div>
      <div className="actions">
        {(isAdmin || mine) && (
          <>
            {st !== "todo" && <button className="mini" onClick={() => setStatus("todo")}>◀ To Do</button>}
            {st !== "in_progress" && (
              <button className="mini" onClick={() => setStatus("in_progress")}>{st === "done" ? "◀ In Progress" : "Start ▶"}</button>
            )}
            {st !== "done" && <button className="mini" onClick={() => setStatus("done")}>Done ✓</button>}
          </>
        )}
        <button className="mini" onClick={() => openChat(t)}>💬 Chat</button>
        {isAdmin && <button className="mini del" onClick={remove}>Delete</button>}
      </div>
    </div>
  );
}

function Due({ d }: { d: string }) {
  const dt = parseLocalDate(d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return (
    <span className={"due" + (dt < today ? " over" : "")}>
      ◷ {dt.toLocaleDateString(undefined, { day: "numeric", month: "short" })}
    </span>
  );
}

function AddBar() {
  const { user, people, nameOf, loadTasks } = useWorkspace();
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
        <option value="low">Low</option>
        <option value="med">Medium</option>
        <option value="high">High</option>
      </select>
      <button className="btn" onClick={add} disabled={busy}>Add task</button>
    </div>
  );
}
