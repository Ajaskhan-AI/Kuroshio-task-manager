import { useEffect, useState } from "react";
import { sb } from "../lib/supabase";
import { PRIORITIES, PRIORITY_LABEL, RECURRENCE_LABEL, distinct, parseTags } from "../lib/tasks";
import { errMsg } from "../lib/utils";
import { useWorkspace } from "../workspace";
import type { Priority, Recurrence, Task, TaskTemplate } from "../types";
import { Modal } from "./common";

interface Form {
  title: string;
  description: string;
  project: string;
  category: string;
  tags: string;
  assignees: string[];
  priority: Priority;
  start_date: string;
  due_date: string;
  estimate: string;
  recurrence: Recurrence;
  requires_approval: boolean;
  reviewer_id: string;
  deliverables: string;
  acceptance_criteria: string;
  subtasks: string; // one per line (create only)
}

function fromTask(t: Task | null): Form {
  return {
    title: t?.title || "",
    description: t?.description || "",
    project: t?.project || "",
    category: t?.category || "",
    tags: (t?.tags || []).join(", "),
    assignees: t?.assignee_ids || [],
    priority: (t?.priority as Priority) || "med",
    start_date: t?.start_date || "",
    due_date: t?.due_date || "",
    estimate: t?.estimate_hours != null ? String(t.estimate_hours) : "",
    recurrence: t?.recurrence || "none",
    requires_approval: !!t?.requires_approval,
    reviewer_id: t?.reviewer_id || "",
    deliverables: t?.deliverables || "",
    acceptance_criteria: t?.acceptance_criteria || "",
    subtasks: "",
  };
}

const orNull = (s: string) => s.trim() || null;

