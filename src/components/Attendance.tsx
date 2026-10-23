import { useEffect, useState } from "react";
import { sb } from "../lib/supabase";
import { fmtDate, fmtT, hoursBetween, todayStr } from "../lib/utils";
import { useWorkspace } from "../workspace";
import type { Attendance } from "../types";
import { Empty } from "./common";

export function AttendanceView() {
  const { user, isAdmin, people, revs, bump } = useWorkspace();
  const [myToday, setMyToday] = useState<Attendance | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [history, setHistory] = useState<Attendance[]>([]);
  const [team, setTeam] = useState<Attendance[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const today = todayStr();
    sb.from("attendance").select("*").eq("user_id", user.id).eq("day", today).maybeSingle()
      .then(({ data }) => {
        setMyToday((data as Attendance | null) || null);
        setLoaded(true);
      });
    sb.from("attendance").select("*").eq("user_id", user.id).order("day", { ascending: false }).limit(14)
      .then(({ data }) => setHistory((data as Attendance[]) || []));
    if (isAdmin) {
      sb.from("attendance").select("user_id,check_in,check_out").eq("day", today)
        .then(({ data }) => setTeam((data as Attendance[]) || []));
    }
  }, [user.id, isAdmin, revs.attendance]);

  async function checkIn() {
    setBusy(true);
    const { error } = await sb
      .from("attendance")
      .upsert({ user_id: user.id, day: todayStr(), check_in: new Date().toISOString(), status: "present" }, { onConflict: "user_id,day" });
    setBusy(false);
    if (error) return alert("Couldn't check in: " + error.message);
    bump("attendance");
  }

  async function checkOut() {
    if (!myToday) return;
    setBusy(true);
    const { error } = await sb.from("attendance").update({ check_out: new Date().toISOString() }).eq("id", myToday.id);
    setBusy(false);
    if (error) return alert("Couldn't check out: " + error.message);
    bump("attendance");
  }

  const ci = myToday?.check_in;
  const co = myToday?.check_out;
  const teamMap: Record<string, Attendance> = {};
  team.forEach((a) => (teamMap[a.user_id] = a));

  return (
    <section>
      <div className="card-panel">
        <h3>Today — {new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</h3>
        <div className="att-status">
          {!loaded ? "Loading…" : !ci ? "You haven't checked in yet today." : !co ? (
            <>Checked in at <b>{fmtT(ci)}</b>. Have a good day.</>
          ) : (
            <>Checked in <b>{fmtT(ci)}</b> · out <b>{fmtT(co)}</b> · {hoursBetween(ci, co)}</>
          )}
        </div>
        <div className="att-actions">
          {loaded && !ci && <button className="btn" onClick={checkIn} disabled={busy}>Check in</button>}
          {ci && !co && <button className="btn" onClick={checkOut} disabled={busy}>Check out</button>}
        </div>
      </div>

      <h3 className="sec-h">My recent attendance</h3>
      {history.length === 0 ? (
        <Empty>No attendance recorded yet.</Empty>
      ) : (
        <div className="card-panel" style={{ marginTop: 0 }}>
          {history.map((a) => (
            <div key={a.id} className="rowline">
              <span>{fmtDate(a.day)}</span>
              <span className="r-when">{fmtT(a.check_in)} → {fmtT(a.check_out)}</span>
              <span className="r-right">{a.check_in && a.check_out ? hoursBetween(a.check_in, a.check_out) : ""}</span>
            </div>
          ))}
        </div>
      )}

      {isAdmin && (
        <div>
          <h3 className="sec-h">Team today</h3>
          <div className="card-panel" style={{ marginTop: 0 }}>
            {people.length === 0 && <Empty>No team members yet.</Empty>}
            {people.map((p) => {
              const a = teamMap[p.id];
              let text: string, color: string;
              if (!a || !a.check_in) { text = "Not in"; color = "var(--muted)"; }
              else if (!a.check_out) { text = "In since " + fmtT(a.check_in); color = "var(--done)"; }
              else { text = fmtT(a.check_in) + " → " + fmtT(a.check_out); color = "var(--muted)"; }
              return (
                <div key={p.id} className="rowline">
                  <span>{p.full_name || "(no name)"}</span>
                  <span className="r-right" style={{ color }}>{text}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
