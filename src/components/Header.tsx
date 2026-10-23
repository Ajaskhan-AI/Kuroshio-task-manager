import { useCallback, useRef, useState } from "react";
import { sb } from "../lib/supabase";
import { useTheme } from "../lib/useTheme";
import { useClickOutside } from "../lib/useClickOutside";
import { fmtAgo } from "../lib/utils";
import { useWorkspace, type DetailTab } from "../workspace";
import type { DbNotification, Tab } from "../types";
import { Badge, Empty } from "./common";

interface Props {
  tab: Tab;
  setTab: (t: Tab) => void;
  dirBadge: number;
  leaveBadge: number;
  notifs: DbNotification[];
  markRead: (ids: string[]) => void;
  markAllRead: () => void;
}

const TABS: { id: Tab; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "board", label: "Task Board" },
  { id: "dir", label: "Team Directory" },
  { id: "notices", label: "Notices" },
  { id: "attendance", label: "Attendance" },
  { id: "leave", label: "Leave" },
];

export function Header({ tab, setTab, dirBadge, leaveBadge, notifs, markRead, markAllRead }: Props) {
  const { profile, user, isAdmin } = useWorkspace();
  const theme = useTheme();

  return (
    <header className="top">
      <div className="wrap topbar">
        <img className="brand-logo" src="/logo.png" alt="Kuroshio AI" />
        <h1>Kuroshio Portal</h1>
        <div className="me">
          <span className="me-name">{profile.full_name || user.email}</span>
          <span className="rolechip">{isAdmin ? "Admin" : "Member"}</span>
          <NotifBell notifs={notifs} markRead={markRead} markAllRead={markAllRead} />
          <button className="btn ghost theme-btn" onClick={theme.toggle} title="Toggle light / dark" aria-label="Toggle light or dark theme">
            {theme.icon}
          </button>
          <button className="btn ghost" onClick={() => sb.auth.signOut()}>Sign out</button>
        </div>
      </div>
      <div className="wrap">
        <nav className="tabs">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? "active" : ""} onClick={() => setTab(t.id)}>
              {t.label}
              {t.id === "dir" && dirBadge > 0 && <> <Badge n={dirBadge} /></>}
              {t.id === "leave" && leaveBadge > 0 && <> <Badge n={leaveBadge} /></>}
            </button>
          ))}
        </nav>
      </div>
    </header>
  );
}

function ensureNotifPermission() {
  try {
    if ("Notification" in window && Notification.permission === "default") return Notification.requestPermission();
  } catch {
    /* ignore */
  }
  return Promise.resolve();
}

const KIND_ICON: Record<string, string> = {
  assigned: "📌",
  comment: "💬",
  mention: "＠",
  review_requested: "📝",
  approved: "✅",
  revision_requested: "↩️",
  due_soon: "⏰",
  overdue: "⚠️",
};

function tabFor(kind: string): DetailTab {
  if (kind === "comment" || kind === "mention") return "discussion";
  if (kind === "review_requested" || kind === "approved" || kind === "revision_requested") return "deliverables";
  return "overview";
}

interface BellProps {
  notifs: DbNotification[];
  markRead: (ids: string[]) => void;
  markAllRead: () => void;
}

function NotifBell({ notifs, markRead, markAllRead }: BellProps) {
  const { openTask, ix } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [, rerender] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useClickOutside(ref, open, close);

  const unread = notifs.filter((n) => !n.read_at).length;
  const list = onlyUnread ? notifs.filter((n) => !n.read_at) : notifs;
  const canAsk = "Notification" in window && Notification.permission !== "granted";

  function toggle() {
    const opening = !open;
    setOpen(opening);
    if (opening) ensureNotifPermission();
  }

  return (
    <span className="notif-wrap" ref={ref}>
      <button className="btn ghost" id="notifBtn" title="Notifications" aria-label={`Notifications (${unread} unread)`} onClick={toggle}>
        🔔{unread > 0 && <span id="notifBadge">{unread > 99 ? "99+" : unread}</span>}
      </button>
      {open && (
        <div className="notif-panel">
          <div className="notif-head">
            <span>Notifications</span>
            <span className="notif-tools">
              <button className={"seg-mini" + (!onlyUnread ? " on" : "")} onClick={() => setOnlyUnread(false)}>All</button>
              <button className={"seg-mini" + (onlyUnread ? " on" : "")} onClick={() => setOnlyUnread(true)}>Unread</button>
              {unread > 0 && <button className="notif-enable" onClick={markAllRead}>Mark all read</button>}
            </span>
          </div>
          {canAsk && (
            <button className="notif-enable" onClick={() => ensureNotifPermission().then(() => rerender((x) => x + 1))}>
              🔔 Enable desktop pop-ups
            </button>
          )}
          {list.length === 0 ? (
            <Empty>{onlyUnread ? "You're all caught up." : "No notifications yet."}</Empty>
          ) : (
            list.map((n) => (
              <div
                key={n.id}
                className={"notif-item" + (n.read_at ? "" : " unread")}
                onClick={() => {
                  setOpen(false);
                  markRead([n.id]);
                  if (n.task_id && ix.byId[n.task_id]) openTask(n.task_id, tabFor(n.kind));
                }}
              >
                <div className="nt">
                  <span className="n-ic" aria-hidden="true">{KIND_ICON[n.kind] || "•"}</span>
                  {n.title}
                  {!n.read_at && <span className="n-dot" aria-label="unread" />}
                </div>
                {n.body && <div className="np">{n.body}</div>}
                <div className="ntime">{fmtAgo(n.created_at)}</div>
              </div>
            ))
          )}
        </div>
      )}
    </span>
  );
}
