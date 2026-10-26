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
      setTasks((ts) => ts.map((x) => (x.id === id ? { ...x, ...patch, updated_at: new Date().toISOString() } : x)));
      const { error } = await sb.from("tasks").update(patch).eq("id", id);
      if (error) {
        toast(error.message || "Couldn't save the change.", "error");
        loadTasks();
        return false;
      }
      return true;
    },
    [setTasks, loadTasks],
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
