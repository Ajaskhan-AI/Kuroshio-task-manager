import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { chanName, sb } from "../lib/supabase";
import { useClickOutside } from "../lib/useClickOutside";
import { fmtAgo } from "../lib/utils";
import { useTaskActions } from "../lib/useTaskActions";
import { PRIORITIES, STATUSES, STATUS_LABEL, dueInfo, normPriority, normStatus, projectColor } from "../lib/tasks";
import { useWorkspace } from "../workspace";
import type { Activity, DrawerTab, Priority, Subtask, Task, TaskStatus } from "../types";
import { Avatar, Empty, toast } from "./common";
import { TaskChat } from "./TaskChat";

interface Props {
  taskId: string;
  tab: DrawerTab;
  setTab: (t: DrawerTab) => void;
  onClose: () => void;
}

export function TaskDrawer({ taskId, tab, setTab, onClose }: Props) {
  const { tasks, unseen } = useWorkspace();
  const task = tasks.find((t) => t.id === taskId);
  const [chatCount, setChatCount] = useState<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !(e.target as HTMLElement)?.closest?.(".ms-panel")) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    panelRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div className="drawer-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer" ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={task?.title || "Task"}>
        {!task ? (
          <>
            <div className="dr-head">
              <span />
              <button className="m-close" onClick={onClose} aria-label="Close">&times;</button>
            </div>
            <Empty style={{ padding: 40 }}>This task isn't available. It may have been deleted.</Empty>
          </>
        ) : (
          <>
            <DrawerHeader task={task} onClose={onClose} />
            <div className="dr-tabs" role="tablist">
              {(["details", "chat", "activity"] as DrawerTab[]).map((t) => (
                <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>
                  {t === "details" ? "Details" : t === "chat" ? "Chat" : "Activity"}
                  {t === "chat" && chatCount ? <span className="tab-n">{chatCount}</span> : null}
                  {t === "chat" && unseen.has(task.id) && tab !== "chat" && <span className="new-dot" aria-label="new messages" />}
                </button>
              ))}
            </div>
            <div className={"dr-body" + (tab === "chat" ? " is-chat" : "")}>
              {tab === "details" && <Details task={task} onDeleted={onClose} />}
              {tab === "chat" && <TaskChat taskId={task.id} onCount={setChatCount} />}
              {tab === "activity" && <ActivityFeed taskId={task.id} />}
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------------------

function DrawerHeader({ task, onClose }: { task: Task; onClose: () => void }) {
  const { isAdmin } = useWorkspace();
  const { update } = useTaskActions();
  const [title, setTitle] = useState(task.title || "");
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => setTitle(task.title || ""), [task.title]);
  useAutosize(ref, title);

  function save() {
    const t = title.trim();
    if (!t) return setTitle(task.title || "");
    if (t !== task.title) update(task.id, { title: t });
  }

  return (
    <div className="dr-head">
      <div className="dr-head-main">
        <div className="dr-crumbs">
          {task.project ? (
            <span className="proj-chip" style={{ ["--pc" as string]: projectColor(task.project) }}>{task.project}</span>
          ) : (
            <span className="dr-kicker">Task</span>
          )}
        </div>
        {isAdmin ? (
          <textarea
            ref={ref}
            className="dr-title edit"
            rows={1}
            value={title}
            maxLength={160}
            aria-label="Task title"
            onChange={(e) => setTitle(e.target.value.replace(/\n/g, ""))}
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                (e.target as HTMLTextAreaElement).blur();
              }
            }}
          />
        ) : (
          <h2 className="dr-title">{task.title || "Untitled task"}</h2>
        )}
      </div>
      <button className="m-close" onClick={onClose} aria-label="Close">&times;</button>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Details({ task, onDeleted }: { task: Task; onDeleted: () => void }) {
  const { isAdmin, nameOf, projects } = useWorkspace();
  const { canMove, update, remove } = useTaskActions();
  const movable = canMove(task);
  const st = normStatus(task.status);
  const [confirmDel, setConfirmDel] = useState(false);

  useEffect(() => {
    if (!confirmDel) return;
    const t = window.setTimeout(() => setConfirmDel(false), 4000);
    return () => window.clearTimeout(t);
  }, [confirmDel]);

  return (
    <div className="dr-details">
      <div className="seg" role="radiogroup" aria-label="Status">
        {STATUSES.map((s) => (
          <button
            key={s.id}
            role="radio"
            aria-checked={st === s.id}
            className={s.cls + (st === s.id ? " on" : "")}
            disabled={!movable}
            onClick={() => st !== s.id && update(task.id, { status: s.id })}
          >
            <span className="dot" />
            {s.label}
          </button>
        ))}
      </div>
      {!movable && <p className="hint">Only the people assigned to this task can change its status.</p>}

      <BlockedBox task={task} editable={movable} />

      <div className="props">
        <div className="prop">
          <span className="k">Assignees</span>
          <div className="v">
            <AssigneeField task={task} editable={isAdmin} />
          </div>
        </div>
        <div className="prop">
          <span className="k">Due date</span>
          <div className="v">
            {isAdmin ? (
              <input
                type="date"
                className="field slim"
                value={task.due_date || ""}
                onChange={(e) => update(task.id, { due_date: e.target.value || null })}
              />
            ) : (
              <DueText task={task} />
            )}
            {isAdmin && task.due_date && <DueText task={task} quiet />}
          </div>
        </div>
        <div className="prop">
          <span className="k">Priority</span>
          <div className="v">
            {isAdmin ? (
              <select
                className="field slim"
                value={normPriority(task.priority)}
                onChange={(e) => update(task.id, { priority: e.target.value as Priority })}
              >
                {PRIORITIES.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            ) : (
              <span className={"pri pri-" + normPriority(task.priority)}>{PRIORITIES.find((p) => p.id === normPriority(task.priority))?.label}</span>
            )}
          </div>
        </div>
        <div className="prop">
          <span className="k">Project</span>
          <div className="v">
            {isAdmin ? <ProjectField task={task} projects={projects} /> : task.project ? <span>{task.project}</span> : <span className="muted">—</span>}
          </div>
        </div>
      </div>

      <DescriptionField task={task} editable={isAdmin} />
      <Checklist task={task} />

      <div className="dr-foot-meta">
        <span>
          {[
            task.created_at && "Created " + fmtAgo(task.created_at) + (task.created_by ? " by " + nameOf(task.created_by) : ""),
            task.updated_at && "updated " + fmtAgo(task.updated_at),
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
        {isAdmin &&
          (confirmDel ? (
            <button
              className="btn danger"
              onClick={async () => {
                if (await remove(task.id)) onDeleted();
              }}
            >
              Confirm delete
            </button>
          ) : (
            <button className="link danger-link" onClick={() => setConfirmDel(true)}>Delete task</button>
          ))}
      </div>
    </div>
  );
}

function DueText({ task, quiet }: { task: Task; quiet?: boolean }) {
  const info = dueInfo(task.due_date, normStatus(task.status) === "done");
  if (!info) return quiet ? null : <span className="muted">No due date</span>;
  if (quiet && info.state === "later") return null;
  return <span className={"due-chip " + info.state}>{info.state === "over" ? "Overdue · " + info.label : info.label}</span>;
}

// ---------------------------------------------------------------------------

function BlockedBox({ task, editable }: { task: Task; editable: boolean }) {
  const { update } = useTaskActions();
  const [editing, setEditing] = useState(false);
  const [reason, setReason] = useState("");
  const blocked = !!(task.blocked_reason || "").trim();

  if (blocked) {
    return (
      <div className="blocked-box">
        <div>
          <b>Blocked</b>
          <p>{task.blocked_reason}</p>
        </div>
        {editable && (
          <button className="btn ghost small" onClick={() => update(task.id, { blocked_reason: null })}>Unblock</button>
        )}
      </div>
    );
  }
  if (!editable || normStatus(task.status) === "done") return null;
  if (!editing) {
    return (
      <button className="link flag-link" onClick={() => setEditing(true)}>
        Flag as blocked…
      </button>
    );
  }
  return (
    <form
      className="block-form"
      onSubmit={(e) => {
        e.preventDefault();
        const r = reason.trim();
        if (!r) return;
        update(task.id, { blocked_reason: r });
        setEditing(false);
        setReason("");
      }}
    >
      <input className="field" autoFocus placeholder="What's blocking this? e.g. waiting for site access" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
      <button className="btn" disabled={!reason.trim()}>Flag</button>
      <button type="button" className="btn ghost" onClick={() => setEditing(false)}>Cancel</button>
    </form>
  );
}

// ---------------------------------------------------------------------------

function AssigneeField({ task, editable }: { task: Task; editable: boolean }) {
  const { people, peopleById, user } = useWorkspace();
  const { update } = useTaskActions();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useClickOutside(ref, open, close);
  const ids = task.assignee_ids || [];

  function toggle(id: string) {
    const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
    update(task.id, { assignee_ids: next });
  }

  const list = people.filter((p) => (p.full_name || "").toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="assignees" ref={ref}>
      {ids.length === 0 && <span className="muted">Unassigned</span>}
      {ids.map((id) => (
        <span key={id} className="person-chip">
          <Avatar person={peopleById[id] || { id, full_name: "?" }} size={20} />
          {(peopleById[id]?.full_name || "Someone") + (id === user.id ? " (you)" : "")}
        </span>
      ))}
      {editable && (
        <button className="add-chip" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {ids.length ? "Edit" : "+ Assign"}
        </button>
      )}
      {open && (
        <div className="ms-panel people-panel">
          <input className="field slim" autoFocus placeholder="Search people…" value={q} onChange={(e) => setQ(e.target.value)} />
          {list.map((m) => (
            <label key={m.id} className="ms-opt">
              <input type="checkbox" checked={ids.includes(m.id)} onChange={() => toggle(m.id)} />
              <Avatar person={m} size={22} />
              <span>{(m.full_name || "(no name)") + (m.id === user.id ? " (you)" : "")}</span>
            </label>
          ))}
          {list.length === 0 && <Empty>No match</Empty>}
        </div>
      )}
    </div>
  );
}

function ProjectField({ task, projects }: { task: Task; projects: string[] }) {
  const { update } = useTaskActions();
  const [v, setV] = useState(task.project || "");
  useEffect(() => setV(task.project || ""), [task.project]);
  function save() {
    const p = v.trim() || null;
    if (p !== (task.project || null)) update(task.id, { project: p });
  }
  return (
    <>
      <input
        className="field slim"
        list="project-list"
        placeholder="e.g. CBAM, FacilityIQ"
        value={v}
        maxLength={60}
        onChange={(e) => setV(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      />
      <datalist id="project-list">
        {projects.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
    </>
  );
}

function DescriptionField({ task, editable }: { task: Task; editable: boolean }) {
  const { update } = useTaskActions();
  const [v, setV] = useState(task.description || "");
  const [focused, setFocused] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!focused) setV(task.description || "");
  }, [task.description, focused]);
  useAutosize(ref, v);

  return (
    <section className="dr-sec">
      <h4>Description</h4>
      {editable ? (
        <textarea
          ref={ref}
          className="field desc"
          placeholder="Add context, links, acceptance criteria…"
          value={v}
          onFocus={() => setFocused(true)}
          onChange={(e) => setV(e.target.value)}
          onBlur={() => {
            setFocused(false);
            if (v !== (task.description || "")) update(task.id, { description: v });
          }}
        />
      ) : task.description ? (
        <p className="desc-text">{task.description}</p>
      ) : (
        <p className="muted">No description.</p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------

function Checklist({ task }: { task: Task }) {
  const { isAdmin } = useWorkspace();
  const { canMove } = useTaskActions();
  const [items, setItems] = useState<Subtask[] | null>(null);
  const [text, setText] = useState("");
  const toggleable = canMove(task);

  const load = useCallback(async () => {
    const { data, error } = await sb
      .from("subtasks")
      .select("id,task_id,title,status,position,created_at")
      .eq("task_id", task.id)
      .order("position", { ascending: true, nullsFirst: false })
      .order("created_at");
    if (error) return console.warn(error);
    setItems((data as Subtask[]) || []);
  }, [task.id]);

  useEffect(() => {
    load();
    const ch = sb
      .channel(chanName("sub-" + task.id))
      .on("postgres_changes", { event: "*", schema: "public", table: "subtasks", filter: "task_id=eq." + task.id }, () => load())
      .subscribe();
    return () => {
      sb.removeChannel(ch);
    };
  }, [task.id, load]);

  async function add() {
    const t = text.trim();
    if (!t) return;
    const pos = Math.max(0, ...(items || []).map((i) => i.position || 0)) + 1;
    setText("");
    const { error } = await sb.from("subtasks").insert({ task_id: task.id, title: t, position: pos, status: "todo" });
    if (error) return toast("Couldn't add item: " + error.message, "error");
    load();
  }
  async function toggle(it: Subtask) {
    const status = it.status === "done" ? "todo" : "done";
    setItems((xs) => xs && xs.map((x) => (x.id === it.id ? { ...x, status } : x)));
    const { error } = await sb.from("subtasks").update({ status }).eq("id", it.id);
    if (error) {
      toast(error.message, "error");
      load();
    }
  }
  async function del(it: Subtask) {
    setItems((xs) => xs && xs.filter((x) => x.id !== it.id));
    const { error } = await sb.from("subtasks").delete().eq("id", it.id);
    if (error) {
      toast(error.message, "error");
      load();
    }
  }

  const total = items?.length || 0;
  const done = items?.filter((i) => i.status === "done").length || 0;
  if (!isAdmin && (!items || total === 0)) return null;

  return (
    <section className="dr-sec">
      <h4>
        Checklist {total > 0 && <span className="muted">{done}/{total}</span>}
      </h4>
      {total > 0 && (
        <div className="progress" aria-hidden="true">
          <span style={{ width: (done / total) * 100 + "%" }} />
        </div>
      )}
      <ul className="checklist">
        {(items || []).map((it) => (
          <li key={it.id} className={it.status === "done" ? "done" : ""}>
            <label>
              <input type="checkbox" checked={it.status === "done"} disabled={!toggleable} onChange={() => toggle(it)} />
              <span>{it.title}</span>
            </label>
            {isAdmin && (
              <button className="x" aria-label={"Remove " + it.title} onClick={() => del(it)}>&times;</button>
            )}
          </li>
        ))}
      </ul>
      {isAdmin && (
        <div className="check-add">
          <input
            className="field slim"
            placeholder="Add an item and press Enter"
            value={text}
            maxLength={160}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------

function ActivityFeed({ taskId }: { taskId: string }) {
  const { nameOf, peopleById } = useWorkspace();
  const [rows, setRows] = useState<Activity[] | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await sb
      .from("task_activity")
      .select("id,task_id,actor_id,kind,detail,created_at")
      .eq("task_id", taskId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) return console.warn(error);
    setRows((data as Activity[]) || []);
  }, [taskId]);

  useEffect(() => {
    load();
    const ch = sb
      .channel(chanName("act-" + taskId))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "task_activity", filter: "task_id=eq." + taskId }, () => load())
      .subscribe();
    return () => {
      sb.removeChannel(ch);
    };
  }, [taskId, load]);

  if (rows === null) return <Empty>Loading…</Empty>;
  if (rows.length === 0) return <Empty>No activity yet.</Empty>;

  return (
    <ol className="activity">
      {rows.map((r) => (
        <li key={r.id}>
          <Avatar person={r.actor_id ? peopleById[r.actor_id] || { id: r.actor_id, full_name: "?" } : { id: "sys", full_name: "Kuroshio" }} size={24} />
          <div>
            <p>
              <b>{r.actor_id ? nameOf(r.actor_id) : "System"}</b> {describe(r, nameOf)}
            </p>
            <time dateTime={r.created_at} title={new Date(r.created_at).toLocaleString()}>{fmtAgo(r.created_at)}</time>
          </div>
        </li>
      ))}
    </ol>
  );
}

function describe(r: Activity, nameOf: (id: string) => string): string {
  const d = (r.detail || {}) as Record<string, unknown>;
  const s = (k: string) => (typeof d[k] === "string" ? (d[k] as string) : "");
  const names = (k: string) => ((Array.isArray(d[k]) ? d[k] : []) as string[]).map(nameOf).join(", ");
  switch (r.kind) {
    case "created":
      return "created this task";
    case "status":
      return "moved it from " + (STATUS_LABEL[s("from") as TaskStatus] || s("from")) + " to " + (STATUS_LABEL[s("to") as TaskStatus] || s("to"));
    case "assignees": {
      const a = names("added");
      const rm = names("removed");
      return [a && "assigned " + a, rm && "removed " + rm].filter(Boolean).join(" and ");
    }
    case "blocked":
      return "flagged it as blocked: " + s("reason");
    case "unblocked":
      return "removed the block";
    case "updated": {
      const f = (Array.isArray(d.fields) ? d.fields : []) as string[];
      return "updated the " + (f.length ? f.join(", ") : "task");
    }
    case "subtask_added":
      return "added checklist item “" + s("title") + "”";
    case "subtask_status":
      return (s("to") === "done" ? "checked off “" : "unchecked “") + s("title") + "”";
    case "submitted":
      return "submitted work for review";
    case "dependency_added":
      return "added a dependency on “" + s("title") + "”";
    case "dependency_removed":
      return "removed a dependency on “" + s("title") + "”";
    default:
      return r.kind.replace(/_/g, " ");
  }
}

// ---------------------------------------------------------------------------

function useAutosize(ref: React.RefObject<HTMLTextAreaElement>, value: string) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + 2 + "px";
  }, [ref, value]);
}