/** Create (task = null) or edit a task. Admins only. */
export function TaskEditor({ task, onClose, onSaved }: { task: Task | null; onClose: () => void; onSaved: (id: string | null) => void }) {
  const { user, people, tasks, revs } = useWorkspace();
  const [f, setF] = useState<Form>(() => fromTask(task));
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const editing = !!task;

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const onText = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF((x) => ({ ...x, [k]: e.target.value }));

  useEffect(() => {
    sb.from("task_templates").select("*").order("name").then(({ data }) => setTemplates((data as TaskTemplate[]) || []));
  }, [revs.templates]);

  const projects = distinct(tasks, (t) => t.project);
  const categories = distinct(tasks, (t) => t.category);

  function applyTemplate(id: string) {
    const tp = templates.find((x) => x.id === id);
    if (!tp) return;
    setF((x) => ({
      ...x,
      title: tp.title,
      description: tp.description || "",
      project: tp.project || x.project,
      category: tp.category || "",
      tags: (tp.tags || []).join(", "),
      priority: tp.priority,
      estimate: tp.estimate_hours != null ? String(tp.estimate_hours) : "",
      recurrence: tp.recurrence,
      requires_approval: tp.requires_approval,
      deliverables: tp.deliverables || "",
      acceptance_criteria: tp.acceptance_criteria || "",
      subtasks: (tp.subtasks || []).join("\n"),
    }));
    setNote(`Filled from template “${tp.name}”. Pick assignees and dates, then create.`);
  }

  function payload() {
    const est = f.estimate.trim() ? Number(f.estimate) : null;
    return {
      title: f.title.trim(),
      description: f.description.trim(),
      project: orNull(f.project),
      category: orNull(f.category),
      tags: parseTags(f.tags),
      assignee_ids: f.assignees,
      priority: f.priority,
      start_date: f.start_date || null,
      due_date: f.due_date || null,
      estimate_hours: est != null && !Number.isNaN(est) ? est : null,
      recurrence: f.recurrence,
      requires_approval: f.requires_approval,
      reviewer_id: f.requires_approval ? f.reviewer_id || null : null,
      deliverables: orNull(f.deliverables),
      acceptance_criteria: orNull(f.acceptance_criteria),
    };
  }

  function validate(): string | null {
    if (!f.title.trim()) return "Give the task a title.";
    if (f.start_date && f.due_date && f.start_date > f.due_date) return "Start date is after the due date.";
    if (f.estimate.trim() && (Number.isNaN(Number(f.estimate)) || Number(f.estimate) < 0)) return "Estimated effort must be a positive number of hours.";
    if (f.recurrence !== "none" && !f.due_date) return "Recurring tasks need a due date so the next one can be scheduled.";
    return null;
  }

  async function save() {
    const v = validate();
    if (v) return setErr(v);
    setErr("");
    setBusy(true);
    try {
      if (editing && task) {
        const { error } = await sb.from("tasks").update(payload()).eq("id", task.id);
        if (error) throw error;
        onSaved(null);
      } else {
        const { data, error } = await sb.from("tasks").insert({ ...payload(), status: "todo", created_by: user.id }).select("id").single();
        if (error) throw error;
        const id = (data as { id: string }).id;
        const subs = f.subtasks.split("\n").map((s) => s.trim()).filter(Boolean);
        if (subs.length) {
          const { error: e2 } = await sb.from("subtasks").insert(subs.map((title, i) => ({ task_id: id, title, position: i })));
          if (e2) throw e2;
        }
        onSaved(id);
      }
    } catch (e) {
      setErr(errMsg(e, "Couldn't save the task."));
    } finally {
      setBusy(false);
    }
  }

  async function saveTemplate() {
    if (!f.title.trim()) return setErr("Add a title before saving as a template.");
    const name = window.prompt("Template name", f.title.trim());
    if (!name || !name.trim()) return;
    const p = payload();
    const { error } = await sb.from("task_templates").insert({
      name: name.trim(),
      title: p.title,
      description: p.description,
      priority: p.priority,
      estimate_hours: p.estimate_hours,
      tags: p.tags,
      category: p.category,
      project: p.project,
      requires_approval: p.requires_approval,
      deliverables: p.deliverables,
      acceptance_criteria: p.acceptance_criteria,
      recurrence: p.recurrence,
      subtasks: f.subtasks.split("\n").map((s) => s.trim()).filter(Boolean),
      created_by: user.id,
    });
    if (error) return setErr(error.message);
    setNote(`Saved template “${name.trim()}”.`);
  }

  async function deleteTemplate(id: string) {
    const tp = templates.find((x) => x.id === id);
    if (!tp || !window.confirm(`Delete template “${tp.name}”?`)) return;
    const { error } = await sb.from("task_templates").delete().eq("id", id);
    if (error) return setErr(error.message);
    setTemplates((l) => l.filter((x) => x.id !== id));
  }

  function toggleAssignee(id: string) {
    set("assignees", f.assignees.includes(id) ? f.assignees.filter((x) => x !== id) : [...f.assignees, id]);
  }

  return (
    <Modal onClose={onClose} className="modal-wide">
      <div className="m-head">
        <h3>{editing ? "Edit task" : "New task"}</h3>
        <button className="m-close" onClick={onClose} aria-label="Close">&times;</button>
      </div>
      <div className="m-body">
        {!editing && templates.length > 0 && (
          <div className="tpl-row">
            <label className="lbl" htmlFor="tpl-pick">Start from a template</label>
            <div className="tpl-pick">
              <select id="tpl-pick" className="field" defaultValue="" onChange={(e) => applyTemplate(e.target.value)}>
                <option value="" disabled>Choose a template…</option>
                {templates.map((tp) => <option key={tp.id} value={tp.id}>{tp.name}</option>)}
              </select>
              <TemplateMenu templates={templates} onDelete={deleteTemplate} />
            </div>
          </div>
        )}
        {note && <div className="msg ok">{note}</div>}

        <div className="fgrid">
          <div className="full"><label className="lbl">Title</label><input className="field" value={f.title} onChange={onText("title")} maxLength={160} autoFocus /></div>
          <div className="full"><label className="lbl">Description</label><textarea className="field" rows={3} value={f.description} onChange={onText("description")} placeholder="Context, links, what done looks like…" /></div>

          <div>
            <label className="lbl">Project</label>
            <input className="field" list="dl-projects" value={f.project} onChange={onText("project")} placeholder="e.g. Emirates Steel CBAM" />
            <datalist id="dl-projects">{projects.map((p) => <option key={p} value={p} />)}</datalist>
          </div>
          <div>
            <label className="lbl">Category</label>
            <input className="field" list="dl-categories" value={f.category} onChange={onText("category")} placeholder="e.g. Firmware, Proposal" />
            <datalist id="dl-categories">{categories.map((p) => <option key={p} value={p} />)}</datalist>
          </div>
          <div className="full"><label className="lbl">Tags <span className="lbl-hint">(comma separated)</span></label><input className="field" value={f.tags} onChange={onText("tags")} placeholder="IoT, client, urgent" /></div>

          <div className="full">
            <label className="lbl">Assignees</label>
            <div className="assign-grid">
              {people.map((p) => (
                <label key={p.id} className={"assign-opt" + (f.assignees.includes(p.id) ? " on" : "")}>
                  <input type="checkbox" checked={f.assignees.includes(p.id)} onChange={() => toggleAssignee(p.id)} />
                  {p.full_name || "(no name)"}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="lbl">Priority</label>
            <select className="field" value={f.priority} onChange={onText("priority")}>
              {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
            </select>
          </div>
          <div><label className="lbl">Estimated effort (hours)</label><input className="field" type="number" min="0" step="0.5" value={f.estimate} onChange={onText("estimate")} placeholder="e.g. 6" /></div>
          <div><label className="lbl">Start date</label><input className="field" type="date" value={f.start_date} onChange={onText("start_date")} /></div>
          <div><label className="lbl">Due date</label><input className="field" type="date" value={f.due_date} onChange={onText("due_date")} /></div>
          <div className="full">
            <label className="lbl">Repeat</label>
            <select className="field" value={f.recurrence} onChange={onText("recurrence")}>
              {(Object.keys(RECURRENCE_LABEL) as Recurrence[]).map((r) => <option key={r} value={r}>{RECURRENCE_LABEL[r]}</option>)}
            </select>
            {f.recurrence !== "none" && <div className="hint">When this task is completed, the next one is created automatically with its dates moved forward.</div>}
          </div>

          <div className="full section-split">Deliverables & review</div>
          <div className="full"><label className="lbl">Expected deliverables</label><textarea className="field" rows={2} value={f.deliverables} onChange={onText("deliverables")} placeholder="e.g. Test report (PDF), updated BOM spreadsheet" /></div>
          <div className="full"><label className="lbl">Acceptance criteria</label><textarea className="field" rows={2} value={f.acceptance_criteria} onChange={onText("acceptance_criteria")} placeholder="What must be true for this to be approved" /></div>
          <div className="full">
            <label className="check-row">
              <input type="checkbox" checked={f.requires_approval} onChange={(e) => set("requires_approval", e.target.checked)} />
              Requires approval — can only be marked done after a reviewer approves a submission
            </label>
          </div>
          {f.requires_approval && (
            <div className="full">
              <label className="lbl">Reviewer</label>
              <select className="field" value={f.reviewer_id} onChange={onText("reviewer_id")}>
                <option value="">Any admin</option>
                {people.map((p) => <option key={p.id} value={p.id}>{p.full_name || "(no name)"}</option>)}
              </select>
            </div>
          )}

          {!editing && (
            <>
              <div className="full section-split">Subtasks</div>
              <div className="full">
                <textarea className="field" rows={3} value={f.subtasks} onChange={onText("subtasks")} placeholder={"One per line, e.g.\nSite survey\nWiring diagram\nCommissioning"} />
                <div className="hint">You can set assignees and deadlines for each subtask after creating the task.</div>
              </div>
            </>
          )}
        </div>
        {err && <div className="msg err">{err}</div>}
      </div>
      <div className="m-foot">
        <button className="btn ghost" onClick={saveTemplate} disabled={busy} title="Save these settings as a reusable template">Save as template</button>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn" onClick={save} disabled={busy}>{editing ? "Save changes" : "Create task"}</button>
      </div>
    </Modal>
  );
}

function TemplateMenu({ templates, onDelete }: { templates: TaskTemplate[]; onDelete: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="tpl-manage">
      <button type="button" className="btn ghost" onClick={() => setOpen((o) => !o)}>Manage</button>
      {open && (
        <div className="ms-panel tpl-panel">
          {templates.map((tp) => (
            <div key={tp.id} className="ms-opt">
              <span style={{ flex: 1 }}>{tp.name}</span>
              <button type="button" className="mini del" onClick={() => onDelete(tp.id)}>Delete</button>
            </div>
          ))}
        </div>
      )}
    </span>
  );
}
