import { useEffect, useRef, useState } from "react";
import { sb } from "../lib/supabase";
import { FILE_ACCEPT, MAX_FILE, fmtBytes, uploadTaskFile, useFileUrl } from "../lib/files";
import {
  PRIORITY_LABEL, RECURRENCE_LABEL, STATUS_LABEL, SUBTASK_STATUS_LABEL, canReview, fmtHours, fmtMinutes,
  isBlocked, isDone, normPriority, normStatus, openPrereqs,
} from "../lib/tasks";
import { errMsg, fmtAgo, fmtDate, todayStr } from "../lib/utils";
import { useWorkspace, type DetailTab } from "../workspace";
import type { Activity, Submission, SubmissionFile, SubtaskStatus, Task, TaskStatus, TimeLog } from "../types";
import { Avatar, Empty, Modal } from "./common";
import { TaskChat } from "./TaskChat";

const TABS: { id: DetailTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "subtasks", label: "Subtasks" },
  { id: "discussion", label: "Discussion" },
  { id: "deliverables", label: "Deliverables" },
  { id: "time", label: "Time" },
  { id: "activity", label: "Activity" },
];

interface Props {
  task: Task;
  initialTab: DetailTab;
  onClose: () => void;
  onRead: () => void;
}

export function TaskDetail({ task: t, initialTab, onClose, onRead }: Props) {
  const { ix } = useWorkspace();
  const [tab, setTab] = useState<DetailTab>(initialTab);
  const st = normStatus(t.status);
  const subCount = (ix.subtasksByTask[t.id] || []).length;
  const pending = ix.pendingByTask[t.id];

  // Opening a task clears its unread notifications.
  const readRef = useRef(onRead);
  readRef.current = onRead;
  useEffect(() => {
    readRef.current();
  }, [t.id]);

  return (
    <Modal onClose={onClose} className="modal-wide task-modal">
      <div className="m-head">
        <div style={{ minWidth: 0 }}>
          {t.project && <div className="t-project">{t.project}</div>}
          <h3 className="td-title">{t.title || "Untitled task"}</h3>
          <div className="td-sub">
            <span className={"st-badge st-" + st}>{STATUS_LABEL[st]}</span>
            <span className={"pill " + normPriority(t.priority)}>{PRIORITY_LABEL[normPriority(t.priority)]}</span>
            {isBlocked(t, ix) && <span className="flag flag-blocked">⛔ blocked</span>}
            {t.requires_approval && <span className="flag">✓ needs review</span>}
          </div>
        </div>
        <button className="m-close" onClick={onClose} aria-label="Close">&times;</button>
      </div>
      <nav className="tabs td-tabs" role="tablist">
        {TABS.map((x) => (
          <button key={x.id} role="tab" aria-selected={tab === x.id} className={tab === x.id ? "active" : ""} onClick={() => setTab(x.id)}>
            {x.label}
            {x.id === "subtasks" && subCount > 0 && <span className="qv-n">{subCount}</span>}
            {x.id === "deliverables" && pending && <span className="qv-n warn">1</span>}
          </button>
        ))}
      </nav>
      <div className={"m-body td-body" + (tab === "discussion" ? " td-chat" : "")}>
        {tab === "overview" && <Overview t={t} onClose={onClose} />}
        {tab === "subtasks" && <SubtasksPanel t={t} />}
        {tab === "discussion" && <TaskChat task={t} />}
        {tab === "deliverables" && <DeliverablesPanel t={t} />}
        {tab === "time" && <TimePanel t={t} />}
        {tab === "activity" && <ActivityPanel t={t} />}
      </div>
    </Modal>
  );
}

// ================================================================ Overview

