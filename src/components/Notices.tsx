import { useEffect, useState } from "react";
import { sb } from "../lib/supabase";
import { useWorkspace } from "../workspace";
import type { Notice } from "../types";
import { Empty } from "./common";

export function Notices() {
  const { user, isAdmin, revs, bump } = useWorkspace();
  const [list, setList] = useState<Notice[] | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    sb.from("notices")
      .select("id,title,body,author_id,created_at,profiles:author_id(full_name)")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) return console.warn(error);
        setList((data as unknown as Notice[]) || []);
      });
  }, [revs.notices]);

  async function post() {
    const t = title.trim();
    if (!t) return;
    setBusy(true);
    const { error } = await sb.from("notices").insert({ title: t, body: body.trim(), author_id: user.id });
    setBusy(false);
    if (error) return alert("Couldn't post: " + error.message);
    setTitle("");
    setBody("");
    bump("notices");
  }

  async function remove(id: string) {
    setDeleting(id);
    const { error } = await sb.from("notices").delete().eq("id", id);
    setDeleting(null);
    if (error) return alert("Couldn't delete: " + error.message);
    bump("notices");
  }

  return (
    <section>
      {isAdmin && (
        <div className="notice-compose">
          <h3>Post a notice</h3>
          <input className="field" placeholder="Notice title" maxLength={140} value={title} onChange={(e) => setTitle(e.target.value)} />
          <textarea className="field" placeholder="Write the announcement…" rows={3} value={body} onChange={(e) => setBody(e.target.value)} />
          <button className="btn" onClick={post} disabled={busy}>Post notice</button>
        </div>
      )}
      <div>
        {list && list.length === 0 && <Empty style={{ marginTop: 18 }}>No notices yet.</Empty>}
        {list?.map((n) => (
          <div key={n.id} className="notice">
            <h4>{n.title || "Notice"}</h4>
            {n.body && <div className="nbody">{n.body}</div>}
            <div className="nmeta">
              <span>
                {(n.profiles?.full_name || "Admin") + " · " +
                  new Date(n.created_at).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
              </span>
              {isAdmin && (
                <button className="mini del" style={{ marginLeft: "auto" }} disabled={deleting === n.id} onClick={() => remove(n.id)}>
                  Delete
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
