import { useEffect, useState } from "react";
import { sb } from "../lib/supabase";
import { errMsg } from "../lib/utils";
import { useWorkspace } from "../workspace";
import type { Profile, Role } from "../types";
import { Avatar, Modal } from "./common";

const MAX_PHOTO = 3 * 1024 * 1024;

type Form = {
  full_name: string;
  phone: string;
  dob: string;
  joining_date: string;
  designation: string;
  college: string;
  branch: string;
  address: string;
  skills: string;
  hobbies: string;
  role: Role;
};

function toForm(m: Profile): Form {
  return {
    full_name: m.full_name || "",
    phone: m.phone || "",
    dob: m.dob || "",
    joining_date: m.joining_date || "",
    designation: m.designation || "",
    college: m.college || "",
    branch: m.branch || "",
    address: m.address || "",
    skills: m.skills || "",
    hobbies: m.hobbies || "",
    role: m.role || "member",
  };
}

const orNull = (s: string) => s.trim() || null;

export function EditProfileModal({ m, onClose }: { m: Profile; onClose: () => void }) {
  const { user, profile, isAdmin, setProfile, bump } = useWorkspace();
  const [f, setF] = useState<Form>(() => toForm(m));
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const own = m.id === user.id;
  const showRole = isAdmin && !own; // only admins editing someone else see access level
  const set = <K extends keyof Form>(k: K) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF((x) => ({ ...x, [k]: e.target.value }));

  useEffect(() => {
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function save() {
    const name = f.full_name.trim();
    if (!name) return setErr("Name can't be empty.");
    const patch: Record<string, string | null> = {
      full_name: name,
      phone: orNull(f.phone),
      dob: f.dob || null,
      joining_date: f.joining_date || null,
      designation: orNull(f.designation),
      college: orNull(f.college),
      branch: orNull(f.branch),
      address: orNull(f.address),
      skills: orNull(f.skills),
      hobbies: orNull(f.hobbies),
    };
    if (showRole) patch.role = f.role;

    const photo = own ? file : null; // storage only allows your own folder
    if (photo && photo.size > MAX_PHOTO) return setErr("Photo must be under 3 MB.");

    setBusy(true);
    setErr("");
    try {
      if (photo) {
        const ext = photo.type === "image/png" ? "png" : "jpg";
        const path = user.id + "/avatar." + ext;
        const up = await sb.storage.from("avatars").upload(path, photo, { upsert: true, contentType: photo.type });
        if (up.error) throw up.error;
        const pub = sb.storage.from("avatars").getPublicUrl(path).data.publicUrl;
        patch.avatar_url = pub + "?v=" + Date.now();
      }
      const { error } = await sb.from("profiles").update(patch).eq("id", m.id);
      if (error) return setErr(error.message);
      if (own) setProfile({ ...profile, full_name: name, ...(patch.avatar_url ? { avatar_url: patch.avatar_url } : {}) });
      onClose();
      bump("profiles");
    } catch (e) {
      setErr(errMsg(e, "Couldn't upload the photo."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose}>
      <div className="m-head">
        <h3>{own ? "Edit my profile" : "Edit " + (m.full_name || "profile")}</h3>
        <button className="m-close" onClick={onClose}>&times;</button>
      </div>
      <div className="m-body">
        <div className="fgrid">
          {own && (
            <div className="full">
              <label className="lbl">Profile photo</label>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <Avatar person={m} src={preview} size={58} />
                <div>
                  <input type="file" accept="image/jpeg,image/jpg,image/png" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                  <div style={{ color: "var(--muted)", fontSize: ".74rem", marginTop: 4 }}>JPG or PNG, up to 3 MB</div>
                </div>
              </div>
            </div>
          )}
          <div className="full"><label className="lbl">Full name</label><input className="field" value={f.full_name} onChange={set("full_name")} /></div>
          <div><label className="lbl">Email</label><input className="field" value={m.email || (own ? user.email : "") || ""} disabled /></div>
          <div><label className="lbl">Phone</label><input className="field" value={f.phone} onChange={set("phone")} /></div>
          <div><label className="lbl">Date of birth</label><input className="field" type="date" value={f.dob} onChange={set("dob")} /></div>
          <div><label className="lbl">Joining date</label><input className="field" type="date" value={f.joining_date} onChange={set("joining_date")} /></div>
          <div className="full"><label className="lbl">Role / designation</label><input className="field" placeholder="e.g. IoT Engineer" value={f.designation} onChange={set("designation")} /></div>
          <div><label className="lbl">College</label><input className="field" value={f.college} onChange={set("college")} /></div>
          <div><label className="lbl">Branch of study</label><input className="field" value={f.branch} onChange={set("branch")} /></div>
          <div className="full"><label className="lbl">Address</label><textarea className="field" value={f.address} onChange={set("address")} /></div>
          <div className="full">
            <label className="lbl">Skills <span style={{ fontWeight: 400 }}>(comma separated)</span></label>
            <input className="field" placeholder="Python, Modbus, PCB design" value={f.skills} onChange={set("skills")} />
          </div>
          <div className="full"><label className="lbl">Hobbies</label><input className="field" value={f.hobbies} onChange={set("hobbies")} /></div>
          {showRole && (
            <div className="full">
              <label className="lbl">Access level</label>
              <select className="field" value={f.role} onChange={set("role")}>
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          )}
        </div>
        {err && <div className="msg err">{err}</div>}
      </div>
      <div className="m-foot">
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn" onClick={save} disabled={busy}>Save</button>
      </div>
    </Modal>
  );
}
