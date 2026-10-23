import { useCallback, useEffect, useRef, useState } from "react";
import { chanName, sb } from "../lib/supabase";
import { errMsg } from "../lib/utils";
import { useWorkspace } from "../workspace";
import type { Message, Task } from "../types";
import { Empty, Modal } from "./common";

const MAX_FILE = 10 * 1024 * 1024;
const EMOJIS = "😀 😄 😁 😊 🙂 😉 😍 😎 🤩 🤔 😅 😂 🥳 😭 😢 😡 😴 🙌 👍 👎 👏 🙏 💪 👌 ✌️ 🔥 ✨ ⭐ ✅ ❌ ⚠️ ❗ ❓ 💡 📌 📎 📅 ⏰ 🚀 🎉 🎯 💯 ❤️ 👀 🤝 📞 📧 🛠️".split(" ");

export function ChatModal({ task, onClose }: { task: Task; onClose: () => void }) {
  const { user } = useWorkspace();
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const emojiRef = useRef<HTMLDivElement>(null);
  const emojiBtnRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    const { data, error } = await sb
      .from("messages")
      .select("id,task_id,body,file_url,file_name,file_type,author_id,created_at,profiles:author_id(full_name)")
      .eq("task_id", task.id)
      .order("created_at");
    if (error) return console.warn(error);
    setMessages((data as unknown as Message[]) || []);
  }, [task.id]);

  useEffect(() => {
    setMessages(null);
    load();
    const ch = sb
      .channel(chanName("chat-" + task.id))
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: "task_id=eq." + task.id }, () => load())
      .subscribe();
    return () => {
      sb.removeChannel(ch);
    };
  }, [task.id, load]);

  useEffect(() => {
    const b = boxRef.current;
    if (b) b.scrollTop = b.scrollHeight;
  }, [messages]);

  // close emoji panel on outside click (ignore the toggle button itself)
  useEffect(() => {
    if (!emojiOpen) return;
    const h = (e: MouseEvent) => {
      const t = e.target as Node;
      if (emojiRef.current?.contains(t) || emojiBtnRef.current?.contains(t)) return;
      setEmojiOpen(false);
    };
    document.addEventListener("click", h);
    return () => document.removeEventListener("click", h);
  }, [emojiOpen]);

  function insertEmoji(em: string) {
    const ta = inputRef.current;
    const s = ta?.selectionStart ?? text.length;
    const en = ta?.selectionEnd ?? text.length;
    const next = text.slice(0, s) + em + text.slice(en);
    setText(next);
    const pos = s + em.length;
    requestAnimationFrame(() => {
      ta?.focus();
      try {
        ta?.setSelectionRange(pos, pos);
      } catch {
        /* ignore */
      }
    });
  }

  function pickFile(f: File | undefined) {
    if (!f) return setFile(null);
    if (f.size > MAX_FILE) {
      alert("File must be under 10 MB.");
      if (fileRef.current) fileRef.current.value = "";
      return setFile(null);
    }
    setFile(f);
  }

  async function send() {
    const body = text.trim();
    if (!body && !file) return;
    setBusy(true);
    try {
      let fi: { file_url: string | null; file_name: string | null; file_type: string | null } = { file_url: null, file_name: null, file_type: null };
      if (file) {
        const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = task.id + "/" + Date.now() + "-" + safe;
        const up = await sb.storage.from("task-files").upload(path, file, { contentType: file.type || "application/octet-stream" });
        if (up.error) throw up.error;
        const pub = sb.storage.from("task-files").getPublicUrl(path).data.publicUrl;
        fi = { file_url: pub, file_name: file.name, file_type: file.type || "" };
      }
      const { error } = await sb.from("messages").insert({ task_id: task.id, author_id: user.id, body, ...fi });
      if (error) return alert("Couldn't send: " + error.message);
      setText("");
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      load();
    } catch (e) {
      alert(errMsg(e, "Couldn't send the message."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose} className="chat-modal">
      <div className="m-head">
        <h3>{task.title || "Discussion"}</h3>
        <button className="m-close" onClick={onClose}>&times;</button>
      </div>
      <div className="chat-msgs" ref={boxRef}>
        {messages === null ? (
          <Empty>Loading…</Empty>
        ) : messages.length === 0 ? (
          <Empty>No messages yet. Start the discussion.</Empty>
        ) : (
          messages.map((m) => {
            const mine = m.author_id === user.id;
            const nm = m.profiles?.full_name || "Someone";
            const when = new Date(m.created_at).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
            return (
              <div key={m.id} className={"cmsg" + (mine ? " me" : "")}>
                <div className="cmeta">{(mine ? "You" : nm) + " · " + when}</div>
                {m.body && <div className="cbubble">{m.body}</div>}
                {m.file_url &&
                  ((m.file_type || "").startsWith("image/") ? (
                    <a href={m.file_url} target="_blank" rel="noopener">
                      <img className="cimg" src={m.file_url} alt={m.file_name || "image"} />
                    </a>
                  ) : (
                    <a className="cfile" href={m.file_url} target="_blank" rel="noopener">📄 {m.file_name || "file"}</a>
                  ))}
              </div>
            );
          })
        )}
      </div>
      {file && <div className="attach-chip">📎 {file.name} — will send with your message</div>}
      <div className="chat-foot">
        {emojiOpen && (
          <div className="emoji-panel" ref={emojiRef}>
            {EMOJIS.map((em) => (
              <button key={em} type="button" onClick={() => insertEmoji(em)}>{em}</button>
            ))}
          </div>
        )}
        <input type="file" ref={fileRef} accept=".pdf,.doc,.docx,image/jpeg,image/png" className="hidden" onChange={(e) => pickFile(e.target.files?.[0])} />
        <button className="iconbtn" ref={emojiBtnRef} title="Emoji" onClick={() => setEmojiOpen((o) => !o)}>😊</button>
        <button className="iconbtn" title="Attach a file (PDF, Word, JPG, PNG)" onClick={() => fileRef.current?.click()}>📎</button>
        <textarea
          ref={inputRef}
          className="field"
          placeholder="Write a message…"
          rows={1}
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button className="btn" onClick={send} disabled={busy}>Send</button>
      </div>
    </Modal>
  );
}
