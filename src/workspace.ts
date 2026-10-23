import { createContext, useContext } from "react";
import type { User } from "@supabase/supabase-js";
import type { Profile, Task, UserStatus } from "./types";

/** Revision counters — bump one to make every view that depends on that table reload. */
export interface Revs {
  profiles: number;
  notices: number;
  attendance: number;
  leave: number;
}

export interface WorkspaceCtx {
  user: User;
  profile: Profile;
  isAdmin: boolean;
  setProfile: (p: Profile) => void;
  people: Profile[]; // approved members
  peopleById: Record<string, Profile>;
  nameOf: (id: string) => string;
  tasks: Task[];
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  loadTasks: () => Promise<void>;
  revs: Revs;
  bump: (k: keyof Revs) => void;
  approvals: Profile[];
  setUserStatus: (id: string, status: UserStatus) => Promise<void>;
  openChat: (t: Task) => void;
}

export const WorkspaceContext = createContext<WorkspaceCtx | null>(null);

export function useWorkspace(): WorkspaceCtx {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used inside <Workspace>");
  return ctx;
}
