import { useCallback } from "react";
import { sb } from "./supabase";
import { useWorkspace } from "../workspace";
import { toast } from "../components/common";
import type { Task } from "../types";

/** Optimistic task updates shared by the board and the drawer. */
export function useTaskActions() {
  const { user, isAdmin, setTasks, loadTasks } = useWorkspace();

  const canMove = useCallback(
    (t: Task) => isAdmin || (t.assignee_ids || []).includes(user.id),
    [isAdmin, user.id],
  );

  const update = useCallback(
    async (id: string, patch: Partial<Task>) => {
      const now = new Date().toISOString();
      setTasks((ts) =>
        ts.map((x) => {
          if (x.id !== id) return x;
          const next = { ...x, ...patch, updated_at: now };
          // Keep the completion stamp in step with optimistic status changes.
          if (patch.status === "done" && x.status !== "done") Object.assign(next, { completed_at: now, completed_by: user.id });
          if (patch.status && patch.status !== "done") Object.assign(next, { completed_at: null, completed_by: null });
          return next;
        }),
      );
      const { error } = await sb.from("tasks").update(patch).eq("id", id);
      if (error) {
        toast(error.message || "Couldn't save the change.", "error");
        loadTasks();
        return false;
      }
      return true;
    },
    [setTasks, loadTasks, user.id],
  );

  const remove = useCallback(
    async (id: string) => {
      setTasks((ts) => ts.filter((x) => x.id !== id));
      const { error } = await sb.from("tasks").delete().eq("id", id);
      if (error) {
        toast("Couldn't delete: " + error.message, "error");
        loadTasks();
        return false;
      }
      toast("Task deleted");
      return true;
    },
    [setTasks, loadTasks],
  );

  return { canMove, update, remove };
}
