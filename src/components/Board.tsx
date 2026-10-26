import { useEffect, useMemo, useRef, useState } from "react";
import { sb } from "../lib/supabase";
import { useTaskActions } from "../lib/useTaskActions";
import {
  PRIORITY_LABEL,
  STATUSES,
  STATUS_LABEL,
  dueInfo,
  isOverdue,
  isStaleDone,
  isStuck,
  normPriority,
  normStatus,
  parseQuickAdd,
  projectColor,
  sortTasks,
} from "../lib/tasks";
import { useWorkspace } from "../workspace";
import type { Task, TaskStatus } from "../types";
import { Avatar, Empty, toast } from "./common";

type Scope = "mine" | "all";
type Flag = "overdue" | "review" | "blocked" | "stuck" | null;
type View = "board" | "list";

interface Filters {
  scope: Scope;
  person: string;
  project: string;
  flag: Flag;
  view: View;
}

const FILTER_KEY = "kuro-task-filters";

function loadFilters(isAdmin: boolean): Filters {
  const base: Filters = { scope: isAdmin ? "all" : "mine", person: "", project: "", flag: null, view: "board" };
  try {
    const raw = localStorage.getItem(FILTER_KEY);
    if (raw) return { ...base, ...JSON.parse(raw), flag: null };
  } catch {
    /* storage unavailable */
  }
  return base;
}

function isTyping(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
}

