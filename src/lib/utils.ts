const COLORS = ["#0b7a86", "#2e7d9e", "#8a5a2e", "#2e9e6b", "#7d4ba3", "#c0493b", "#4a6b2e", "#b5852e"];

export function colorFor(id?: string | null): string {
  const v = id || "";
  let s = 0;
  for (let i = 0; i < v.length; i++) s = (s + v.charCodeAt(i)) % COLORS.length;
  return COLORS[s];
}

export function initials(name?: string | null): string {
  const p = (name || "").trim().split(/\s+/);
  return ((p[0] || "")[0] || "?").toUpperCase() + ((p[1] || "")[0] || "").toUpperCase();
}

/** Parse a YYYY-MM-DD string as a local date (no timezone shift). */
export function parseLocalDate(d: string): Date {
  const p = d.split("-");
  return new Date(+p[0], +p[1] - 1, +p[2]);
}

export function ageFrom(dob?: string | null): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  const n = new Date();
  let a = n.getFullYear() - d.getFullYear();
  const m = n.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && n.getDate() < d.getDate())) a--;
  return a >= 0 && a < 120 ? a : null;
}

export function fmtDate(d?: string | null): string {
  if (!d) return "";
  return parseLocalDate(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function fmtAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function todayStr(): string {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

export function fmtT(t?: string | null): string {
  return t ? new Date(t).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "—";
}

export function hoursBetween(a: string, b: string): string {
  return ((new Date(b).getTime() - new Date(a).getTime()) / 3600000).toFixed(1) + " h";
}

export function daysBetween(s: string, e: string): number {
  const a = new Date(s).getTime();
  const b = new Date(e).getTime();
  if (b < a) return 0;
  return Math.round((b - a) / 86400000) + 1;
}

export function errMsg(e: unknown, fallback = "Something went wrong."): string {
  if (e && typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string") {
    return (e as { message: string }).message;
  }
  return typeof e === "string" ? e : fallback;
}

/** Shared style for red "danger" ghost buttons. */
export const dangerGhost = {
  color: "var(--danger)",
  borderColor: "color-mix(in srgb,var(--danger) 45%,var(--line))",
} as const;
