import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sb } from "../lib/supabase";
import { FILE_ACCEPT, MAX_FILE, uploadTaskFile, useFileUrl } from "../lib/files";
import { errMsg } from "../lib/utils";
import { useWorkspace } from "../workspace";
import type { Message, Profile, Task } from "../types";
import { Empty } from "./common";

const EMOJIS = "😀 😄 😁 😊 🙂 😉 😍 😎 🤩 🤔 😅 😂 🥳 😭 😢 😡 😴 🙌 👍 👎 👏 🙏 💪 👌 ✌️ 🔥 ✨ ⭐ ✅ ❌ ⚠️ ❗ ❓ 💡 📌 📎 📅 ⏰ 🚀 🎉 🎯 💯 ❤️ 👀 🤝 📞 📧 🛠️".split(" ");

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Task discussion: messages, files, emoji and @mentions. */
export function TaskChat({ task }: { task: Task }) {
  const { user, people, revs } = useWorkspace();
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mentionIds, setMentionIds] = useState<string[]>([]);
  const [mq, setMq] = useState<string | null>(null); // active @query
  const [mqIndex, setMqIndex] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const emojiRef = useRef<HTMLDivElement>(null);
  const emojiBtnRef = useRef<HTMLButtonElement>(null);
  // Messages already there when the chat opened don't animate; only new arrivals do.
  const initialIds = useRef<Set<string> | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await sb
      .from("messages")
      .select("id,task_id,body,file_url,file_name,file_type,author_id,created_at,mentions,profiles:author_id(full_name)")
      .eq("task_id", task.id)
      .order("created_at");
    if (error) return console.warn(error);
    const list = (data as unknown as Message[]) || [];
    if (!initialIds.current) initialIds.current = new Set(list.map((m) => m.id));
    setMessages(list);
  }, [task.id]);

  useEffect(() => {
    load();
  }, [load, revs.messages]);

  useEffect(() => {
    const b = boxRef.current;
    if (b) b.scrollTop = b.scrollHeight;
  }, [messages]);

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

  const others = people.filter((p) => p.id !== user.id && p.full_name);
  const suggestions = useMemo(() => {
    if (mq === null) return [];
    const q = mq.toLowerCase();
    return others.filter((p) => (p.full_name || "").toLowerCase().split(/\s+/).some((w) => w.startsWith(q)) || (p.full_name || "").toLowerCase().startsWith(q)).slice(0, 6);
  }, [mq, others]);

  const mentionRe = useMemo(() => {
    const names = people.map((p) => p.full_name).filter((n): n is string => !!n).sort((a, b) => b.length - a.length);
    return names.length ? new RegExp("(@(?:" + names.map(escapeRe).join("|") + "))", "g") : null;
  }, [people]);

  function onType(v: string) {
    setText(v);
    const ta = inputRef.current;
    const upto = v.slice(0, ta?.selectionStart ?? v.length);
    const m = upto.match(/(?:^|\s)@([^\s@]{0,20})$/);
    setMq(m ? m[1] : null);
    setMqIndex(0);
  }

  function pickMention(p: Profile) {
    const ta = inputRef.current;
    const pos = ta?.selectionStart ?? text.length;
    const before = text.slice(0, pos).replace(/@([^\s@]{0,20})$/, "@" + p.full_name + " ");
    const next = before + text.slice(pos);
    setText(next);
    setMentionIds((ids) => (ids.includes(p.id) ? ids : [...ids, p.id]));
    setMq(null);
    requestAnimationFrame(() => {
      ta?.focus();
      try { ta?.setSelectionRange(before.length, before.length); } catch { /* ignore */ }
    });
  }

  function insertEmoji(em: string) {
    const ta = inputRef.current;
    const s = ta?.selectionStart ?? text.length;
    const en = ta?.selectionEnd ?? text.length;
    setText(text.slice(0, s) + em + text.slice(en));
    const pos = s + em.length;
    requestAnimationFrame(() => {
      ta?.focus();
      try { ta?.setSelectionRange(pos, pos); } catch { /* ignore */ }
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
        const up = await uploadTaskFile(task.id, file);
        fi = { file_url: up.url, file_name: up.name, file_type: up.type };
      }
      // Only keep mentions whose "@Name" is still in the text.
      const mentions = mentionIds.filter((id) => {
        const n = people.find((p) => p.id === id)?.full_name;
        return n && body.includes("@" + n);
      });
      const { error } = await sb.from("messages").insert({ task_id: task.id, author_id: user.id, body, mentions, ...fi });
      if (error) return alert("Couldn't send: " + error.message);
      setText("");
      setFile(null);
      setMentionIds([]);
      if (fileRef.current) fileRef.current.value = "";
      load();
    } catch (e) {
      alert(errMsg(e, "Couldn't send the message."));
    } finally {
      setBusy(false);
    }
  }

  function renderBody(body: string) {
    if (!mentionRe) return body;
    return body.split(mentionRe).map((part, i) => (i % 2 === 1 ? <span key={i} className="mention">{part}</span> : part));
  }

  return (
    <div className="chat-pane">
      <div className="chat-msgs" ref={boxRef}>
        {messages === null ? (
          <Empty>Loading…</Empty>
        ) : messages.length === 0 ? (
          <Empty>No messages yet. Start the discussion — type @ to mention someone.</Empty>
        ) : (
          messages.map((m) => {
            const mine = m.author_id === user.id;
            const nm = m.profiles?.full_name || "Someone";
            const when = new Date(m.created_at).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
            const mentionsMe = (m.mentions || []).includes(user.id);
            return (
              <div
                key={m.id}
                className={"cmsg" + (mine ? " me" : "") + (mentionsMe ? " mentions-me" : "") + (initialIds.current && !initialIds.current.has(m.id) ? " cmsg-new" : "")}
              >
                <div className="cmeta">{(mine ? "You" : nm) + " · " + when}</div>
                {m.body && <div className="cbubble">{renderBody(m.body)}</div>}
                {m.file_url && <ChatFile url={m.file_url} name={m.file_name} type={m.file_type} />}
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
        {mq !== null && suggestions.length > 0 && (
          <div className="mention-panel" role="listbox" aria-label="Mention someone">
            {suggestions.map((p, i) => (
              <button
                key={p.id}
                type="button"
                role="option"
                aria-selected={i === mqIndex}
                className={i === mqIndex ? "on" : ""}
                onMouseDown={(e) => { e.preventDefault(); pickMention(p); }}
              >
                @{p.full_name}<span className="muted small">{p.designation ? " · " + p.designation : ""}</span>
              </button>
            ))}
          </div>
        )}
        <input type="file" ref={fileRef} accept={FILE_ACCEPT} className="hidden" onChange={(e) => pickFile(e.target.files?.[0])} />
        <button className="iconbtn" ref={emojiBtnRef} title="Emoji" onClick={() => setEmojiOpen((o) => !o)}>😊</button>
        <button className="iconbtn" title="Attach a file" onClick={() => fileRef.current?.click()}>📎</button>
        <textarea
          ref={inputRef}
          className="field"
          placeholder="Write a message… (@ to mention)"
          rows={1}
          autoFocus
          value={text}
          onChange={(e) => onType(e.target.value)}
          onKeyDown={(e) => {
            if (mq !== null && suggestions.length) {
              if (e.key === "ArrowDown") { e.preventDefault(); setMqIndex((i) => (i + 1) % suggestions.length); return; }
              if (e.key === "ArrowUp") { e.preventDefault(); setMqIndex((i) => (i - 1 + suggestions.length) % suggestions.length); return; }
              if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pickMention(suggestions[mqIndex]); return; }
              if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setMq(null); return; }
            }
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button className="btn" onClick={send} disabled={busy}>Send</button>
      </div>
    </div>
  );
}

function ChatFile({ url, name, type }: { url: string; name: string | null; type: string | null }) {
  const href = useFileUrl(url);
  if ((type || "").startsWith("image/")) {
    return (
      <a href={href || "#"} target="_blank" rel="noopener">
        {href ? <img className="cimg" src={href} alt={name || "image"} /> : <span className="cfile">🖼️ {name || "image"}</span>}
      </a>
    );
  }
  return <a className="cfile" href={href || "#"} target="_blank" rel="noopener">📄 {name || "file"}</a>;
}
