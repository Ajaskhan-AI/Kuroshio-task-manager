import { useCallback, useEffect, useState } from "react";
import { sb } from "../lib/supabase";
import { errMsg, fmtDate, fmtT, hoursBetween, todayStr } from "../lib/utils";
import { useWorkspace } from "../workspace";
import type { Attendance, Office } from "../types";
import { Avatar, Empty, toast } from "./common";

const DEFAULT_OFFICE = "STPI Trivandrum";
const DEFAULT_RADIUS = 150;

interface Fix {
  lat: number;
  lng: number;
  acc: number;
}
type Locate = { ok: true; fix: Fix } | { ok: false; reason: string };

/** One fresh GPS reading (no cached positions). */
function locate(timeoutMs = 15000): Promise<Locate> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve({ ok: false, reason: "This browser can't share location." });
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ ok: true, fix: { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy } }),
      (e) =>
        resolve({
          ok: false,
          reason:
            e.code === e.PERMISSION_DENIED
              ? "Location is blocked for this site. Allow it in your browser's site settings (the icon left of the address bar), then try again."
              : e.code === e.TIMEOUT
                ? "Getting your location took too long. Move near a window or turn on GPS, then try again."
                : "Your location isn't available right now.",
        }),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
    );
  });
}

function fmtDist(m?: number | null): string {
  if (m == null) return "";
  return m < 1000 ? Math.round(m) + " m" : (m / 1000).toFixed(m < 10000 ? 1 : 0) + " km";
}

interface CheckInResult {
  ok: boolean;
  needs_reason?: boolean;
  location_status?: "inside" | "outside" | "no_location";
  distance_m?: number | null;
  office?: string | null;
  accuracy_m?: number | null;
}

/** Pending "outside the office" step: we have (or failed to get) a location and need a reason. */
interface Pending {
  fix: Fix | null;
  why: string; // shown to the user
}

