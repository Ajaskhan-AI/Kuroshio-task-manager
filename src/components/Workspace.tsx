import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { chanName, sb } from "../lib/supabase";
import { buildIndex } from "../lib/tasks";
import type { DbNotification, Profile, Submission, Subtask, Tab, Task, TaskDependency, UserStatus } from "../types";
import { WorkspaceContext, type DetailTab, type Revs, type WorkspaceCtx } from "../workspace";
import { Header } from "./Header";
import { Board } from "./Board";
import { Dashboard } from "./Dashboard";
import { Directory } from "./Directory";
import { Notices } from "./Notices";
import { AttendanceView } from "./Attendance";
import { LeaveView } from "./Leave";
import { TaskDetail } from "./TaskDetail";
import { TaskEditor } from "./TaskEditor";

interface Props {
  user: User;
  profile: Profile;
  setProfile: (p: Profile) => void;
}

const ZERO_REVS: Revs = {
  profiles: 0, notices: 0, attendance: 0, leave: 0, tasks: 0, subtasks: 0,
  deps: 0, subs: 0, activity: 0, time: 0, templates: 0, messages: 0,
};

/** Notification kinds that belong to the task discussion. */
const CHAT_KINDS = new Set(["comment", "mention"]);

export function Workspace({ user, profile, setProfile }: Props) {
  const isAdmin = profile.role === "admin";
  const [tab, setTab] = useState<Tab>("dashboard");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [deps, setDeps] = useState<TaskDependency[]>([]);
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [pendingSubs, setPendingSubs] = useState<Submission[]>([]);
  const [allPeople, setAllPeople] = useState<Profile[]>([]);
  const [approvals, setApprovals] = useState<Profile[]>([]);
  const [leavePending, setLeavePending] = useState(0);
  const [revs, setRevs] = useState<Revs>(ZERO_REVS);
  const [detail, setDetail] = useState<{ id: string; tab: DetailTab } | null>(null);
  const [editor, setEditor] = useState<{ task: Task | null } | null>(null);
  const [notifs, setNotifs] = useState<DbNotification[]>([]);

  const bump = useCallback((k: keyof Revs) => setRevs((r) => ({ ...r, [k]: r[k] + 1 })), []);

  const peopleById = useMemo(() => {
    const map: Record<string, Profile> = {};
    allPeople.forEach((p) => (map[p.id] = p));
    return map;
  }, [allPeople]);
  const people = useMemo(() => allPeople.filter((p) => p.status === "approved"), [allPeople]);
  const nameOf = useCallback((id: string) => peopleById[id]?.full_name || "Someone", [peopleById]);
  const ix = useMemo(() => buildIndex(tasks, deps, subtasks, pendingSubs), [tasks, deps, subtasks, pendingSubs]);

  // ---- loaders ----
  const loadTasks = useCallback(async () => {
    const { data, error } = await sb.from("tasks").select("*");
    if (error) return console.warn(error);
    setTasks((data as Task[]) || []);
  }, []);

  useEffect(() => {
    loadTasks();
  }, [loadTasks, revs.tasks]);

  useEffect(() => {
    sb.from("task_dependencies").select("task_id,depends_on_id").then(({ data, error }) => {
      if (!error) setDeps((data as TaskDependency[]) || []);
    });
  }, [revs.deps]);

  useEffect(() => {
    sb.from("subtasks").select("*").then(({ data, error }) => {
      if (!error) setSubtasks((data as Subtask[]) || []);
    });
  }, [revs.subtasks]);

  useEffect(() => {
    sb.from("task_submissions").select("*").eq("status", "submitted").then(({ data, error }) => {
      if (!error) setPendingSubs((data as Submission[]) || []);
    });
  }, [revs.subs]);

  useEffect(() => {
    sb.from("profiles")
      .select("id,full_name,role,status,avatar_url,designation")
      .order("full_name")
      .then(({ data, error }) => {
        if (!error) setAllPeople((data as Profile[]) || []);
      });
  }, [revs.profiles]);

  useEffect(() => {
    if (!isAdmin) return setApprovals([]);
    sb.from("profiles")
      .select("id,full_name,email,status,role")
      .eq("status", "pending")
      .order("full_name")
      .then(({ data, error }) => {
        if (error) return console.warn(error);
        setApprovals((data as Profile[]) || []);
      });
  }, [isAdmin, revs.profiles]);

  useEffect(() => {
    if (!isAdmin) return setLeavePending(0);
    sb.from("leave_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .then(({ count }) => setLeavePending(count || 0));
  }, [isAdmin, revs.leave]);

  const setUserStatus = useCallback(
    async (id: string, status: UserStatus) => {
      const { error } = await sb.from("profiles").update({ status }).eq("id", id);
      if (error) return alert("Couldn't update user: " + error.message);
      bump("profiles");
    },
    [bump],
  );

  // ---- notifications ----
  const loadNotifs = useCallback(async () => {
    const { data, error } = await sb
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(60);
    if (!error) setNotifs((data as DbNotification[]) || []);
  }, [user.id]);

  useEffect(() => {
    // Create any due/overdue reminders, then load (idempotent — also runs hourly on the server).
    sb.rpc("generate_task_reminders").then(() => loadNotifs(), () => loadNotifs());
  }, [loadNotifs]);

  const markRead = useCallback(async (ids: string[]) => {
    if (!ids.length) return;
    const now = new Date().toISOString();
    setNotifs((ns) => ns.map((n) => (ids.includes(n.id) && !n.read_at ? { ...n, read_at: now } : n)));
    await sb.from("notifications").update({ read_at: now }).in("id", ids).is("read_at", null);
  }, []);

  const markAllRead = useCallback(async () => {
    const now = new Date().toISOString();
    setNotifs((ns) => ns.map((n) => (n.read_at ? n : { ...n, read_at: now })));
    await sb.from("notifications").update({ read_at: now }).eq("user_id", user.id).is("read_at", null);
  }, [user.id]);

  const openTask = useCallback((taskId: string, t: DetailTab = "overview") => setDetail({ id: taskId, tab: t }), []);

  const live = useRef({ detail, tasks });
  live.current = { detail, tasks };

  const onNotif = useCallback(
    (n: DbNotification) => {
      if (!n || n.user_id !== user.id) return;
      const viewing = live.current.detail && n.task_id && live.current.detail.id === n.task_id;
      if (viewing && CHAT_KINDS.has(n.kind)) {
        // Already looking at this discussion — don't nag.
        setNotifs((ns) => [{ ...n, read_at: new Date().toISOString() }, ...ns].slice(0, 60));
        sb.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", n.id).then(() => {});
        return;
      }
      setNotifs((ns) => (ns.some((x) => x.id === n.id) ? ns : [n, ...ns].slice(0, 60)));
      if (document.hidden) {
        try {
          if ("Notification" in window && Notification.permission === "granted") {
            const pop = new Notification(n.title, { body: n.body, tag: "kuro-" + n.id, icon: "/logo.png" });
            pop.onclick = () => {
              window.focus();
              if (n.task_id) openTask(n.task_id, CHAT_KINDS.has(n.kind) ? "discussion" : n.kind === "review_requested" || n.kind === "approved" || n.kind === "revision_requested" ? "deliverables" : "overview");
              markRead([n.id]);
              pop.close();
            };
          }
        } catch {
          /* ignore */
        }
      }
    },
    [user.id, openTask, markRead],
  );

  // ---- realtime ----
  useEffect(() => {
    const ch = sb
      .channel(chanName("rt"))
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => loadTasks())
      .on("postgres_changes", { event: "*", schema: "public", table: "subtasks" }, () => bump("subtasks"))
      .on("postgres_changes", { event: "*", schema: "public", table: "task_dependencies" }, () => bump("deps"))
      .on("postgres_changes", { event: "*", schema: "public", table: "task_submissions" }, () => bump("subs"))
      .on("postgres_changes", { event: "*", schema: "public", table: "task_activity" }, () => bump("activity"))
      .on("postgres_changes", { event: "*", schema: "public", table: "time_logs" }, () => bump("time"))
      .on("postgres_changes", { event: "*", schema: "public", table: "task_templates" }, () => bump("templates"))
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => bump("messages"))
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => bump("profiles"))
      .on("postgres_changes", { event: "*", schema: "public", table: "notices" }, () => bump("notices"))
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance" }, () => bump("attendance"))
      .on("postgres_changes", { event: "*", schema: "public", table: "leave_requests" }, () => bump("leave"))
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: "user_id=eq." + user.id },
        (p) => onNotif(p.new as DbNotification),
      )
      .subscribe();
    return () => {
      sb.removeChannel(ch);
    };
  }, [loadTasks, bump, onNotif, user.id]);

  const detailTask = detail ? ix.byId[detail.id] : null;

  const ctx: WorkspaceCtx = {
    user, profile, isAdmin, setProfile, people, peopleById, nameOf,
    tasks, setTasks, loadTasks, deps, subtasks, pendingSubs, ix,
    revs, bump, approvals, setUserStatus,
    openTask,
    openEditor: (task) => setEditor({ task: task ?? null }),
    openTaskId: detail?.id ?? null,
  };

  return (
    <WorkspaceContext.Provider value={ctx}>
      <Header
        tab={tab}
        setTab={setTab}
        dirBadge={isAdmin ? approvals.length : 0}
        leaveBadge={leavePending}
        notifs={notifs}
        markRead={markRead}
        markAllRead={markAllRead}
      />
      <main className="wrap">
        {tab === "dashboard" && <Dashboard goToBoard={() => setTab("board")} />}
        {tab === "board" && <Board />}
        {tab === "dir" && <Directory />}
        {tab === "notices" && <Notices />}
        {tab === "attendance" && <AttendanceView />}
        {tab === "leave" && <LeaveView />}
        <p className="foot">Kuroshio AI · internal workspace</p>
      </main>
      {detail && detailTask && (
        <TaskDetail
          key={detail.id}
          task={detailTask}
          initialTab={detail.tab}
          onClose={() => setDetail(null)}
          onRead={() => markRead(notifs.filter((n) => n.task_id === detail.id && !n.read_at).map((n) => n.id))}
        />
      )}
      {editor && (
        <TaskEditor
          task={editor.task}
          onClose={() => setEditor(null)}
          onSaved={(id) => {
            setEditor(null);
            loadTasks();
            bump("subtasks");
            if (id) openTask(id);
          }}
        />
      )}
    </WorkspaceContext.Provider>
  );
}