export function Board() {
  const { tasks, isAdmin, user, people, projects } = useWorkspace();
  const [f, setF] = useState<Filters>(() => loadFilters(isAdmin));
  const [q, setQ] = useState("");
  const [mobileCol, setMobileCol] = useState<TaskStatus>("todo");
  const searchRef = useRef<HTMLInputElement>(null);
  const addRef = useRef<HTMLInputElement>(null);

  const set = (patch: Partial<Filters>) => setF((x) => ({ ...x, ...patch }));

  useEffect(() => {
    try {
      const { flag: _flag, ...keep } = f;
      void _flag;
      localStorage.setItem(FILTER_KEY, JSON.stringify(keep));
    } catch {
      /* storage unavailable */
    }
  }, [f]);

  // "/" → search, "n" → new task
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey || document.querySelector(".drawer")) return;
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "n" && addRef.current) {
        e.preventDefault();
        addRef.current.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Base filter (scope / person / project / search) — the stats strip counts within this.
  const base = useMemo(() => {
    const term = q.trim().toLowerCase();
    return tasks.filter((t) => {
      const ids = t.assignee_ids || [];
      if (f.scope === "mine" && !ids.includes(user.id)) return false;
      if (f.scope === "all" && f.person && !ids.includes(f.person)) return false;
      if (f.project && (t.project || "").toLowerCase() !== f.project.toLowerCase()) return false;
      if (term && !((t.title || "") + " " + (t.description || "") + " " + (t.project || "")).toLowerCase().includes(term)) return false;
      return true;
    });
  }, [tasks, f.scope, f.person, f.project, q, user.id]);

  const stats = useMemo(() => {
    const open = base.filter((t) => normStatus(t.status) !== "done");
    return {
      open: open.length,
      overdue: open.filter(isOverdue).length,
      review: open.filter((t) => normStatus(t.status) === "in_review").length,
      blocked: open.filter((t) => (t.blocked_reason || "").trim()).length,
      stuck: open.filter(isStuck).length,
    };
  }, [base]);

  const visible = useMemo(() => {
    const list = base.filter((t) => {
      switch (f.flag) {
        case "overdue":
          return isOverdue(t);
        case "review":
          return normStatus(t.status) === "in_review";
        case "blocked":
          return !!(t.blocked_reason || "").trim() && normStatus(t.status) !== "done";
        case "stuck":
          return isStuck(t);
        default:
          return true;
      }
    });
    return sortTasks(list);
  }, [base, f.flag]);

  const filtered = f.flag || q.trim() || f.project || (f.scope === "all" && f.person);

  return (
    <section className="tasks">
      <div className="tb-row">
        <div className="seg small" role="radiogroup" aria-label="Whose tasks">
          <button role="radio" aria-checked={f.scope === "mine"} className={f.scope === "mine" ? "on" : ""} onClick={() => set({ scope: "mine" })}>My tasks</button>
          <button role="radio" aria-checked={f.scope === "all"} className={f.scope === "all" ? "on" : ""} onClick={() => set({ scope: "all" })}>Everyone</button>
        </div>
        {f.scope === "all" && (
          <select className="field slim auto" aria-label="Filter by person" value={f.person} onChange={(e) => set({ person: e.target.value })}>
            <option value="">All people</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>{p.full_name || "(no name)"}</option>
            ))}
          </select>
        )}
        {projects.length > 0 && (
          <select className="field slim auto" aria-label="Filter by project" value={f.project} onChange={(e) => set({ project: e.target.value })}>
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        )}
        <div className="search">
          <input ref={searchRef} className="field slim" type="search" placeholder="Search tasks  ( / )" aria-label="Search tasks" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="seg small view-toggle" role="radiogroup" aria-label="View">
          <button role="radio" aria-checked={f.view === "board"} className={f.view === "board" ? "on" : ""} onClick={() => set({ view: "board" })}>Board</button>
          <button role="radio" aria-checked={f.view === "list"} className={f.view === "list" ? "on" : ""} onClick={() => set({ view: "list" })}>List</button>
        </div>
      </div>

      <div className="stats" role="group" aria-label="Quick filters">
        <Stat label="Open" n={stats.open} active={!f.flag} onClick={() => set({ flag: null })} />
        <Stat label="Overdue" n={stats.overdue} tone="danger" active={f.flag === "overdue"} onClick={() => set({ flag: f.flag === "overdue" ? null : "overdue" })} />
        <Stat label="In review" n={stats.review} tone="review" active={f.flag === "review"} onClick={() => set({ flag: f.flag === "review" ? null : "review" })} />
        <Stat label="Blocked" n={stats.blocked} tone="danger" active={f.flag === "blocked"} onClick={() => set({ flag: f.flag === "blocked" ? null : "blocked" })} />
        <Stat label="Stuck 5d+" n={stats.stuck} tone="warn" active={f.flag === "stuck"} onClick={() => set({ flag: f.flag === "stuck" ? null : "stuck" })} />
        {filtered && (
          <button
            className="link clear-f"
            onClick={() => {
              setQ("");
              set({ flag: null, project: "", person: "" });
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      {isAdmin && <QuickAdd inputRef={addRef} />}

      {f.view === "board" ? (
        <BoardView tasks={visible} mobileCol={mobileCol} setMobileCol={setMobileCol} />
      ) : (
        <ListView tasks={visible} />
      )}
    </section>
  );
}

function Stat({ label, n, tone, active, onClick }: { label: string; n: number; tone?: "danger" | "warn" | "review"; active: boolean; onClick: () => void }) {
  return (
    <button className={"stat" + (tone ? " " + tone : "") + (active ? " on" : "") + (n === 0 ? " zero" : "")} aria-pressed={active} onClick={onClick}>
      <b>{n}</b>
      <span>{label}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Board view
// ---------------------------------------------------------------------------

function BoardView({ tasks, mobileCol, setMobileCol }: { tasks: Task[]; mobileCol: TaskStatus; setMobileCol: (s: TaskStatus) => void }) {
  const { tasks: all } = useWorkspace();
  const { canMove, update } = useTaskActions();
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<TaskStatus | null>(null);
  const [showOld, setShowOld] = useState(false);

  const byCol = useMemo(() => {
    const m: Record<TaskStatus, Task[]> = { todo: [], in_progress: [], in_review: [], done: [] };
    tasks.forEach((t) => m[normStatus(t.status)].push(t));
    return m;
  }, [tasks]);

  function drop(col: TaskStatus) {
    setOver(null);
    const t = all.find((x) => x.id === dragId);
    setDragId(null);
    if (!t || normStatus(t.status) === col) return;
    if (!canMove(t)) return toast("Only the people assigned to this task can move it.", "error");
    update(t.id, { status: col });
  }

  return (
    <>
      <div className="col-tabs" role="tablist" aria-label="Columns">
        {STATUSES.map((s) => (
          <button key={s.id} role="tab" aria-selected={mobileCol === s.id} className={s.cls + (mobileCol === s.id ? " on" : "")} onClick={() => setMobileCol(s.id)}>
            <span className="dot" />
            {s.label}
            <span className="n">{s.id === "done" ? byCol.done.filter((t) => showOld || !isStaleDone(t)).length : byCol[s.id].length}</span>
          </button>
        ))}
      </div>
      <div className="board" data-active={mobileCol}>
        {STATUSES.map((col) => {
          let list = byCol[col.id];
          let hidden = 0;
          if (col.id === "done" && !showOld) {
            hidden = list.filter(isStaleDone).length;
            list = list.filter((t) => !isStaleDone(t));
          }
          return (
            <section
              key={col.id}
              data-col={col.id}
              className={"col " + col.cls + (over === col.id ? " drop" : "")}
              onDragOver={(e) => {
                if (!dragId) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (over !== col.id) setOver(col.id);
              }}
              onDragLeave={(e) => {
                if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setOver(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                drop(col.id);
              }}
            >
              <div className="col-head">
                <span className="dot" />
                <h2>{col.label}</h2>
                <span className="count">{list.length}</span>
              </div>
              <div className="cards">
                {list.length === 0 ? (
                  <Empty>{dragId ? "Drop here" : col.id === "in_review" ? "Nothing waiting for review" : "Nothing here"}</Empty>
                ) : (
                  list.map((t) => (
                    <TaskCard
                      key={t.id}
                      task={t}
                      draggable={canMove(t)}
                      dragging={dragId === t.id}
                      onDragStart={() => setDragId(t.id)}
                      onDragEnd={() => {
                        setDragId(null);
                        setOver(null);
                      }}
                    />
                  ))
                )}
                {col.id === "done" && (hidden > 0 || showOld) && (
                  <button className="link show-old" onClick={() => setShowOld((s) => !s)}>
                    {showOld ? "Hide older done tasks" : `Show ${hidden} older (done 7+ days ago)`}
                  </button>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}

interface CardProps {
  task: Task;
  draggable: boolean;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
}

function TaskCard({ task: t, draggable, dragging, onDragStart, onDragEnd }: CardProps) {
  const { openTask, checks, unseen } = useWorkspace();
  const st = normStatus(t.status);
  const pr = normPriority(t.priority);
  const due = dueInfo(t.due_date, st === "done");
  const chk = checks[t.id];
  const blocked = !!(t.blocked_reason || "").trim() && st !== "done";
  const stuck = isStuck(t);

  return (
    <article
      className={"tcard" + (st === "done" ? " done" : "") + (dragging ? " dragging" : "") + (blocked ? " blocked" : "")}
      style={t.project ? { ["--pc" as string]: projectColor(t.project) } : undefined}
      data-project={t.project ? "1" : undefined}
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", t.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      tabIndex={0}
      role="button"
      aria-label={(t.title || "Untitled task") + ", " + STATUS_LABEL[st]}
      onClick={() => openTask(t.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openTask(t.id);
        }
      }}
    >
      {(t.project || pr === "high" || pr === "critical") && (
        <div className="c-top">
          {t.project && <span className="c-proj">{t.project}</span>}
          {(pr === "high" || pr === "critical") && <span className={"pri pri-" + pr}>{PRIORITY_LABEL[pr]}</span>}
        </div>
      )}
      <p className="t-title">{t.title || "Untitled task"}</p>
      {blocked && <p className="c-flag blocked">⛔ Blocked · {t.blocked_reason}</p>}
      {!blocked && stuck && <p className="c-flag stuck">No update for 5+ days</p>}
      <div className="c-foot">
        <AvatarStack ids={t.assignee_ids || []} />
        {chk && chk.total > 0 && (
          <span className={"c-meta" + (chk.done === chk.total ? " ok" : "")} title="Checklist">
            ☑ {chk.done}/{chk.total}
          </span>
        )}
        {unseen.has(t.id) && (
          <button
            className="c-chat"
            title="New messages"
            aria-label="New messages"
            onClick={(e) => {
              e.stopPropagation();
              openTask(t.id, "chat");
            }}
          >
            💬<span className="new-dot" />
          </button>
        )}
        {due && <span className={"due-chip " + due.state}>{due.state === "over" ? "Overdue · " + due.label : due.label}</span>}
      </div>
    </article>
  );
}

function AvatarStack({ ids, max = 3 }: { ids: string[]; max?: number }) {
  const { peopleById, user } = useWorkspace();
  if (ids.length === 0) return <span className="c-meta muted">Unassigned</span>;
  const names = ids.map((id) => (id === user.id ? "You" : peopleById[id]?.full_name || "Someone")).join(", ");
  return (
    <span className="avs" title={names} aria-label={"Assigned to " + names}>
      {ids.slice(0, max).map((id) => (
        <Avatar key={id} person={peopleById[id] || { id, full_name: "?" }} size={24} />
      ))}
      {ids.length > max && <span className="av more">+{ids.length - max}</span>}
    </span>
  );
}

// ---------------------------------------------------------------------------
// List view
// ---------------------------------------------------------------------------

function ListView({ tasks }: { tasks: Task[] }) {
  const { openTask } = useWorkspace();
  const [showOld, setShowOld] = useState(false);
  const stale = tasks.filter(isStaleDone).length;
  const rows = showOld ? tasks : tasks.filter((t) => !isStaleDone(t));
  const order: Record<TaskStatus, number> = { in_review: 0, in_progress: 1, todo: 2, done: 3 };
  const sorted = [...rows].sort((a, b) => order[normStatus(a.status)] - order[normStatus(b.status)]);

  if (sorted.length === 0) return <Empty style={{ marginTop: 24 }}>No tasks match.</Empty>;

  return (
    <div className="tlist" role="table" aria-label="Tasks">
      <div className="tl-row tl-head" role="row">
        <span role="columnheader">Task</span>
        <span role="columnheader">Status</span>
        <span role="columnheader">Assignees</span>
        <span role="columnheader">Due</span>
        <span role="columnheader">Priority</span>
      </div>
      {sorted.map((t) => {
        const st = normStatus(t.status);
        const pr = normPriority(t.priority);
        const due = dueInfo(t.due_date, st === "done");
        return (
          <div
            key={t.id}
            className={"tl-row" + (st === "done" ? " done" : "")}
            role="row"
            tabIndex={0}
            onClick={() => openTask(t.id)}
            onKeyDown={(e) => e.key === "Enter" && openTask(t.id)}
          >
            <span className="tl-title" role="cell">
              {t.project && <span className="c-proj" style={{ ["--pc" as string]: projectColor(t.project) }}>{t.project}</span>}
              <span className="tt">{t.title || "Untitled task"}</span>
              {(t.blocked_reason || "").trim() && st !== "done" && <span className="c-flag blocked inline">Blocked</span>}
            </span>
            <span role="cell">
              <span className={"st-tag " + STATUSES.find((s) => s.id === st)!.cls}>
                <span className="dot" />
                {STATUS_LABEL[st]}
              </span>
            </span>
            <span role="cell">
              <AvatarStack ids={t.assignee_ids || []} />
            </span>
            <span role="cell">{due ? <span className={"due-chip " + due.state}>{due.label}</span> : <span className="muted">—</span>}</span>
            <span role="cell">
              <span className={"pri pri-" + pr}>{PRIORITY_LABEL[pr]}</span>
            </span>
          </div>
        );
      })}
      {(stale > 0 || showOld) && (
        <button className="link show-old" onClick={() => setShowOld((s) => !s)}>
          {showOld ? "Hide older done tasks" : `Show ${stale} older done tasks`}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quick add (admins)
// ---------------------------------------------------------------------------

function QuickAdd({ inputRef }: { inputRef: React.RefObject<HTMLInputElement> }) {
  const { user, people, peopleById, projects, loadTasks, openTask } = useWorkspace();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [help, setHelp] = useState(false);
  const parsed = useMemo(() => parseQuickAdd(text, people, user.id, projects), [text, people, user.id, projects]);
  const hasTokens = parsed.assignees.length || parsed.priority || parsed.due || parsed.project || parsed.unknownPeople.length;

  async function add() {
    if (!parsed.title) return inputRef.current?.focus();
    setBusy(true);
    const { data, error } = await sb
      .from("tasks")
      .insert({
        title: parsed.title,
        assignee_ids: parsed.assignees,
        due_date: parsed.due,
        priority: parsed.priority || "med",
        project: parsed.project,
        status: "todo",
        created_by: user.id,
      })
      .select("id")
      .single();
    setBusy(false);
    if (error) return toast("Couldn't add task: " + error.message, "error");
    setText("");
    await loadTasks();
    const id = (data as { id: string } | null)?.id;
    toast(parsed.assignees.length ? "Task added and assigned" : "Task added — assign someone in the panel");
    if (id && !parsed.assignees.length) openTask(id);
  }

  const dueLabel = parsed.due ? dueInfo(parsed.due)?.label : null;

  return (
    <div className="quickadd">
      <div className="qa-row">
        <span className="qa-plus" aria-hidden="true">+</span>
        <input
          ref={inputRef}
          className="qa-input"
          placeholder="Add a task…  e.g. Fix meter parser @parthiv !high fri #CBAM"
          aria-label="New task"
          maxLength={220}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
            if (e.key === "Escape") setText("");
          }}
        />
        <button className="link qa-help" onClick={() => setHelp((h) => !h)} aria-expanded={help}>Tips</button>
        <button className="btn" onClick={add} disabled={busy || !parsed.title}>Add</button>
      </div>
      {(hasTokens || help) && (
        <div className="qa-preview">
          {parsed.assignees.map((id) => (
            <span key={id} className="tok">
              <Avatar person={peopleById[id]} size={16} />
              {peopleById[id]?.full_name}
            </span>
          ))}
          {parsed.unknownPeople.map((n) => (
            <span key={n} className="tok bad">@{n} — no match</span>
          ))}
          {parsed.priority && <span className={"tok pri-" + parsed.priority}>{PRIORITY_LABEL[parsed.priority]}</span>}
          {dueLabel && <span className="tok">Due {dueLabel}</span>}
          {parsed.project && (
            <span className="tok proj" style={{ ["--pc" as string]: projectColor(parsed.project) }}>
              #{parsed.project}
              {!projects.some((p) => p.toLowerCase() === parsed.project!.toLowerCase()) && " (new)"}
            </span>
          )}
          {help && (
            <span className="qa-tips">
              <code>@name</code> assign · <code>!high</code> <code>!critical</code> <code>!low</code> priority · <code>#project</code> · end with a date:{" "}
              <code>today</code> <code>tomorrow</code> <code>fri</code> <code>12 nov</code> <code>in 3 days</code>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
