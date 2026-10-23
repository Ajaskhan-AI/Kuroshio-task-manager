import { useEffect, useMemo, useState } from "react";
import { sb } from "../lib/supabase";
import { parseLocalDate, todayStr } from "../lib/utils";
import {
  PRIORITY_LABEL, STATUS_LABEL, canReview, fmtMinutes, isBlocked, isDone, isDueToday, isDueWithin, isOverdue,
  normPriority, normStatus,
} from "../lib/tasks";
import { useWorkspace } from "../workspace";
import type { Task, TimeLog } from "../types";
import { Empty } from "./common";

type Scope = "me" | "team";

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

function daysBetween(a: string, b: string) {
  return Math.round((parseLocalDate(b).getTime() - parseLocalDate(a).getTime()) / 86400000);
}

/** Jump to the board with a quick view pre-selected. */
function boardWith(quick: string, go: () => void) {
  try {
    const raw = localStorage.getItem("kuro-task-filters");
    const cur = raw ? JSON.parse(raw) : {};
    localStorage.setItem("kuro-task-filters", JSON.stringify({ ...cur, quick, assignee: "", status: "", priority: "", deadline: "", project: "" }));
  } catch {
    /* ignore */
  }
  go();
}

export function Dashboard({ goToBoard }: { goToBoard: () => void }) {
  const { user, isAdmin, tasks, ix, people, nameOf, openTask, revs, profile } = useWorkspace();
  const [scope, setScope] = useState<Scope>(isAdmin ? "team" : "me");
  const [logs, setLogs] = useState<TimeLog[]>([]);
  const [period, setPeriod] = useState<7 | 30>(7);
  const today = todayStr();

  useEffect(() => {
    // Admins can read everyone's logs; members only get their own (RLS).
    sb.from("time_logs").select("*").gte("log_date", daysAgo(30)).then(({ data }) => setLogs((data as TimeLog[]) || []));
  }, [revs.time]);

  const scoped = useMemo(
    () => (scope === "me" ? tasks.filter((t) => (t.assignee_ids || []).includes(user.id)) : tasks),
    [scope, tasks, user.id],
  );

  const dueToday = scoped.filter((t) => isDueToday(t, today));
  const overdue = scoped.filter((t) => isOverdue(t, today)).sort((a, b) => (a.due_date || "").localeCompare(b.due_date || ""));
  const blocked = scoped.filter((t) => isBlocked(t, ix));
  const awaiting = tasks.filter((t) => ix.pendingByTask[t.id] && (scope === "team" ? true : canReview(t, user.id, isAdmin) || (t.assignee_ids || []).includes(user.id)));
  const upcoming = scoped.filter((t) => isDueWithin(t, 14, today) && !isDueToday(t, today)).sort((a, b) => (a.due_date || "").localeCompare(b.due_date || ""));

  const total = scoped.length;
  const done = scoped.filter(isDone).length;
  const open = total - done;
  const doneRecent = scoped.filter((t) => isDone(t) && t.updated_at >= daysAgo(30)).length;
  const rate = total ? Math.round((done / total) * 100) : 0;
  const byStatus = (["todo", "in_progress", "in_review", "done"] as const).map((s) => ({ s, n: scoped.filter((t) => normStatus(t.status) === s).length }));

  const myWeek = logs.filter((l) => l.user_id === user.id && l.log_date >= daysAgo(6)).reduce((a, b) => a + b.minutes, 0);
  const firstName = (profile.full_name || "").split(" ")[0];

  return (
    <section className="dash">
      <div className="dash-head">
        <div>
          <h2>{greeting()}{firstName ? ", " + firstName : ""}</h2>
          <p className="muted small">{new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })} · you logged {fmtMinutes(myWeek)} in the last 7 days</p>
        </div>
        {isAdmin && (
          <div className="seg" role="group" aria-label="Scope">
            <button className={scope === "me" ? "on" : ""} onClick={() => setScope("me")}>My tasks</button>
            <button className={scope === "team" ? "on" : ""} onClick={() => setScope("team")}>Whole team</button>
          </div>
        )}
      </div>

      <div className="stat-row">
        <Stat label="Due today" n={dueToday.length} tone={dueToday.length ? "warn" : ""} onClick={() => boardWith(scope === "me" ? "mine" : "all", goToBoard)} />
        <Stat label="Overdue" n={overdue.length} tone={overdue.length ? "bad" : ""} onClick={() => boardWith("overdue", goToBoard)} />
        <Stat label="Blocked" n={blocked.length} tone={blocked.length ? "bad" : ""} onClick={() => boardWith("blocked", goToBoard)} />
        <Stat label="Awaiting review" n={awaiting.length} tone={awaiting.length ? "warn" : ""} onClick={() => boardWith("review", goToBoard)} />
      </div>

      <div className="dash-grid">
        <div className="card-panel">
          <h3>Completion</h3>
          <div className="comp">
            <div className="comp-ring" style={{ ["--p" as string]: rate }} aria-label={`${rate}% complete`}><span>{rate}%</span></div>
            <div className="comp-nums">
              <div><b>{open}</b> open</div>
              <div><b>{done}</b> done</div>
              <div><b>{doneRecent}</b> completed in the last 30 days</div>
            </div>
          </div>
          <div className="status-bars">
            {byStatus.map(({ s, n }) => (
              <div key={s} className="sbar">
                <span className="sbar-l">{STATUS_LABEL[s]}</span>
                <span className="sbar-track"><span className={"sbar-fill st-" + s} style={{ width: total ? (n / total) * 100 + "%" : 0 }} /></span>
                <span className="sbar-n">{n}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card-panel">
          <h3>Due today & overdue</h3>
          {dueToday.length + overdue.length === 0 ? <Empty>Nothing due. 🎉</Empty> : (
            <TaskList tasks={[...overdue, ...dueToday].slice(0, 8)} today={today} nameOf={nameOf} openTask={openTask} showWho={scope === "team"} />
          )}
        </div>

        <div className="card-panel">
          <h3>Upcoming deadlines <span className="muted small">· next 14 days</span></h3>
          {upcoming.length === 0 ? <Empty>No upcoming deadlines.</Empty> : (
            <TaskList tasks={upcoming.slice(0, 8)} today={today} nameOf={nameOf} openTask={openTask} showWho={scope === "team"} />
          )}
        </div>

        <div className="card-panel">
          <h3>Blocked & awaiting review</h3>
          {blocked.length + awaiting.length === 0 ? <Empty>Nothing blocked or waiting.</Empty> : (
            <div className="dlist">
              {blocked.slice(0, 5).map((t) => (
                <button key={"b" + t.id} className="drow" onClick={() => openTask(t.id)}>
                  <span className="flag flag-blocked">⛔</span><span className="drow-t">{t.title}</span>
                  <span className="muted small">{t.blocked_reason || "waiting on prerequisites"}</span>
                </button>
              ))}
              {awaiting.slice(0, 5).map((t) => (
                <button key={"r" + t.id} className="drow" onClick={() => openTask(t.id, "deliverables")}>
                  <span className="flag">📝</span><span className="drow-t">{t.title}</span>
                  <span className="muted small">{t.reviewer_id ? "reviewer: " + nameOf(t.reviewer_id) : "any admin"}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {isAdmin && (
        <>
          <h3 className="sec-h">Team workload</h3>
          <Workload tasks={tasks} logs={logs} />

          <h3 className="sec-h">Overdue report</h3>
          {tasks.filter((t) => isOverdue(t, today)).length === 0 ? <Empty>No overdue tasks across the team.</Empty> : (
            <div className="table-wrap">
              <table className="ttable">
                <thead><tr><th>Task</th><th>Assignees</th><th>Priority</th><th>Due</th><th className="num">Days late</th></tr></thead>
                <tbody>
                  {tasks.filter((t) => isOverdue(t, today)).sort((a, b) => (a.due_date || "").localeCompare(b.due_date || "")).map((t) => (
                    <tr key={t.id} onClick={() => openTask(t.id)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && openTask(t.id)}>
                      <td className="tt-title">{t.title}</td>
                      <td>{(t.assignee_ids || []).map(nameOf).join(", ") || <span className="muted">Unassigned</span>}</td>
                      <td><span className={"pill " + normPriority(t.priority)}>{PRIORITY_LABEL[normPriority(t.priority)]}</span></td>
                      <td className="num">{t.due_date && parseLocalDate(t.due_date).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</td>
                      <td className="num due over">{t.due_date ? daysBetween(t.due_date, today) : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="dash-head" style={{ marginTop: 26 }}>
            <h3 className="sec-h" style={{ margin: 0 }}>Time report</h3>
            <div className="seg" role="group" aria-label="Period">
              <button className={period === 7 ? "on" : ""} onClick={() => setPeriod(7)}>Last 7 days</button>
              <button className={period === 30 ? "on" : ""} onClick={() => setPeriod(30)}>Last 30 days</button>
            </div>
          </div>
          <TimeReport logs={logs.filter((l) => l.log_date >= daysAgo(period - 1))} people={people} />
        </>
      )}
    </section>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function Stat({ label, n, tone, onClick }: { label: string; n: number; tone: string; onClick: () => void }) {
  return (
    <button className={"stat " + tone} onClick={onClick}>
      <span className="stat-n">{n}</span>
      <span className="stat-l">{label}</span>
    </button>
  );
}

function TaskList({ tasks, today, nameOf, openTask, showWho }: { tasks: Task[]; today: string; nameOf: (id: string) => string; openTask: (id: string) => void; showWho: boolean }) {
  return (
    <div className="dlist">
      {tasks.map((t) => {
        const late = t.due_date && t.due_date < today;
        return (
          <button key={t.id} className="drow" onClick={() => openTask(t.id)}>
            <span className={"pill " + normPriority(t.priority)}>{PRIORITY_LABEL[normPriority(t.priority)]}</span>
            <span className="drow-t">{t.title}</span>
            <span className={"small" + (late ? " due over" : " muted")}>
              {showWho && (t.assignee_ids || []).length ? (t.assignee_ids || []).map(nameOf).join(", ") + " · " : ""}
              {t.due_date === today ? "today" : t.due_date ? parseLocalDate(t.due_date).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : ""}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function Workload({ tasks, logs }: { tasks: Task[]; logs: TimeLog[] }) {
  const { people, ix } = useWorkspace();
  const today = todayStr();
  const week = daysAgo(6);
  const rows = people.map((p) => {
    const mine = tasks.filter((t) => (t.assignee_ids || []).includes(p.id));
    const openT = mine.filter((t) => !isDone(t));
    const estOpen = openT.reduce((a, t) => a + (t.estimate_hours ? Number(t.estimate_hours) : 0), 0);
    return {
      p,
      open: openT.length,
      overdue: openT.filter((t) => isOverdue(t, today)).length,
      blocked: openT.filter((t) => isBlocked(t, ix)).length,
      review: openT.filter((t) => normStatus(t.status) === "in_review").length,
      estOpen,
      week: logs.filter((l) => l.user_id === p.id && l.log_date >= week).reduce((a, b) => a + b.minutes, 0),
    };
  });
  const maxOpen = Math.max(1, ...rows.map((r) => r.open));
  return (
    <div className="table-wrap">
      <table className="ttable">
        <thead>
          <tr><th>Person</th><th>Open tasks</th><th className="num">Overdue</th><th className="num">Blocked</th><th className="num">In review</th><th className="num">Est. open work</th><th className="num">Logged (7d)</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.p.id} className="no-click">
              <td>{r.p.full_name}</td>
              <td><span className="wl-bar"><span style={{ width: (r.open / maxOpen) * 100 + "%" }} /></span> {r.open}</td>
              <td className={"num" + (r.overdue ? " due over" : "")}>{r.overdue}</td>
              <td className="num">{r.blocked}</td>
              <td className="num">{r.review}</td>
              <td className="num">{r.estOpen ? fmtMinutes(Math.round(r.estOpen * 60)) : "—"}</td>
              <td className="num">{fmtMinutes(r.week)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TimeReport({ logs, people }: { logs: TimeLog[]; people: { id: string; full_name: string | null }[] }) {
  const { ix, openTask } = useWorkspace();
  const total = logs.reduce((a, b) => a + b.minutes, 0);
  const byPerson = people
    .map((p) => ({ name: p.full_name || "(no name)", m: logs.filter((l) => l.user_id === p.id).reduce((a, b) => a + b.minutes, 0) }))
    .filter((x) => x.m > 0)
    .sort((a, b) => b.m - a.m);
  const projMap: Record<string, number> = {};
  const taskMap: Record<string, number> = {};
  logs.forEach((l) => {
    const t = ix.byId[l.task_id];
    const key = t?.project || "No project";
    projMap[key] = (projMap[key] || 0) + l.minutes;
    taskMap[l.task_id] = (taskMap[l.task_id] || 0) + l.minutes;
  });
  const byProject = Object.entries(projMap).sort((a, b) => b[1] - a[1]);
  const byTask = Object.entries(taskMap)
    .map(([id, m]) => ({ t: ix.byId[id], m }))
    .filter((x): x is { t: Task; m: number } => !!x.t)
    .sort((a, b) => b.m - a.m)
    .slice(0, 10);

  if (!total) return <Empty>No time logged in this period.</Empty>;
  const maxP = Math.max(...byPerson.map((x) => x.m), 1);
  const maxJ = Math.max(...byProject.map((x) => x[1]), 1);

  return (
    <div className="dash-grid">
      <div className="card-panel">
        <h3>By person <span className="muted small">· {fmtMinutes(total)} total</span></h3>
        {byPerson.map((x) => (
          <div key={x.name} className="sbar">
            <span className="sbar-l">{x.name}</span>
            <span className="sbar-track"><span className="sbar-fill accent" style={{ width: (x.m / maxP) * 100 + "%" }} /></span>
            <span className="sbar-n">{fmtMinutes(x.m)}</span>
          </div>
        ))}
      </div>
      <div className="card-panel">
        <h3>By project</h3>
        {byProject.map(([k, m]) => (
          <div key={k} className="sbar">
            <span className="sbar-l">{k}</span>
            <span className="sbar-track"><span className="sbar-fill accent" style={{ width: (m / maxJ) * 100 + "%" }} /></span>
            <span className="sbar-n">{fmtMinutes(m)}</span>
          </div>
        ))}
      </div>
      <div className="card-panel span-2">
        <h3>Estimate vs actual <span className="muted small">· time logged this period vs the task estimate</span></h3>
        <div className="table-wrap" style={{ marginTop: 0 }}>
          <table className="ttable">
            <thead><tr><th>Task</th><th className="num">Estimate</th><th className="num">Logged</th><th>Usage</th></tr></thead>
            <tbody>
              {byTask.map(({ t, m }) => {
                const est = t.estimate_hours != null ? Math.round(Number(t.estimate_hours) * 60) : null;
                const pct = est ? Math.round((m / est) * 100) : null;
                return (
                  <tr key={t.id} onClick={() => openTask(t.id, "time")} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && openTask(t.id, "time")}>
                    <td className="tt-title">{t.title}</td>
                    <td className="num">{est != null ? fmtMinutes(est) : "—"}</td>
                    <td className="num">{fmtMinutes(m)}</td>
                    <td>
                      {pct != null ? (
                        <span className="usage"><span className="wl-bar"><span className={pct > 100 ? "over" : ""} style={{ width: Math.min(100, pct) + "%" }} /></span> <span className={pct > 100 ? "due over" : ""}>{pct}%</span></span>
                      ) : <span className="muted">no estimate</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