function Overview({ t, onClose }: { t: Task; onClose: () => void }) {
  const { user, isAdmin, nameOf, ix, tasks, setTasks, loadTasks, openTask, openEditor, bump } = useWorkspace();
  const st = normStatus(t.status);
  const mine = (t.assignee_ids || []).includes(user.id);
  const canMove = isAdmin || mine;
  const prereqs = ix.dependsOn[t.id] || [];
  const dependents = ix.dependents[t.id] || [];
  const open = openPrereqs(t, ix);
  const [reason, setReason] = useState(t.blocked_reason || "");
  const [editingReason, setEditingReason] = useState(false);
  const [depPick, setDepPick] = useState("");
  const [err, setErr] = useState("");
  const [logged, setLogged] = useState<number | null>(null);
  const { revs } = useWorkspace();

  useEffect(() => {
    sb.from("time_logs").select("minutes").eq("task_id", t.id).then(({ data }) => {
      setLogged(((data as { minutes: number }[]) || []).reduce((a, b) => a + b.minutes, 0));
    });
  }, [t.id, revs.time]);

  async function setStatus(status: TaskStatus) {
    setErr("");
    const prev = t.status;
    setTasks((ts) => ts.map((x) => (x.id === t.id ? { ...x, status } : x)));
    const { error } = await sb.from("tasks").update({ status }).eq("id", t.id);
    if (error) {
      setTasks((ts) => ts.map((x) => (x.id === t.id ? { ...x, status: prev } : x)));
      setErr(error.message);
      loadTasks();
    }
  }

  async function saveReason(value: string) {
    setErr("");
    const { error } = await sb.from("tasks").update({ blocked_reason: value.trim() || null }).eq("id", t.id);
    if (error) return setErr(error.message);
    setEditingReason(false);
    loadTasks();
  }

  async function addDep() {
    if (!depPick) return;
    const { error } = await sb.from("task_dependencies").insert({ task_id: t.id, depends_on_id: depPick });
    if (error) return setErr(error.code === "23505" ? "That dependency already exists." : error.message);
    setDepPick("");
    bump("deps");
  }
  async function removeDep(id: string) {
    const { error } = await sb.from("task_dependencies").delete().eq("task_id", t.id).eq("depends_on_id", id);
    if (error) return setErr(error.message);
    bump("deps");
  }

  async function remove() {
    if (!window.confirm(`Delete “${t.title || "this task"}”? Its subtasks, discussion, submissions and time logs are deleted too.`)) return;
    const { error } = await sb.from("tasks").delete().eq("id", t.id);
    if (error) return setErr(error.message);
    onClose();
    loadTasks();
  }

  // Avoid cycles: can't depend on itself, on something already listed, or on a task that depends on this one.
  const forbidden = new Set<string>([t.id, ...prereqs]);
  const walk = (id: string) => (ix.dependents[id] || []).forEach((d) => { if (!forbidden.has(d)) { forbidden.add(d); walk(d); } });
  walk(t.id);
  const depOptions = tasks.filter((x) => !forbidden.has(x.id)).sort((a, b) => (a.title || "").localeCompare(b.title || ""));

  const reviewerLabel = t.requires_approval ? (t.reviewer_id ? nameOf(t.reviewer_id) : "Any admin") : "Not required";
  const rows: [string, React.ReactNode][] = [
    ["Assignees", (t.assignee_ids || []).length ? (t.assignee_ids || []).map(nameOf).join(", ") : <span className="muted">Unassigned</span>],
    ["Project", t.project || <span className="muted">—</span>],
    ["Category", t.category || <span className="muted">—</span>],
    ["Tags", (t.tags || []).length ? <span className="chips" style={{ marginTop: 0 }}>{(t.tags || []).map((g) => <span key={g} className="chip">{g}</span>)}</span> : <span className="muted">—</span>],
    ["Start date", t.start_date ? fmtDate(t.start_date) : <span className="muted">—</span>],
    ["Due date", t.due_date ? <span className={!isDone(t) && t.due_date < todayStr() ? "due over" : ""}>{fmtDate(t.due_date)}</span> : <span className="muted">—</span>],
    ["Effort", <>{fmtHours(t.estimate_hours)} estimated · {logged == null ? "…" : fmtMinutes(logged)} logged{!isAdmin && logged != null ? " (by you)" : ""}</>],
    ["Repeats", RECURRENCE_LABEL[t.recurrence] || "—"],
    ["Review", reviewerLabel],
    ["Created by", t.created_by ? nameOf(t.created_by) : "—"],
  ];

  return (
    <div className="ov">
      {t.description ? <div className="ov-desc">{t.description}</div> : <p className="muted ov-desc-empty">No description.</p>}

      {canMove && (
        <div className="ov-status">
          <span className="lbl" style={{ margin: 0 }}>Move to</span>
          {(["todo", "in_progress"] as TaskStatus[]).filter((s) => s !== st && st !== "in_review").map((s) => (
            <button key={s} className="mini" onClick={() => setStatus(s)}>{STATUS_LABEL[s]}</button>
          ))}
          {st === "done" && <button className="mini" onClick={() => setStatus("in_progress")}>Reopen</button>}
          {st !== "done" && st !== "in_review" && !t.requires_approval && <button className="mini" onClick={() => setStatus("done")}>Done ✓</button>}
          {t.requires_approval && st !== "done" && <span className="hint" style={{ margin: 0 }}>This task is completed by an approved submission (Deliverables tab).</span>}
        </div>
      )}

      {(isBlocked(t, ix) || canMove) && (
        <div className={"blocked-box" + (isBlocked(t, ix) ? " on" : "")}>
          {open.length > 0 && (
            <div>⛔ Waiting on {open.map((p, i) => (
              <span key={p.id}>{i > 0 && ", "}<button className="link" onClick={() => openTask(p.id)}>{p.title}</button></span>
            ))}</div>
          )}
          {t.blocked_reason && !editingReason && <div>⛔ Blocked: {t.blocked_reason}</div>}
          {canMove && !editingReason && (
            <div className="row-gap">
              <button className="mini" onClick={() => setEditingReason(true)}>{t.blocked_reason ? "Edit blocker" : "Flag as blocked"}</button>
              {t.blocked_reason && <button className="mini" onClick={() => saveReason("")}>Clear blocker</button>}
            </div>
          )}
          {editingReason && (
            <div className="row-gap">
              <input className="field" style={{ flex: 1 }} autoFocus placeholder="What's blocking this? e.g. waiting for client drawings" value={reason} onChange={(e) => setReason(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveReason(reason)} />
              <button className="btn" onClick={() => saveReason(reason)}>Save</button>
              <button className="btn ghost" onClick={() => setEditingReason(false)}>Cancel</button>
            </div>
          )}
        </div>
      )}

      <div className="ov-grid">
        {rows.map(([k, v]) => (
          <div key={k} className="detail-row"><div className="k">{k}</div><div className="v">{v}</div></div>
        ))}
        {t.recurred_from && ix.byId[t.recurred_from] && (
          <div className="detail-row"><div className="k">Previous</div><div className="v"><button className="link" onClick={() => openTask(t.recurred_from!)}>Earlier occurrence</button></div></div>
        )}
      </div>

      <h4 className="sec-h">Prerequisites</h4>
      {prereqs.length === 0 ? <p className="muted small">This task doesn't depend on any other task.</p> : (
        <div className="dep-list">
          {prereqs.map((id) => {
            const p = ix.byId[id];
            if (!p) return null;
            const ps = normStatus(p.status);
            return (
              <div key={id} className="dep-row">
                <span className={"st-badge st-" + ps}>{STATUS_LABEL[ps]}</span>
                <button className="link" onClick={() => openTask(id)}>{p.title}</button>
                {isAdmin && <button className="mini del" onClick={() => removeDep(id)}>Remove</button>}
              </div>
            );
          })}
        </div>
      )}
      {isAdmin && (
        <div className="row-gap" style={{ marginTop: 8 }}>
          <select className="field" style={{ flex: 1 }} value={depPick} onChange={(e) => setDepPick(e.target.value)} aria-label="Add prerequisite">
            <option value="">Add a prerequisite task…</option>
            {depOptions.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
          </select>
          <button className="btn ghost" onClick={addDep} disabled={!depPick}>Add</button>
        </div>
      )}
      {dependents.length > 0 && (
        <p className="small" style={{ marginTop: 10 }}>
          Blocks: {dependents.map((id, i) => ix.byId[id] && (
            <span key={id}>{i > 0 && ", "}<button className="link" onClick={() => openTask(id)}>{ix.byId[id].title}</button></span>
          ))}
        </p>
      )}

      {err && <div className="msg err">{err}</div>}
      {isAdmin && (
        <div className="ov-actions">
          <button className="btn ghost" style={{ color: "var(--danger)" }} onClick={remove}>Delete task</button>
          <button className="btn" onClick={() => openEditor(t)}>Edit task</button>
        </div>
      )}
    </div>
  );
}

// ================================================================ Subtasks

function SubtasksPanel({ t }: { t: Task }) {
  const { user, isAdmin, people, nameOf, ix, bump } = useWorkspace();
  const list = ix.subtasksByTask[t.id] || [];
  const taskAssignee = (t.assignee_ids || []).includes(user.id);
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState("");
  const [due, setDue] = useState("");
  const [err, setErr] = useState("");

  async function add() {
    if (!title.trim()) return;
    const { error } = await sb.from("subtasks").insert({
      task_id: t.id, title: title.trim(), assignee_id: assignee || null, due_date: due || null,
      position: list.length ? Math.max(...list.map((s) => s.position)) + 1 : 0,
    });
    if (error) return setErr(error.message);
    setTitle(""); setAssignee(""); setDue(""); setErr("");
    bump("subtasks");
  }
  async function update(id: string, patch: Record<string, unknown>) {
    const { error } = await sb.from("subtasks").update(patch).eq("id", id);
    if (error) return setErr(error.message);
    bump("subtasks");
  }
  async function remove(id: string) {
    const { error } = await sb.from("subtasks").delete().eq("id", id);
    if (error) return setErr(error.message);
    bump("subtasks");
  }

  const done = list.filter((s) => s.status === "done").length;

  return (
    <div>
      {list.length > 0 && (
        <div className="progress" aria-label={`${done} of ${list.length} subtasks done`}>
          <div className="progress-bar" style={{ transform: `scaleX(${done / list.length})` }} />
          <span>{done}/{list.length} done</span>
        </div>
      )}
      {list.length === 0 && <Empty>No subtasks yet.</Empty>}
      <div className="sub-list">
        {list.map((s) => {
          const canEditStatus = isAdmin || taskAssignee || s.assignee_id === user.id;
          const over = s.due_date && s.status !== "done" && s.due_date < todayStr();
          return (
            <div key={s.id} className={"sub-row" + (s.status === "done" ? " done" : "")}>
              <input
                type="checkbox"
                aria-label={"Mark " + s.title + " done"}
                checked={s.status === "done"}
                disabled={!canEditStatus}
                onChange={(e) => update(s.id, { status: e.target.checked ? "done" : "todo" })}
              />
              <span className="sub-title">{s.title}</span>
              <select className="field mini-field" value={s.status} disabled={!canEditStatus} onChange={(e) => update(s.id, { status: e.target.value as SubtaskStatus })} aria-label="Subtask status">
                {(Object.keys(SUBTASK_STATUS_LABEL) as SubtaskStatus[]).map((x) => <option key={x} value={x}>{SUBTASK_STATUS_LABEL[x]}</option>)}
              </select>
              {isAdmin ? (
                <>
                  <select className="field mini-field" value={s.assignee_id || ""} onChange={(e) => update(s.id, { assignee_id: e.target.value || null })} aria-label="Subtask assignee">
                    <option value="">Unassigned</option>
                    {people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                  </select>
                  <input className={"field mini-field" + (over ? " over" : "")} type="date" value={s.due_date || ""} onChange={(e) => update(s.id, { due_date: e.target.value || null })} aria-label="Subtask due date" />
                  <button className="mini del" onClick={() => remove(s.id)} aria-label={"Delete " + s.title}>✕</button>
                </>
              ) : (
                <span className="sub-meta">
                  {s.assignee_id ? nameOf(s.assignee_id) : "Unassigned"}
                  {s.due_date && <span className={over ? "due over" : ""}> · {fmtDate(s.due_date)}</span>}
                </span>
              )}
            </div>
          );
        })}
      </div>
      {isAdmin && (
        <div className="sub-add">
          <input className="field" placeholder="New subtask" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
          <select className="field" value={assignee} onChange={(e) => setAssignee(e.target.value)} aria-label="Assignee">
            <option value="">Unassigned</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
          <input className="field" type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due date" />
          <button className="btn" onClick={add}>Add</button>
        </div>
      )}
      {err && <div className="msg err">{err}</div>}
    </div>
  );
}

// ================================================================ Deliverables & review

export function FileLink({ f }: { f: SubmissionFile | { url: string; name: string | null; type?: string | null; size?: number } }) {
  const href = useFileUrl(f.url);
  const isImg = (f.type || "").startsWith("image/");
  return (
    <a className="cfile" href={href || "#"} target="_blank" rel="noopener" onClick={(e) => !href && e.preventDefault()}>
      {isImg ? "🖼️" : "📄"} {f.name || "file"}{f.size ? <span className="muted"> · {fmtBytes(f.size)}</span> : null}
    </a>
  );
}

function DeliverablesPanel({ t }: { t: Task }) {
  const { user, isAdmin, nameOf, revs, bump } = useWorkspace();
  const [subs, setSubs] = useState<Submission[] | null>(null);
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [comment, setComment] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const mine = (t.assignee_ids || []).includes(user.id);
  const reviewer = canReview(t, user.id, isAdmin);

  useEffect(() => {
    sb.from("task_submissions").select("*").eq("task_id", t.id).order("created_at", { ascending: false })
      .then(({ data }) => setSubs((data as Submission[]) || []));
  }, [t.id, revs.subs]);

  const pending = subs?.find((s) => s.status === "submitted");
  const canSubmit = (mine || isAdmin) && !pending && !isDone(t);

  function pick(list: FileList | null) {
    const arr = Array.from(list || []);
    const big = arr.find((f) => f.size > MAX_FILE);
    if (big) {
      setErr(`“${big.name}” is over 10 MB.`);
      return;
    }
    setErr("");
    setFiles((cur) => [...cur, ...arr]);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function submit() {
    if (!note.trim() && !files.length) return setErr("Add a note or attach at least one file.");
    setBusy(true);
    setErr("");
    try {
      const uploaded: SubmissionFile[] = [];
      for (const f of files) uploaded.push(await uploadTaskFile(t.id, f, "submissions"));
      const { error } = await sb.from("task_submissions").insert({ task_id: t.id, submitted_by: user.id, note: note.trim(), files: uploaded });
      if (error) throw error;
      setNote("");
      setFiles([]);
      bump("subs");
    } catch (e) {
      setErr(errMsg(e, "Couldn't submit."));
    } finally {
      setBusy(false);
    }
  }

  async function review(s: Submission, status: "approved" | "revision_requested") {
    if (status === "revision_requested" && !comment.trim()) return setErr("Say what needs to change when requesting a revision.");
    setBusy(true);
    setErr("");
    const { error } = await sb.from("task_submissions").update({ status, review_comment: comment.trim() || null }).eq("id", s.id);
    setBusy(false);
    if (error) return setErr(error.message);
    setComment("");
    bump("subs");
  }

  return (
    <div>
      <div className="deliv-spec">
        <div>
          <div className="lbl">Expected deliverables</div>
          <div className="pre">{t.deliverables || <span className="muted">Not specified.</span>}</div>
        </div>
        <div>
          <div className="lbl">Acceptance criteria</div>
          <div className="pre">{t.acceptance_criteria || <span className="muted">Not specified.</span>}</div>
        </div>
        <div className="small muted">
          {t.requires_approval
            ? `Approval required · reviewer: ${t.reviewer_id ? nameOf(t.reviewer_id) : "any admin"}. The task is marked done when a submission is approved.`
            : "Approval isn't required for this task, but you can still submit work for review."}
        </div>
      </div>

      {canSubmit && (
        <div className="card-panel submit-box">
          <h3>Submit work for review</h3>
          <textarea className="field" rows={3} placeholder="What did you do? Anything the reviewer should know?" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="row-gap">
            <input ref={fileRef} type="file" multiple accept={FILE_ACCEPT} className="hidden" onChange={(e) => pick(e.target.files)} />
            <button className="btn ghost" onClick={() => fileRef.current?.click()}>📎 Attach files</button>
            <span className="small muted">Reports, documents, spreadsheets, images — up to 10 MB each</span>
          </div>
          {files.length > 0 && (
            <div className="file-chips">
              {files.map((f, i) => (
                <span key={i} className="chip">{f.name} · {fmtBytes(f.size)} <button className="chip-x" onClick={() => setFiles((l) => l.filter((_, j) => j !== i))} aria-label={"Remove " + f.name}>✕</button></span>
              ))}
            </div>
          )}
          <button className="btn" onClick={submit} disabled={busy}>{busy ? "Submitting…" : "Submit for review"}</button>
        </div>
      )}
      {pending && mine && !reviewer && <div className="msg ok">Your submission is waiting for review.</div>}
      {err && <div className="msg err">{err}</div>}

      <h4 className="sec-h">Submission history</h4>
      {subs === null ? <Empty>Loading…</Empty> : subs.length === 0 ? <Empty>No submissions yet.</Empty> : (
        <div className="subm-list">
          {subs.map((s) => (
            <div key={s.id} className={"subm subm-" + s.status}>
              <div className="subm-head">
                <span className={"st-pill st-" + (s.status === "submitted" ? "pending" : s.status === "approved" ? "approved" : "rejected")}>
                  {s.status === "submitted" ? "Awaiting review" : s.status === "approved" ? "Approved" : "Revision requested"}
                </span>
                <span className="small">{s.submitted_by ? nameOf(s.submitted_by) : "Someone"} · {fmtAgo(s.created_at)}</span>
              </div>
              {s.note && <div className="pre subm-note">{s.note}</div>}
              {s.files.length > 0 && <div className="file-chips">{s.files.map((f, i) => <FileLink key={i} f={f} />)}</div>}
              {s.reviewed_at && (
                <div className="subm-review">
                  <b>{s.reviewer_id ? nameOf(s.reviewer_id) : "Reviewer"}</b> · {fmtAgo(s.reviewed_at)}
                  {s.review_comment && <div className="pre">{s.review_comment}</div>}
                </div>
              )}
              {s.status === "submitted" && reviewer && (
                <div className="review-box">
                  <textarea className="field" rows={2} placeholder="Feedback (required when requesting a revision)" value={comment} onChange={(e) => setComment(e.target.value)} />
                  <div className="row-gap">
                    <button className="btn" onClick={() => review(s, "approved")} disabled={busy}>Approve</button>
                    <button className="btn ghost" style={{ color: "var(--danger)" }} onClick={() => review(s, "revision_requested")} disabled={busy}>Request revision</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ================================================================ Time

function timerKey(taskId: string) {
  return "kuro-timer-" + taskId;
}
function readTimer(taskId: string): number | null {
  try {
    const v = localStorage.getItem(timerKey(taskId));
    return v ? Number(v) : null;
  } catch {
    return null;
  }
}

function TimePanel({ t }: { t: Task }) {
  const { user, isAdmin, nameOf, revs, bump } = useWorkspace();
  const [logs, setLogs] = useState<TimeLog[] | null>(null);
  const [hours, setHours] = useState("");
  const [mins, setMins] = useState("");
  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [timer, setTimer] = useState<number | null>(() => readTimer(t.id));
  const [, tick] = useState(0);

  useEffect(() => {
    sb.from("time_logs").select("*").eq("task_id", t.id).order("log_date", { ascending: false }).order("created_at", { ascending: false })
      .then(({ data }) => setLogs((data as TimeLog[]) || []));
  }, [t.id, revs.time]);

  useEffect(() => {
    if (!timer) return;
    const id = window.setInterval(() => tick((x) => x + 1), 15000);
    return () => window.clearInterval(id);
  }, [timer]);

  function startTimer() {
    const now = Date.now();
    try { localStorage.setItem(timerKey(t.id), String(now)); } catch { /* ignore */ }
    setTimer(now);
  }
  function stopTimer() {
    if (!timer) return;
    const m = Math.max(1, Math.round((Date.now() - timer) / 60000));
    try { localStorage.removeItem(timerKey(t.id)); } catch { /* ignore */ }
    setTimer(null);
    setHours(String(Math.floor(m / 60)));
    setMins(String(m % 60));
    setDate(todayStr());
  }

  async function add() {
    const m = (Number(hours) || 0) * 60 + (Number(mins) || 0);
    if (!m || m < 0) return setErr("Enter the time spent.");
    if (m > 1440) return setErr("A single entry can't be more than 24 hours.");
    const { error } = await sb.from("time_logs").insert({ task_id: t.id, user_id: user.id, minutes: Math.round(m), log_date: date, note: note.trim() });
    if (error) return setErr(error.message);
    setHours(""); setMins(""); setNote(""); setErr("");
    bump("time");
  }
  async function remove(id: string) {
    const { error } = await sb.from("time_logs").delete().eq("id", id);
    if (error) return setErr(error.message);
    bump("time");
  }

  const total = (logs || []).reduce((a, b) => a + b.minutes, 0);
  const estMin = t.estimate_hours != null ? Math.round(Number(t.estimate_hours) * 60) : null;
  const pct = estMin ? Math.min(100, (total / estMin) * 100) : 0;
  const over = estMin != null && total > estMin;
  const running = timer ? Math.round((Date.now() - timer) / 60000) : 0;

  return (
    <div>
      <div className="time-summary">
        <div className="bal"><div className="t">Estimated</div><div className="n">{fmtHours(t.estimate_hours)}</div></div>
        <div className="bal"><div className="t">Logged{isAdmin ? "" : " by you"}</div><div className="n">{fmtMinutes(total)}</div></div>
        <div className="bal"><div className="t">{over ? "Over estimate" : "Remaining"}</div><div className={"n" + (over ? " over-n" : "")}>{estMin == null ? "—" : fmtMinutes(Math.abs(estMin - total))}</div></div>
      </div>
      {estMin != null && (
        <div className="progress"><div className={"progress-bar" + (over ? " over" : "")} style={{ transform: `scaleX(${pct / 100})` }} /><span>{Math.round((total / (estMin || 1)) * 100)}% of estimate</span></div>
      )}

      <div className="card-panel">
        <h3>Log time</h3>
        <div className="time-form">
          <input className="field" type="number" min="0" max="24" placeholder="Hours" value={hours} onChange={(e) => setHours(e.target.value)} aria-label="Hours" />
          <input className="field" type="number" min="0" max="59" placeholder="Min" value={mins} onChange={(e) => setMins(e.target.value)} aria-label="Minutes" />
          <input className="field" type="date" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)} aria-label="Date" />
          <input className="field tf-note" placeholder="What did you work on? (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          <button className="btn" onClick={add}>Add</button>
        </div>
        <div className="row-gap" style={{ marginTop: 10 }}>
          {timer ? (
            <>
              <button className="btn ghost" onClick={stopTimer}>⏹ Stop timer</button>
              <span className="small">Running · {fmtMinutes(running)} so far</span>
            </>
          ) : (
            <button className="btn ghost" onClick={startTimer}>▶ Start timer</button>
          )}
        </div>
        {err && <div className="msg err">{err}</div>}
      </div>

      <h4 className="sec-h">{isAdmin ? "All time entries" : "Your time entries"}</h4>
      {logs === null ? <Empty>Loading…</Empty> : logs.length === 0 ? <Empty>No time logged yet.</Empty> : (
        <div className="card-panel" style={{ marginTop: 0 }}>
          {logs.map((l) => (
            <div key={l.id} className="rowline">
              <span><b>{fmtMinutes(l.minutes)}</b></span>
              <span className="r-when">{fmtDate(l.log_date)}{isAdmin ? " · " + nameOf(l.user_id) : ""}</span>
              {l.note && <span className="r-when">“{l.note}”</span>}
              <span className="r-right">{(l.user_id === user.id || isAdmin) && <button className="mini del" onClick={() => remove(l.id)}>Delete</button>}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ================================================================ Activity

function describe(a: Activity, nameOf: (id: string) => string): string {
  const d = a.detail as Record<string, unknown>;
  const s = (k: string) => (typeof d[k] === "string" ? (d[k] as string) : "");
  const ids = (k: string) => (Array.isArray(d[k]) ? (d[k] as string[]) : []);
  const statusLabel = (x: string) => STATUS_LABEL[x as TaskStatus] || x;
  switch (a.kind) {
    case "created": return d.recurred_from ? "created this recurring occurrence" : "created the task";
    case "status": return `moved it from ${statusLabel(s("from"))} to ${statusLabel(s("to"))}`;
    case "assignees": {
      const parts = [];
      if (ids("added").length) parts.push("assigned " + ids("added").map(nameOf).join(", "));
      if (ids("removed").length) parts.push("unassigned " + ids("removed").map(nameOf).join(", "));
      return parts.join(" and ");
    }
    case "updated": return "updated " + (Array.isArray(d.fields) ? (d.fields as string[]).join(", ") : "details");
    case "blocked": return `flagged it as blocked: “${s("reason")}”`;
    case "unblocked": return "cleared the blocker";
    case "subtask_added": return `added subtask “${s("title")}”`;
    case "subtask_status": return `marked subtask “${s("title")}” ${SUBTASK_STATUS_LABEL[s("to") as SubtaskStatus] || s("to")}`;
    case "dependency_added": return `added prerequisite “${s("title")}”`;
    case "dependency_removed": return `removed prerequisite “${s("title")}”`;
    case "submitted": return "submitted work for review" + (d.files ? ` (${d.files} file${d.files === 1 ? "" : "s"})` : "");
    case "approved": return "approved the submission" + (s("comment") ? `: “${s("comment")}”` : "");
    case "revision_requested": return "requested a revision" + (s("comment") ? `: “${s("comment")}”` : "");
    default: return a.kind.replace(/_/g, " ");
  }
}

const ACT_ICON: Record<string, string> = {
  created: "✚", status: "➜", assignees: "👤", updated: "✎", blocked: "⛔", unblocked: "✓",
  subtask_added: "☐", subtask_status: "☑", dependency_added: "🔗", dependency_removed: "🔗",
  submitted: "📝", approved: "✅", revision_requested: "↩",
};

function ActivityPanel({ t }: { t: Task }) {
  const { nameOf, peopleById, revs } = useWorkspace();
  const [list, setList] = useState<Activity[] | null>(null);

  useEffect(() => {
    sb.from("task_activity").select("*").eq("task_id", t.id).order("created_at", { ascending: false }).limit(200)
      .then(({ data }) => setList((data as Activity[]) || []));
  }, [t.id, revs.activity]);

  if (list === null) return <Empty>Loading…</Empty>;
  if (!list.length) return <Empty>No activity recorded yet. Changes made from now on will appear here.</Empty>;
  return (
    <ol className="timeline">
      {list.map((a) => (
        <li key={a.id}>
          <span className="tl-ic" aria-hidden="true">{ACT_ICON[a.kind] || "•"}</span>
          <div>
            <div className="tl-line">
              {a.actor_id ? <><Avatar person={peopleById[a.actor_id]} size={20} /> <b>{nameOf(a.actor_id)}</b></> : <b>System</b>} {describe(a, nameOf)}
            </div>
            <div className="ntime">{new Date(a.created_at).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}