export function AttendanceView() {
  const { user, isAdmin, people, revs, bump } = useWorkspace();
  const [myToday, setMyToday] = useState<Attendance | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [history, setHistory] = useState<Attendance[]>([]);
  const [team, setTeam] = useState<Attendance[]>([]);
  const [review, setReview] = useState<Attendance[]>([]);
  const [office, setOffice] = useState<Office | null | undefined>(undefined);
  const [busy, setBusy] = useState<"" | "locating" | "saving">("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [reason, setReason] = useState("");

  const loadOffice = useCallback(() => {
    sb.from("offices")
      .select("id,name,lat,lng,radius_m,active,updated_at")
      .eq("active", true)
      .order("created_at")
      .limit(1)
      .then(({ data, error }) => {
        if (error) return console.warn(error);
        setOffice(((data as Office[]) || [])[0] || null);
      });
  }, []);

  useEffect(() => {
    loadOffice();
  }, [loadOffice]);

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
      sb.from("attendance").select("*").eq("day", today)
        .then(({ data }) => setTeam((data as Attendance[]) || []));
      sb.from("attendance").select("*").eq("review_status", "pending").order("day", { ascending: false }).limit(50)
        .then(({ data }) => setReview((data as Attendance[]) || []));
    }
  }, [user.id, isAdmin, revs.attendance]);

  async function submitCheckIn(fix: Fix | null, why: string | null) {
    setBusy("saving");
    const { data, error } = await sb.rpc("check_in", {
      p_day: todayStr(),
      p_lat: fix?.lat ?? null,
      p_lng: fix?.lng ?? null,
      p_accuracy: fix?.acc ?? null,
      p_reason: why,
    });
    setBusy("");
    if (error) return toast(errMsg(error, "Couldn't check in."), "error");
    const r = data as CheckInResult;
    if (!r.ok && r.needs_reason) {
      let msg: string;
      if (!fix) msg = "We couldn't get your location.";
      else if (!r.office) msg = "No office location has been set up yet.";
      else if ((r.accuracy_m ?? 0) > 1000) msg = `Your location is too imprecise to confirm (±${fmtDist(r.accuracy_m)}).`;
      else msg = `You're about ${fmtDist(r.distance_m)} from ${r.office}.`;
      setPending({ fix, why: msg });
      return;
    }
    setPending(null);
    setReason("");
    toast(r.location_status === "inside" ? "Checked in at " + (r.office || "the office") : "Checked in — sent for approval");
    bump("attendance");
  }

  async function checkIn() {
    setBusy("locating");
    const loc = await locate();
    if (!loc.ok) {
      setBusy("");
      setPending({ fix: null, why: loc.reason });
      return;
    }
    await submitCheckIn(loc.fix, null);
  }

  async function checkOut() {
    setBusy("saving");
    const { error } = await sb.rpc("check_out", { p_day: todayStr() });
    setBusy("");
    if (error) return toast(errMsg(error, "Couldn't check out."), "error");
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
          {!loaded ? (
            "Loading…"
          ) : !ci ? (
            "You haven't checked in yet today."
          ) : !co ? (
            <>
              Checked in at <b>{fmtT(ci)}</b> <LocBadge a={myToday!} office={office} />
            </>
          ) : (
            <>
              Checked in <b>{fmtT(ci)}</b> · out <b>{fmtT(co)}</b> · {hoursBetween(ci, co)} <LocBadge a={myToday!} office={office} />
            </>
          )}
        </div>

        {pending && !ci ? (
          <form
            className="outside-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (reason.trim()) submitCheckIn(pending.fix, reason.trim());
            }}
          >
            <p className="outside-why">
              <b>{pending.why}</b> You can still check in from here. Add a short reason and it'll be sent to an admin for approval.
            </p>
            <input
              className="field"
              autoFocus
              maxLength={300}
              placeholder="e.g. Client site visit — Four Seasons Abu Dhabi"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <div className="att-actions">
              <button className="btn" disabled={!reason.trim() || busy !== ""}>{busy === "saving" ? "Checking in…" : "Check in with reason"}</button>
              <button type="button" className="btn ghost" disabled={busy !== ""} onClick={checkIn}>
                {busy === "locating" ? "Locating…" : "Try location again"}
              </button>
              <button type="button" className="link" onClick={() => { setPending(null); setReason(""); }}>Cancel</button>
            </div>
          </form>
        ) : (
          <div className="att-actions">
            {loaded && !ci && (
              <button className="btn" onClick={checkIn} disabled={busy !== ""}>
                {busy === "locating" ? "Getting your location…" : busy === "saving" ? "Checking in…" : "Check in"}
              </button>
            )}
            {ci && !co && <button className="btn" onClick={checkOut} disabled={busy !== ""}>Check out</button>}
          </div>
        )}
        {loaded && !ci && !pending && (
          <p className="att-note">
            📍 Check-in uses your location once to confirm you're at {office?.name || "the office"}. It isn't tracked during the day.
          </p>
        )}
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
              <span className="r-right">
                <LocBadge a={a} office={office} />
                {a.check_in && a.check_out ? hoursBetween(a.check_in, a.check_out) : ""}
              </span>
            </div>
          ))}
        </div>
      )}

      {isAdmin && (
        <div>
          {review.length > 0 && <ReviewList rows={review} onDone={() => bump("attendance")} />}

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
                  <Avatar person={p} size={28} />
                  <span>{p.full_name || "(no name)"}</span>
                  <span className="r-right">
                    {a?.check_in && <LocBadge a={a} office={office} />}
                    <span style={{ color }}>{text}</span>
                  </span>
                </div>
              );
            })}
          </div>

          <OfficeCard office={office} onSaved={loadOffice} />
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------

function LocBadge({ a, office }: { a: Attendance; office: Office | null | undefined }) {
  if (!a.location_status) return null; // check-ins from before geofencing
  if (a.location_status === "inside") return <span className="loc-badge in">📍 {office?.name || "Office"}</span>;
  const where = a.location_status === "no_location" ? "No location" : "Outside · " + fmtDist(a.distance_m);
  const rv = a.review_status === "approved" ? " ✓" : a.review_status === "rejected" ? " · rejected" : " · pending";
  const cls = a.review_status === "approved" ? "ok" : a.review_status === "rejected" ? "bad" : "out";
  return (
    <span className={"loc-badge " + cls} title={a.outside_reason || ""}>
      {where}
      {rv}
    </span>
  );
}

