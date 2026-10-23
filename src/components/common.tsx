import { useEffect, type CSSProperties, type ReactNode } from "react";
import { colorFor, initials } from "../lib/utils";

interface AvatarProps {
  person?: { id?: string | null; full_name?: string | null; avatar_url?: string | null } | null;
  /** Override image (e.g. a local preview before upload). */
  src?: string | null;
  size?: number;
}

export function Avatar({ person, src, size }: AvatarProps) {
  const url = src ?? person?.avatar_url;
  const base: CSSProperties = size ? { width: size, height: size } : {};
  if (url) {
    return (
      <div
        className="av"
        style={{ ...base, backgroundImage: `url('${url}')`, backgroundSize: "cover", backgroundPosition: "center", backgroundColor: "transparent" }}
      />
    );
  }
  return (
    <div className="av" style={{ ...base, backgroundColor: colorFor(person?.id) }}>
      {initials(person?.full_name)}
    </div>
  );
}

interface ModalProps {
  onClose: () => void;
  className?: string;
  children: ReactNode;
}

export function Modal({ onClose, className, children }: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={"modal" + (className ? " " + className : "")}>{children}</div>
    </div>
  );
}

export function Empty({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div className="empty" style={style}>
      {children}
    </div>
  );
}

export function Badge({ n }: { n: number }) {
  if (!n) return null;
  return <span className="badge">{n}</span>;
}
