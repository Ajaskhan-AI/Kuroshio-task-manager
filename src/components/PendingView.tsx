import { useEffect, useRef } from "react";
import { chanName, sb } from "../lib/supabase";

interface Props {
  userId: string;
  blocked: boolean;
  onApproved: () => void;
}

export function PendingView({ userId, blocked, onApproved }: Props) {
  const approvedRef = useRef(onApproved);
  approvedRef.current = onApproved;

  // Watch our own profile; when approved, reload into the app.
  useEffect(() => {
    const ch = sb
      .channel(chanName("me-" + userId))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles", filter: "id=eq." + userId }, (p) => {
        if ((p.new as { status?: string })?.status === "approved") approvedRef.current();
      })
      .subscribe();
    return () => {
      sb.removeChannel(ch);
    };
  }, [userId]);

  return (
    <section className="pending-wrap wrap">
      <div className="pending-card">
        <div className="ic" aria-hidden="true">{blocked ? "🚫" : "⏳"}</div>
        <h2>{blocked ? "Access unavailable" : "Awaiting approval"}</h2>
        <p>
          {blocked
            ? "Your access to the Kuroshio workspace is currently turned off. Please contact your admin if you think this is a mistake."
            : "Your account has been created. An admin needs to approve you before you can access the Kuroshio workspace. This page will open automatically once you're approved."}
        </p>
        <button className="btn ghost" onClick={() => sb.auth.signOut()}>Sign out</button>
      </div>
    </section>
  );
}
