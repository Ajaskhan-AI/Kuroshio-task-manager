import { useEffect, useState } from "react";
import { sb } from "../lib/supabase";
import { daysBetween, fmtDate } from "../lib/utils";
import { useWorkspace } from "../workspace";
import type { LeaveRequest, LeaveStatus, LeaveType } from "../types";
import { Empty } from "./common";

const LEAVE_TYPES: LeaveType[] = ["casual", "sick", "earned", "unpaid"];
const LEAVE_QUOTA: Record<LeaveType, number | null> = { casual: 12, sick: 12, earned: 15, unpaid: null };
const LEAVE_LABEL: Record<LeaveType, string> = { casual: "Casual", sick: "Sick", earned: "Earned", unpaid: "Unpaid" };

type Msg = { text: string; kind: "ok" | "err" } | null;

export function LeaveView() {
  const { user, isAdmin, revs, bump } = useWorkspace();
  const [all, setAll] = useState<LeaveRequest[]>([]);
  const [type, setType] = useState<LeaveType>("casual");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  useEffect(() => {
    sb.from("leave_requests")
      .select("*,profiles:user_id(full_name)")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) return console.warn(error);
        setAll((data as unknown as LeaveRequest[]) || []);
      });
  }, [revs.leave]);

  const mine = all.filter((l) => l.user_id === user.id);
  const pending = all.filter((l) => l.status === "pending");

  const yr = new Date().getFullYear();
  const used: Record<LeaveType, number> = { casual: 0, sick: 0, earned: 0, unpaid: 0 };
  mine.forEach((l) => {
    if (l.status === "approved" && new Date(l.start_date).getFullYear() === yr && l.leave_type in used) used[l.leave_type] += l.days;
  });

  async function apply() {
    if (!start || !end) return setMsg({ text: "Pick start and end dates.", kind: "err" });
    const days = daysBetween(start, end);
    if (days < 1) return setMsg({ text: "End date must be on or after start date.", kind: "err" });
    setBusy(true);
    const { error } = await sb.from("leave_requests").insert({
      user_id: user.id,
      leave_type: type,
      start_date: start,
      end_date: end,
      days,
      reason: reason.trim(),
      status: "pending",
    });
    setBusy(false);
    if (error) return setMsg({ text: error.message, kind: "err" });
    setMsg({ text: `Leave request submitted for approval (${days} day${days > 1 ? "s" : ""}).`, kind: "ok" });
    setReason("");
    bump("leave");
  }

  async function cancel(id: string) {
    const { error } = await sb.from("leave_requests").delete().eq("id", id);
    if (error) return alert(error.message);
    bump("leave");
  }

  async function review(id: string, status: LeaveStatus) {
    const { error } = await sb
      .from("leave_requests")
      .update({ status, reviewed_by: user.id, reviewed_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return alert("Couldn't update: " + error.message);
    bump("leave");
  }

  return (
    <section>
      {isAdmin && (
        <div className="approvals">
          <h3>Pending leave approvals</h3>
          <p className="sub">Review and approve or reject your team's leave requests.</p>
          <div>
            {pending.length === 0 ? (
              <Empty>No pending requests.</Empty>
            ) : (
              pending.map((l) => (
                <LeaveLine key={l.id} l={l} forAdmin>
                  <button
                    className="mini"
                    style={{ color: "var(--done)", borderColor: "color-mix(in srgb,var(--done) 45%,var(--line))" }}
                    onClick={() => review(l.id, "approved")}
                  >
                    Approve
                  </button>
                  <button className="mini del" onClick={() => review(l.id, "rejected")}>Reject</button>
                </LeaveLine>
              ))
            )}
          </div>
        </div>
      )}

      <div className="card-panel">
        <h3>Leave balance — this year</h3>
        <div className="balance-grid">
          {LEAVE_TYPES.map((t) => {
            const q = LEAVE_QUOTA[t];
            return (
              <div key={t} className="bal">
                <div className="t">{LEAVE_LABEL[t]}</div>
                <div className="n">
                  {q == null ? <>{used[t]} <small>taken</small></> : <>{q - used[t]} <small>/ {q} left</small></>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card-panel">
        <h3>Apply for leave</h3>
        <div className="leave-form">
          <select className="field" id="lv-type" aria-label="Leave type" value={type} onChange={(e) => setType(e.target.value as LeaveType)}>
            {LEAVE_TYPES.map((t) => <option key={t} value={t}>{LEAVE_LABEL[t]}</option>)}
          </select>
          <input className="field" id="lv-start" type="date" aria-label="Start date" value={start} onChange={(e) => setStart(e.target.value)} />
          <input className="field" id="lv-end" type="date" aria-label="End date" value={end} onChange={(e) => setEnd(e.target.value)} />
          <input className="field" id="lv-reason" placeholder="Reason (optional)" maxLength={160} value={reason} onChange={(e) => setReason(e.target.value)} />
          <button className="btn" onClick={apply} disabled={busy}>Apply</button>
        </div>
        {msg && <div className={"msg " + msg.kind}>{msg.text}</div>}
      </div>

      <h3 className="sec-h">My leave requests</h3>
      {mine.length === 0 ? (
        <Empty>No leave requests yet.</Empty>
      ) : (
        <div className="card-panel" style={{ marginTop: 0 }}>
          {mine.map((l) => (
            <LeaveLine key={l.id} l={l}>
              {l.status === "pending" && <button className="mini del" onClick={() => cancel(l.id)}>Cancel</button>}
            </LeaveLine>
          ))}
        </div>
      )}
    </section>
  );
}

function LeaveLine({ l, forAdmin, children }: { l: LeaveRequest; forAdmin?: boolean; children?: React.ReactNode }) {
  const who = forAdmin ? (l.profiles?.full_name || "Someone") + " · " : "";
  return (
    <div className="rowline">
      <span>
        <b>{who}{LEAVE_LABEL[l.leave_type] || l.leave_type}</b> · {fmtDate(l.start_date)} → {fmtDate(l.end_date)} ({l.days}d)
      </span>
      {l.reason && <span className="r-when">“{l.reason}”</span>}
      <span className="r-right">
        <span className={"st-pill st-" + l.status}>{l.status}</span>
        {children}
      </span>
    </div>
  );
}
