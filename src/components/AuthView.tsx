import { useRef, useState, type FormEvent } from "react";
import { sb } from "../lib/supabase";
import { useTheme } from "../lib/useTheme";

type Mode = "signin" | "signup";
type Msg = { text: string; kind: "ok" | "err" } | null;

export function AuthView() {
  const theme = useTheme();
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const signup = mode === "signup";

  function switchTo(m: Mode) {
    setMode(m);
    setMsg(null);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    setBusy(true);
    try {
      if (signup) {
        const n = name.trim();
        if (!n) {
          setMsg({ text: "Please enter your name.", kind: "err" });
          nameRef.current?.focus();
          return;
        }
        const { data, error } = await sb.auth.signUp({
          email: email.trim(),
          password: pass,
          options: { data: { full_name: n } },
        });
        if (error) return setMsg({ text: error.message, kind: "err" });
        if (!data.session) {
          setMsg({ text: "Account created. You can sign in now.", kind: "ok" });
          setMode("signin");
        }
      } else {
        const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password: pass });
        if (error) setMsg({ text: error.message, kind: "err" });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="auth wrap">
      <div className="card-auth">
        <button className="btn ghost theme-auth" onClick={theme.toggle} title="Toggle light / dark" aria-label="Toggle light or dark theme">
          {theme.icon}
        </button>
        <div className="brand">
          <img className="brand-logo" src="/logo.png" alt="Kuroshio AI" />
          <h1>Kuroshio Portal</h1>
        </div>
        <p className="tag">{signup ? "Create your account to join the workspace." : "Sign in to your Kuroshio workspace."}</p>
        <form className="form" onSubmit={submit} autoComplete="on">
          {signup && (
            <input ref={nameRef} className="field" placeholder="Full name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
          )}
          <input className="field" type="email" placeholder="Work email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <input
            className="field"
            type="password"
            placeholder="Password"
            autoComplete={signup ? "new-password" : "current-password"}
            required
            minLength={6}
            value={pass}
            onChange={(e) => setPass(e.target.value)}
          />
          <button className="btn" type="submit" disabled={busy}>
            {signup ? "Create account" : "Sign in"}
          </button>
        </form>
        {msg && <div className={"msg " + msg.kind}>{msg.text}</div>}
        <p className="switch">
          {signup ? (
            <>Already have an account? <button className="link" onClick={() => switchTo("signin")}>Sign in</button></>
          ) : (
            <>New here? <button className="link" onClick={() => switchTo("signup")}>Create an account</button></>
          )}
        </p>
      </div>
    </section>
  );
}
