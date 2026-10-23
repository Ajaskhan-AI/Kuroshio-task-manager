import { createContext, useContext } from "react";
import type { User } from "@supabase/supabase-js";
import type { Profile, Submission, Subtask, Task, TaskDependency, UserStatus } from "./types";
import type { TaskIndex } from "./lib/tasks";

/** Revision counters — bump one to make every view that depends on that table reload. */
export interface Revs {
  profiles: number;
  notices: number;
  attendance: number;
  leave: number;
  tasks: number;
  subtasks: number;
  deps: number;
  subs: number;
  activity: number;
  time: number;
  templates: number;
  messages: number;
}

export type DetailTab = "overview" | "subtasks" | "discussion" | "deliverables" | "time" | "activity";

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
  deps: TaskDependency[];
  subtasks: Subtask[];
  pendingSubs: Submission[];
  ix: TaskIndex;
  revs: Revs;
  bump: (k: keyof Revs) => void;
  approvals: Profile[];
  setUserStatus: (id: string, status: UserStatus) => Promise<void>;
  /** Open the task detail window (optionally on a given tab). */
  openTask: (taskId: string, tab?: DetailTab) => void;
  /** Open the task editor (create when no task given). */
  openEditor: (task?: Task | null) => void;
  /** The task currently open in the detail window, if any. */
  openTaskId: string | null;
}

export const WorkspaceContext = createContext<WorkspaceCtx | null>(null);

export function useWorkspace(): WorkspaceCtx {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used inside <Workspace>");
  return ctx;
}
