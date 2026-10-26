import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { sb } from "./lib/supabase";
import type { Profile } from "./types";
import { AuthView } from "./components/AuthView";
import { PendingView } from "./components/PendingView";
import { Workspace } from "./components/Workspace";

const IDLE_MS = 30 * 60 * 1000;

export default function App() {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  // While resetting a password the user is briefly signed in (after the code is verified)
  // but must stay on the auth screen until they've chosen a new password.
  const [recovering, setRecovering] = useState(false);
  // Set when an admin gave this user a temporary password: they must pick their own first.
  const [mustChange, setMustChange] = useState(false);
  const userId = user?.id ?? null;

  // ---- session ----
  useEffect(() => {
    // Keep the same object if the user didn't change (token refreshes fire often).
    const apply = (u: User | null) => setUser((prev) => (prev?.id === u?.id ? prev : u));
    sb.auth.getSession().then(({ data }) => {
      setMustChange(!!data.session?.user?.user_metadata?.must_change_password);
      apply(data.session?.user ?? null);
      setReady(true);
    });
    const { data } = sb.auth.onAuthStateChange((event, session) => {
      // Arriving from a reset link in the email (instead of typing the code).
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
      setMustChange(!!session?.user?.user_metadata?.must_change_password);
      apply(session?.user ?? null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  // ---- profile ----
  const loadProfile = useCallback(async (uid: string) => {
    const { data } = await sb.from("profiles").select("*").eq("id", uid).single();
    setProfile((data as Profile | null) ?? { id: uid, role: "member", full_name: "" });
  }, []);

  useEffect(() => {
    setProfile(null);
    if (userId) loadProfile(userId);
  }, [userId, loadProfile]);

  // ---- idle auto-logout (security on shared devices) ----
  useEffect(() => {
    if (!userId) return;
    let timer: number | undefined;
    const reset = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        sb.auth.signOut().then(() => {
          try {
            alert("You were signed out after 30 minutes of inactivity.");
          } catch {
            /* ignore */
          }
        });
      }, IDLE_MS);
    };
    const events = ["click", "keydown", "mousemove", "touchstart"] as const;
    events.forEach((ev) => document.addEventListener(ev, reset, { passive: true }));
    reset();
    return () => {
      window.clearTimeout(timer);
      events.forEach((ev) => document.removeEventListener(ev, reset));
    };
  }, [userId]);

  if (!ready) return null;
  if (!user || recovering || mustChange) {
    return (
      <AuthView
        recovering={(recovering || mustChange) && !!user}
        forced={mustChange && !!user}
        setRecovering={(v) => {
          setRecovering(v);
          if (!v) setMustChange(false);
        }}
      />
    );
  }
  if (!profile) return null; // loading profile

  const approved = profile.role === "admin" || profile.status === "approved";
  if (!approved) {
    return (
      <PendingView
        userId={user.id}
        blocked={profile.status === "blocked"}
        onApproved={() => loadProfile(user.id)}
      />
    );
  }
  return <Workspace user={user} profile={profile} setProfile={setProfile} />;
}
