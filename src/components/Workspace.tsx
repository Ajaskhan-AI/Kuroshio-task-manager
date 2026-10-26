import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { chanName, sb } from "../lib/supabase";
import type { AppNotification, DrawerTab, Message, Profile, Tab, Task, UserStatus } from "../types";
import { WorkspaceContext, type Revs, type WorkspaceCtx } from "../workspace";
import { Header } from "./Header";
import { Board } from "./Board";
import { Directory } from "./Directory";
import { Notices } from "./Notices";
import { AttendanceView } from "./Attendance";
import { TaskDrawer } from "./TaskDrawer";

interface Props {
  user: User;
  profile: Profile;
  setProfile: (p: Profile) => void;
}

export function Workspace({ user, profile, setProfile }: Props) {
  const isAdmin = profile.role === "admin";
  const [tab, setTab] = useState<Tab>("board");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [allPeople, setAllPeople] = useState<Profile[]>([]);
  const [approvals, setApprovals] = useState<Profile[]>([]);
  const [revs, setRevs] = useState<Revs>({ profiles: 0, notices: 0, attendance: 0 });
  const [drawer, setDrawer] = useState<{ id: string; tab: DrawerTab } | null>(null);
  const [checks, setChecks] = useState<Record<string, { done: number; total: number }>>({});
  const [unseen, setUnseen] = useState<Set<string>>(() => new Set());
  const [notifs, setNotifs] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);

  const bump = useCallback((k: keyof Revs) => setRevs((r) => ({ ...r, [k]: r[k] + 1 })), []);

  const peopleById = useMemo(() => {
    const map: Record<string, Profile> = {};
    allPeople.forEach((p) => (map[p.id] = p));
    return map;
  }, [allPeople]);
  const people = useMemo(() => allPeople.filter((p) => p.status === "approved"), [allPeople]);
  const nameOf = useCallback((id: string) => peopleById[id]?.full_name || "Someone", [peopleById]);

  // ---- loaders ----
  const loadTasks = useCallback(async () => {
    const [res, done] = await Promise.all([
      sb.from("tasks").select("id,title,description,status,priority,due_date,assignee_ids,project,blocked_reason,created_by,created_at,updated_at"),
      // When (and by whom) each task was last moved to Done — newest first, so the first hit per task wins.
      sb
        .from("task_activity")
        .select("task_id,actor_id,created_at")
        .eq("kind", "status")
        .eq("detail->>to", "done")
        .order("created_at", { ascending: false }),
    ]);
    if (res.error) return console.warn(res.error);
    if (done.error) console.warn(done.error);
    const doneAt: Record<string, { at: string; by: string | null }> = {};
    for (const r of (done.data as { task_id: string; actor_id: string | null; created_at: string }[]) || []) {
      if (!doneAt[r.task_id]) doneAt[r.task_id] = { at: r.created_at, by: r.actor_id };
    }
    setTasks(
      ((res.data as Task[]) || []).map((t) =>
        t.status === "done" ? { ...t, completed_at: doneAt[t.id]?.at || t.updated_at || null, completed_by: doneAt[t.id]?.by || null } : t,
      ),
    );
  }, []);

  const loadChecks = useCallback(async () => {
    const { data, error } = await sb.from("subtasks").select("task_id,status");
    if (error) return console.warn(error);
    const map: Record<string, { done: number; total: number }> = {};
    for (const r of (data as { task_id: string; status: string }[]) || []) {
      const c = (map[r.task_id] ||= { done: 0, total: 0 });
      c.total++;
      if (r.status === "done") c.done++;
    }
    setChecks(map);
  }, []);

  useEffect(() => {
    loadTasks();
    loadChecks();
  }, [loadTasks, loadChecks]);

  const projects = useMemo(() => {
    const seen = new Map<string, string>();
    tasks.forEach((t) => {
      const p = (t.project || "").trim();
      if (p && !seen.has(p.toLowerCase())) seen.set(p.toLowerCase(), p);
    });
    return [...seen.values()].sort((a, b) => a.localeCompare(b));
  }, [tasks]);

  const markSeen = useCallback((taskId: string) => {
    setUnseen((u) => {
      if (!u.has(taskId)) return u;
      const n = new Set(u);
      n.delete(taskId);
      return n;
    });
  }, []);

  const openTask = useCallback(
    (taskId: string, tab: DrawerTab = "details") => {
      setDrawer({ id: taskId, tab });
      if (tab === "chat") markSeen(taskId);
    },
    [markSeen],
  );

  useEffect(() => {
    sb.from("profiles")
      .select("id,full_name,role,status,avatar_url")
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


  const setUserStatus = useCallback(
    async (id: string, status: UserStatus) => {
      const { error } = await sb.from("profiles").update({ status }).eq("id", id);
      if (error) return alert("Couldn't update user: " + error.message);
      bump("profiles");
    },
    [bump],
  );

  // ---- chat notifications ----
  const live = useRef({ tasks, drawer, isAdmin, peopleById, userId: user.id });
  live.current = { tasks, drawer, isAdmin, peopleById, userId: user.id };

  const openChatById = useCallback((taskId: string) => openTask(taskId, "chat"), [openTask]);

  const onNewMessage = useCallback(
    (m: Message) => {
      const L = live.current;
      if (!m || m.author_id === L.userId) return;
      const task = L.tasks.find((t) => t.id === m.task_id) || null;
      const ids = task?.assignee_ids || [];
      const forMe = L.isAdmin || ids.includes(L.userId);
      if (!forMe) return;
      if (L.drawer && L.drawer.id === m.task_id && L.drawer.tab === "chat") return; // already looking at it
      setUnseen((u) => (u.has(m.task_id) ? u : new Set(u).add(m.task_id)));
      const author = L.peopleById[m.author_id]?.full_name || "Someone";
      const title = task?.title || "a task";
      const preview = m.body ? m.body : m.file_name ? "📎 " + m.file_name : "shared a file";
      setNotifs((n) => [{ taskId: m.task_id, title, author, preview, at: m.created_at || new Date().toISOString() }, ...n].slice(0, 40));
      setUnread((u) => u + 1);
      if (document.hidden) {
        try {
          if ("Notification" in window && Notification.permission === "granted") {
            const n = new Notification(author + " · " + title, { body: preview, tag: "kuro-" + m.task_id, icon: "/logo.png" });
            n.onclick = () => {
              window.focus();
              openChatById(m.task_id);
              n.close();
            };
          }
        } catch {
          /* ignore */
        }
      }
    },
    [openChatById],
  );

  // ---- realtime ----
  useEffect(() => {
    const ch = sb
      .channel(chanName("rt"))
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => loadTasks())
      .on("postgres_changes", { event: "*", schema: "public", table: "subtasks" }, () => loadChecks())
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => bump("profiles"))
      .on("postgres_changes", { event: "*", schema: "public", table: "notices" }, () => bump("notices"))
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance" }, () => bump("attendance"))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (p) => onNewMessage(p.new as Message))
      .subscribe();
    return () => {
      sb.removeChannel(ch);
    };
  }, [loadTasks, loadChecks, bump, onNewMessage]);

  const ctx: WorkspaceCtx = {
    user,
    profile,
    isAdmin,
    setProfile,
    people,
    peopleById,
    nameOf,
    tasks,
    setTasks,
    loadTasks,
    revs,
    bump,
    approvals,
    setUserStatus,
    openTask,
    checks,
    unseen,
    projects,
  };

  return (
    <WorkspaceContext.Provider value={ctx}>
      <Header
        tab={tab}
        setTab={setTab}
        dirBadge={isAdmin ? approvals.length : 0}
        notifs={notifs}
        unread={unread}
        clearUnread={() => setUnread(0)}
        onPickNotif={openChatById}
      />
      <main className="wrap">
        {tab === "board" && <Board />}
        {tab === "dir" && <Directory />}
        {tab === "notices" && <Notices />}
        {tab === "attendance" && <AttendanceView />}
        <p className="foot">Kuroshio AI · internal workspace</p>
      </main>
      {drawer && (
        <TaskDrawer
          taskId={drawer.id}
          tab={drawer.tab}
          setTab={(t) => {
            setDrawer((d) => (d ? { ...d, tab: t } : d));
            if (t === "chat") markSeen(drawer.id);
          }}
          onClose={() => setDrawer(null)}
        />
      )}
    </WorkspaceContext.Provider>
  );
}
