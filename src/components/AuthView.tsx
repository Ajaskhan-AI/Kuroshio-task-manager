import { useEffect, useRef, useState, type FormEvent } from "react";
import { sb } from "../lib/supabase";
import { useTheme } from "../lib/useTheme";

type Mode = "signin" | "signup" | "forgot";
/** forgot-password steps: ask for email → enter code + new password */
type ResetStep = "email" | "code";
type Msg = { text: string; kind: "ok" | "err" } | null;

const RESEND_SECONDS = 60;
const MIN_PASSWORD = 6;

interface Props {
  /** True when the user is already verified (e.g. came from the email link) and only needs a new password. */
  recovering: boolean;
  setRecovering: (v: boolean) => void;
  /** True when an admin set a temporary password and the user must choose a new one before continuing. */
  forced?: boolean;
}

function friendly(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("expired") || m.includes("invalid") && m.includes("otp") || m.includes("token has expired"))
    return "That code is wrong or has expired. Check the latest email, or send a new code.";
  if (m.includes("rate limit") || m.includes("security purposes") || m.includes("too many"))
    return "Too many attempts. Please wait a minute and try again.";
  if (m.includes("same as") || m.includes("different from the old"))
    return "Choose a password that's different from your old one.";
  return message;
}

export function AuthView({ recovering, setRecovering, forced = false }: Props) {
  const theme = useTheme();
  const [mode, setMode] = useState<Mode>(recovering ? "forgot" : "signin");
  const [step, setStep] = useState<ResetStep>("email");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [code, setCode] = useState("");
  const [newPass, setNewPass] = useState("");
  const [newPass2, setNewPass2] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [cooldown, setCooldown] = useState(0);
  const nameRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const signup = mode === "signup";

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  // Opened the reset link from the email → go straight to "choose a new password".
  useEffect(() => {
    if (recovering) {
      setMode("forgot");
      setMsg(null);
    }
  }, [recovering]);

  useEffect(() => {
    if (mode === "forgot" && step === "code" && !recovering) codeRef.current?.focus();
  }, [mode, step, recovering]);

  function switchTo(m: Mode) {
    setMode(m);
    setStep("email");
    setMsg(null);
    setCode("");
    setNewPass("");
    setNewPass2("");
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

  // ---- forgot password ----
  async function sendCode(e?: FormEvent) {
    e?.preventDefault();
    const addr = email.trim();
    if (!addr) return setMsg({ text: "Enter the email you sign in with.", kind: "err" });
    setBusy(true);
    setMsg(null);
    const { error } = await sb.auth.resetPasswordForEmail(addr, { redirectTo: window.location.origin });
    setBusy(false);
    if (error) return setMsg({ text: friendly(error.message), kind: "err" });
    setStep("code");
    setCooldown(RESEND_SECONDS);
    // Same message whether or not the address has an account (don't reveal who is registered).
    setMsg({ text: `If ${addr} has an account, we've sent it a verification code. Check your inbox (and spam).`, kind: "ok" });
  }

  function checkNewPassword(): string | null {
    if (newPass.length < MIN_PASSWORD) return `Password must be at least ${MIN_PASSWORD} characters.`;
    if (newPass !== newPass2) return "The two passwords don't match.";
    return null;
  }

  async function resetWithCode(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    const token = code.replace(/\s/g, "");
    if (!recovering && !/^\d{6,10}$/.test(token)) return setMsg({ text: "Enter the code from the email.", kind: "err" });
    const bad = checkNewPassword();
    if (bad) return setMsg({ text: bad, kind: "err" });

    setBusy(true);
    try {
      if (!recovering) {
        // Keep the auth screen up while we're signed in but haven't set the new password yet.
        setRecovering(true);
        const { error } = await sb.auth.verifyOtp({ email: email.trim(), token, type: "recovery" });
        if (error) {
          setRecovering(false);
          return setMsg({ text: friendly(error.message), kind: "err" });
        }
      }
      // Clearing the flag also ends the "temporary password" state set by an admin.
      const { error } = await sb.auth.updateUser({ password: newPass, data: { must_change_password: false } });
      if (error) return setMsg({ text: friendly(error.message), kind: "err" });
      setRecovering(false); // → signed in, into the workspace
    } finally {
      setBusy(false);
    }
  }

  async function cancelReset() {
    if (recovering) {
      await sb.auth.signOut();
      setRecovering(false);
    }
    switchTo("signin");
  }

  const tag =
    mode === "forgot"
      ? forced
        ? "Your admin gave you a temporary password. Choose your own password to continue."
        : recovering
        ? "Choose a new password for your account."
        : step === "email"
          ? "Enter your email and we'll send you a verification code."
          : "Enter the code from the email and choose a new password."
      : signup
        ? "Create your account to join the workspace."
        : "Sign in to your Kuroshio workspace.";

  return (
    <section className="auth wrap">
      <div className="card-auth">
        <button className="btn ghost theme-auth" onClick={theme.toggle} title="Toggle light / dark" aria-label="Toggle light or dark theme">
          {theme.icon}
        </button>
        <div className="brand">
          <img className="brand-logo" src="/logo.png" alt="Kuroshio AI" />
          <h1>{forced ? "Choose a new password" : mode === "forgot" ? "Reset password" : "Kuroshio Portal"}</h1>
        </div>
        <p className="tag">{tag}</p>

        {mode !== "forgot" && (
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
              minLength={MIN_PASSWORD}
              value={pass}
              onChange={(e) => setPass(e.target.value)}
            />
            {!signup && (
              <button type="button" className="link forgot-link" onClick={() => switchTo("forgot")}>
                Forgot password?
              </button>
            )}
            <button className="btn" type="submit" disabled={busy}>
              {signup ? "Create account" : "Sign in"}
            </button>
          </form>
        )}

        {mode === "forgot" && step === "email" && !recovering && (
          <form className="form" onSubmit={sendCode}>
            <input className="field" type="email" placeholder="Work email" autoComplete="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
            <button className="btn" type="submit" disabled={busy}>{busy ? "Sending…" : "Send code"}</button>
          </form>
        )}

        {mode === "forgot" && (step === "code" || recovering) && (
          <form className="form" onSubmit={resetWithCode}>
            {!recovering && (
              <>
                <div className="sent-to">
                  Code sent to <b>{email.trim()}</b>{" "}
                  <button type="button" className="link" onClick={() => { setStep("email"); setMsg(null); }}>Change</button>
                </div>
                <input
                  ref={codeRef}
                  className="field otp-field"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="Verification code"
                  maxLength={10}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/[^\d]/g, ""))}
                  aria-label="Verification code"
                />
              </>
            )}
            <input className="field" type="password" placeholder="New password" autoComplete="new-password" minLength={MIN_PASSWORD} value={newPass} onChange={(e) => setNewPass(e.target.value)} />
            <input className="field" type="password" placeholder="Confirm new password" autoComplete="new-password" minLength={MIN_PASSWORD} value={newPass2} onChange={(e) => setNewPass2(e.target.value)} />
            <button className="btn" type="submit" disabled={busy}>{busy ? "Saving…" : forced ? "Save & continue" : recovering ? "Set new password" : "Reset password & sign in"}</button>
            {!recovering && (
              <button type="button" className="link resend" disabled={cooldown > 0 || busy} onClick={() => sendCode()}>
                {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
              </button>
            )}
          </form>
        )}

        {msg && <div className={"msg " + msg.kind} role={msg.kind === "err" ? "alert" : "status"}>{msg.text}</div>}

        <p className="switch">
          {mode === "forgot" ? (
            forced ? (
              <><button className="link" onClick={cancelReset}>Sign out</button></>
            ) : (
              <>Remembered it? <button className="link" onClick={cancelReset}>Back to sign in</button></>
            )
          ) : signup ? (
            <>Already have an account? <button className="link" onClick={() => switchTo("signin")}>Sign in</button></>
          ) : (
            <>New here? <button className="link" onClick={() => switchTo("signup")}>Create an account</button></>
          )}
        </p>
      </div>
    </section>
  );
}
