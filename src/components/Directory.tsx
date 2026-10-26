import { useEffect, useState } from "react";
import { sb } from "../lib/supabase";
import { ageFrom, dangerGhost, errMsg, fmtDate } from "../lib/utils";
import { useWorkspace } from "../workspace";
import type { Profile } from "../types";
import { Avatar, Empty, Modal } from "./common";
import { EditProfileModal } from "./EditProfileModal";

const dangerTag = { marginLeft: 6, color: "var(--danger)", borderColor: "color-mix(in srgb,var(--danger) 40%,var(--line))" } as const;

export function Directory() {
  const { user, profile, isAdmin, revs, approvals, setUserStatus } = useWorkspace();
  const [directory, setDirectory] = useState<Profile[]>([]);
  const [q, setQ] = useState("");
  const [detail, setDetail] = useState<Profile | null>(null);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [resetFor, setResetFor] = useState<Profile | null>(null);

  useEffect(() => {
    sb.from("profiles")
      .select("*")
      .order("full_name")
      .then(({ data, error }) => {
        if (error) return console.warn(error);
        setDirectory((data as Profile[]) || []);
      });
  }, [revs.profiles]);

  const query = q.toLowerCase().trim();
  const list = directory.filter((m) => {
    if (m.status === "pending") return false; // pending users live in the approvals panel
    if (m.status === "blocked" && !isAdmin) return false; // only admins see blocked users (to unblock)
    if (!query) return true;
    return [m.full_name, m.designation, m.skills, m.branch, m.college].some((x) => (x || "").toLowerCase().includes(query));
  });

  const me = directory.find((m) => m.id === user.id) || profile;

  return (
    <section>
      {isAdmin && approvals.length > 0 && <Approvals list={approvals} setUserStatus={setUserStatus} />}
      <div className="dir-head">
        <h2>Team Directory</h2>
        <button className="btn" onClick={() => setEditing(me)}>Edit my profile</button>
      </div>
      <input className="field dir-search" placeholder="Search by name, role or skill…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="grid">
        {list.length === 0 ? (
          <Empty>No one matches that search.</Empty>
        ) : (
          list.map((m) => {
            const skills = (m.skills || "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 4);
            return (
              <div key={m.id} className="pcard" onClick={() => setDetail(m)}>
                <div className="pc-top">
                  <Avatar person={m} />
                  <div style={{ minWidth: 0 }}>
                    <p className="pc-name">
                      {m.full_name || "(no name)"}
                      {m.id === user.id && <span className="you-tag" style={{ marginLeft: 6 }}>You</span>}
                      {m.status === "blocked" && <span className="you-tag" style={dangerTag}>Blocked</span>}
                    </p>
                    <div className="pc-desig">{m.designation || (m.role === "admin" ? "Admin" : "Team member")}</div>
                  </div>
                </div>
                {skills.length > 0 && (
                  <div className="chips">
                    {skills.map((s) => <span key={s} className="chip">{s}</span>)}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {detail && (
        <DetailModal
          m={detail}
          onClose={() => setDetail(null)}
          onEdit={() => {
            setEditing(detail);
            setDetail(null);
          }}
          onReset={() => {
            setResetFor(detail);
            setDetail(null);
          }}
        />
      )}
      {editing && <EditProfileModal m={editing} onClose={() => setEditing(null)} />}
      {resetFor && <ResetPasswordModal m={resetFor} onClose={() => setResetFor(null)} />}
    </section>
  );
}

function Approvals({ list, setUserStatus }: { list: Profile[]; setUserStatus: (id: string, s: "approved" | "blocked") => Promise<void> }) {
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const act = (id: string, s: "approved" | "blocked") => {
    setBusy((b) => ({ ...b, [id]: true }));
    setUserStatus(id, s).finally(() => setBusy((b) => ({ ...b, [id]: false })));
  };
  return (
    <div className="approvals">
      <h3>Pending approvals</h3>
      <p className="sub">New signups can't see anything until you approve them.</p>
      <div>
        {list.map((m) => (
          <div key={m.id} className="appr-row">
            <span className="nm">{m.full_name || "(no name)"}</span>
            <span className="em">{m.email || ""}</span>
            <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              <button className="btn" disabled={busy[m.id]} onClick={() => act(m.id, "approved")}>Approve</button>
              <button className="btn ghost" style={dangerGhost} disabled={busy[m.id]} onClick={() => act(m.id, "blocked")}>Reject</button>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DetailModal({ m, onClose, onEdit, onReset }: { m: Profile; onClose: () => void; onEdit: () => void; onReset: () => void }) {
  const { user, isAdmin, setUserStatus, bump } = useWorkspace();
  const age = ageFrom(m.dob);
  const rows: [string, string | null | undefined][] = [
    ["Email", m.email],
    ["Phone", m.phone],
    ["Age", age != null ? age + " yrs" : ""],
    ["Date of birth", fmtDate(m.dob)],
    ["Joined", fmtDate(m.joining_date)],
    ["College", m.college],
    ["Branch", m.branch],
    ["Address", m.address],
    ["Skills", m.skills],
    ["Hobbies", m.hobbies],
    ["Access", m.role === "admin" ? "Admin" : "Member"],
  ];
  const canEdit = m.id === user.id || isAdmin;
  const adminOther = isAdmin && m.id !== user.id;

  async function del() {
    if (
      !window.confirm(
        "Delete " + (m.full_name || "this employee") +
          " permanently?\n\nThis removes their profile, photo, attendance and other records, and cannot be undone. (Blocking instead keeps their data but removes access.)",
      )
    )
      return;
    try {
      const res = await sb.functions.invoke("delete-user", { body: { user_id: m.id } });
      const err = (res.error && (res.error.message || String(res.error))) || (res.data && res.data.error);
      if (err) return alert("Couldn't delete: " + err);
      onClose();
      bump("profiles");
    } catch (e) {
      alert("Couldn't delete: " + errMsg(e));
    }
  }

  return (
    <Modal onClose={onClose}>
      <div className="m-head">
        <Avatar person={m} />
        <div>
          <h3>{m.full_name || "(no name)"}</h3>
          <div className="pc-desig">{m.designation || (m.role === "admin" ? "Admin" : "Team member")}</div>
        </div>
        <button className="m-close" onClick={onClose}>&times;</button>
      </div>
      <div className="m-body">
        {rows
          .filter(([, v]) => !!v)
          .map(([k, v]) => (
            <div key={k} className="detail-row">
              <div className="k">{k}</div>
              <div className="v">{v}</div>
            </div>
          ))}
      </div>
      <div className="m-foot">
        {adminOther && <button className="btn ghost" style={dangerGhost} onClick={del}>Delete</button>}
        {adminOther && m.status !== "blocked" && <button className="btn ghost" onClick={onReset}>Reset password</button>}
        {adminOther &&
          (m.status === "blocked" ? (
            <button className="btn ghost" onClick={() => { setUserStatus(m.id, "approved"); onClose(); }}>Unblock</button>
          ) : (
            <button className="btn ghost" style={dangerGhost} onClick={() => { setUserStatus(m.id, "blocked"); onClose(); }}>Block</button>
          ))}
        {canEdit && <button className="btn" onClick={onEdit}>Edit</button>}
      </div>
    </Modal>
  );
}

/** Readable temporary password: no look-alike characters (0/O, 1/l/I). */
function makeTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const buf = new Uint32Array(10);
  crypto.getRandomValues(buf);
  return Array.from(buf, (n) => chars[n % chars.length]).join("");
}

function ResetPasswordModal({ m, onClose }: { m: Profile; onClose: () => void }) {
  const [pw, setPw] = useState(makeTempPassword);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  const [copied, setCopied] = useState(false);
  const who = m.full_name || "this person";

  async function save() {
    if (pw.length < 8) return setErr("Use at least 8 characters.");
    setBusy(true);
    setErr("");
    try {
      const res = await sb.functions.invoke("admin-reset-password", { body: { user_id: m.id, password: pw } });
      const e = (res.data && res.data.error) || (res.error && (res.error.message || String(res.error)));
      if (e) return setErr(String(e));
      setDone(true);
    } catch (e) {
      setErr(errMsg(e, "Couldn't reset the password."));
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(pw);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the password is visible to copy by hand */
    }
  }

  return (
    <Modal onClose={onClose}>
      <div className="m-head">
        <h3>Reset password · {who}</h3>
        <button className="m-close" onClick={onClose} aria-label="Close">&times;</button>
      </div>
      <div className="m-body">
        {!done ? (
          <>
            <p style={{ marginTop: 0, fontSize: ".9rem" }}>
              Set a temporary password for <b>{who}</b>{m.email ? <> ({m.email})</> : null}. They'll sign in with it and must choose their own password straight away.
            </p>
            <label className="lbl">Temporary password</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input className="field" style={{ fontFamily: "ui-monospace,Consolas,monospace", letterSpacing: ".05em" }} value={pw} onChange={(e) => setPw(e.target.value)} maxLength={72} aria-label="Temporary password" />
              <button className="btn ghost" type="button" onClick={() => setPw(makeTempPassword())} title="Generate another">↻</button>
            </div>
            {err && <div className="msg err">{err}</div>}
          </>
        ) : (
          <>
            <div className="msg ok" style={{ marginTop: 0 }}>Password reset. Share this temporary password with {who} privately (in person or a direct message):</div>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <input className="field" readOnly value={pw} style={{ fontFamily: "ui-monospace,Consolas,monospace", letterSpacing: ".05em" }} onFocus={(e) => e.currentTarget.select()} aria-label="Temporary password" />
              <button className="btn ghost" type="button" onClick={copy}>{copied ? "Copied ✓" : "Copy"}</button>
            </div>
            <p style={{ fontSize: ".82rem", color: "var(--muted)", marginBottom: 0 }}>
              It won't be shown again. When they sign in, they'll be asked to choose a new password.
            </p>
          </>
        )}
      </div>
      <div className="m-foot">
        {!done ? (
          <>
            <button className="btn ghost" onClick={onClose}>Cancel</button>
            <button className="btn" onClick={save} disabled={busy}>{busy ? "Resetting…" : "Reset password"}</button>
          </>
        ) : (
          <button className="btn" onClick={onClose}>Done</button>
        )}
      </div>
    </Modal>
  );
}