function ReviewList({ rows, onDone }: { rows: Attendance[]; onDone: () => void }) {
  const { nameOf, peopleById } = useWorkspace();
  const [busy, setBusy] = useState("");

  async function decide(id: string, d: "approved" | "rejected") {
    setBusy(id);
    const { error } = await sb.rpc("review_attendance", { p_id: id, p_decision: d });
    setBusy("");
    if (error) return toast(errMsg(error), "error");
    toast(d === "approved" ? "Approved" : "Rejected");
    onDone();
  }

  return (
    <>
      <h3 className="sec-h">
        Outside check-ins to review <span className="badge">{rows.length}</span>
      </h3>
      <div className="card-panel review-panel" style={{ marginTop: 0 }}>
        {rows.map((a) => (
          <div key={a.id} className="review-row">
            <Avatar person={peopleById[a.user_id] || { id: a.user_id, full_name: "?" }} size={32} />
            <div className="rv-main">
              <div>
                <b>{nameOf(a.user_id)}</b>{" "}
                <span className="muted">
                  · {fmtDate(a.day)} · {fmtT(a.check_in)} ·{" "}
                  {a.location_status === "no_location" ? "no location shared" : fmtDist(a.distance_m) + " away"}
                  {a.check_in_accuracy_m ? " (±" + fmtDist(a.check_in_accuracy_m) + ")" : ""}
                </span>
              </div>
              <p className="rv-reason">“{a.outside_reason || "No reason given"}”</p>
            </div>
            <div className="rv-actions">
              <button className="btn small" disabled={busy === a.id} onClick={() => decide(a.id, "approved")}>Approve</button>
              <button className="btn ghost small" disabled={busy === a.id} onClick={() => decide(a.id, "rejected")}>Reject</button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function OfficeCard({ office, onSaved }: { office: Office | null | undefined; onSaved: () => void }) {
  const { user } = useWorkspace();
  const [busy, setBusy] = useState(false);
  const [radius, setRadius] = useState(office?.radius_m ?? DEFAULT_RADIUS);
  const [lastAcc, setLastAcc] = useState<number | null>(null);
  useEffect(() => setRadius(office?.radius_m ?? DEFAULT_RADIUS), [office?.radius_m]);

  async function setHere() {
    setBusy(true);
    const loc = await locate(20000);
    if (!loc.ok) {
      setBusy(false);
      return toast(loc.reason, "error");
    }
    const { lat, lng, acc } = loc.fix;
    setLastAcc(acc);
    if (acc > 100 && !window.confirm(`Your location is only accurate to about ±${fmtDist(acc)}, which may put the fence in the wrong place.\n\nFor best results, do this from a phone with GPS on, inside the office.\n\nSave it anyway?`)) {
      setBusy(false);
      return;
    }
    const row = { name: office?.name || DEFAULT_OFFICE, lat, lng, radius_m: radius, updated_by: user.id, updated_at: new Date().toISOString() };
    const { error } = office ? await sb.from("offices").update(row).eq("id", office.id) : await sb.from("offices").insert(row);
    setBusy(false);
    if (error) return toast(errMsg(error), "error");
    toast("Office location saved");
    onSaved();
  }

  async function saveRadius() {
    if (!office || radius === office.radius_m) return;
    const { error } = await sb.from("offices").update({ radius_m: radius, updated_at: new Date().toISOString() }).eq("id", office.id);
    if (error) return toast(errMsg(error), "error");
    toast("Radius updated");
    onSaved();
  }

  if (office === undefined) return null;

  return (
    <>
      <h3 className="sec-h">Office geofence</h3>
      <div className={"card-panel office-card" + (office ? "" : " warn")} style={{ marginTop: 0 }}>
        {office ? (
          <>
            <div className="oc-row">
              <div>
                <b>{office.name}</b>
                <p className="muted">
                  Check-ins within {office.radius_m} m count as in the office ·{" "}
                  <a href={`https://www.google.com/maps?q=${office.lat},${office.lng}`} target="_blank" rel="noopener">View on map</a>
                  {office.updated_at && " · set " + fmtDate(office.updated_at.slice(0, 10))}
                </p>
              </div>
            </div>
            <div className="oc-actions">
              <label className="oc-radius">
                Radius
                <input type="number" className="field slim" min={50} max={1000} step={10} value={radius}
                  onChange={(e) => setRadius(Math.max(50, Math.min(1000, +e.target.value || DEFAULT_RADIUS)))} onBlur={saveRadius} />
                m
              </label>
              <button className="btn ghost small" disabled={busy} onClick={setHere}>{busy ? "Getting location…" : "Move fence to my current location"}</button>
            </div>
          </>
        ) : (
          <>
            <b>No office location set yet</b>
            <p className="muted">
              Until it's set, every check-in will ask for a reason. Stand inside {DEFAULT_OFFICE} (ideally on your phone with GPS on) and tap below.
            </p>
            <button className="btn" disabled={busy} onClick={setHere}>{busy ? "Getting location…" : "Set office location here"}</button>
          </>
        )}
        {lastAcc != null && <p className="muted oc-acc">Last reading accurate to ±{fmtDist(lastAcc)}.</p>}
      </div>
    </>
  );
}
