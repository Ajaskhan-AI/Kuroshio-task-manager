import { useCallback, useRef, useState } from "react";
import { sb } from "../lib/supabase";
import { useTheme } from "../lib/useTheme";
import { useClickOutside } from "../lib/useClickOutside";
import { fmtAgo } from "../lib/utils";
import { useWorkspace } from "../workspace";
import type { AppNotification, Tab } from "../types";
import { Badge, Empty } from "./common";

interface Props {
  tab: Tab;
  setTab: (t: Tab) => void;
  dirBadge: number;
  leaveBadge: number;
  notifs: AppNotification[];
  unread: number;
  clearUnread: () => void;
  onPickNotif: (taskId: string) => void;
}

const TABS: { id: Tab; label: string }[] = [
  { id: "board", label: "Task Board" },
  { id: "dir", label: "Team Directory" },
  { id: "notices", label: "Notices" },
  { id: "attendance", label: "Attendance" },
  { id: "leave", label: "Leave" },
];

export function Header({ tab, setTab, dirBadge, leaveBadge, notifs, unread, clearUnread, onPickNotif }: Props) {
  const { profile, user, isAdmin } = useWorkspace();
  const theme = useTheme();

  return (
    <header className="top">
      <div className="wrap topbar">
        <img className="brand-logo" src="/logo.png" alt="Kuroshio AI" />
        <h1>Kuroshio Portal</h1>
        <div className="me">
          <span>{profile.full_name || user.email}</span>
          <span className="rolechip">{isAdmin ? "Admin" : "Member"}</span>
          <NotifBell notifs={notifs} unread={unread} clearUnread={clearUnread} onPick={onPickNotif} />
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

interface BellProps {
  notifs: AppNotification[];
  unread: number;
  clearUnread: () => void;
  onPick: (taskId: string) => void;
}

function NotifBell({ notifs, unread, clearUnread, onPick }: BellProps) {
  const [open, setOpen] = useState(false);
  const [, rerender] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useClickOutside(ref, open, close);

  const canAsk = "Notification" in window && Notification.permission !== "granted";

  function toggle() {
    const opening = !open;
    setOpen(opening);
    if (opening) {
      ensureNotifPermission();
      clearUnread();
    }
  }

  return (
    <span className="notif-wrap" ref={ref}>
      <button className="btn ghost" id="notifBtn" title="Notifications" aria-label="Notifications" onClick={toggle}>
        🔔{unread > 0 && <span id="notifBadge">{unread > 99 ? "99+" : unread}</span>}
      </button>
      {open && (
        <div className="notif-panel">
          <div className="notif-head">Notifications</div>
          {canAsk && (
            <button className="notif-enable" onClick={() => ensureNotifPermission().then(() => rerender((x) => x + 1))}>
              🔔 Enable desktop pop-ups
            </button>
          )}
          {notifs.length === 0 ? (
            <Empty>No notifications yet.</Empty>
          ) : (
            notifs.map((n, i) => (
              <div
                key={i + n.at}
                className="notif-item"
                onClick={() => {
                  setOpen(false);
                  onPick(n.taskId);
                }}
              >
                <div className="nt">{n.author} · {n.title}</div>
                <div className="np">{n.preview}</div>
                <div className="ntime">{fmtAgo(n.at)}</div>
              </div>
            ))
          )}
        </div>
      )}
    </span>
  );
}
