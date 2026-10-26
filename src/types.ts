export type Role = "admin" | "member";
export type UserStatus = "pending" | "approved" | "blocked";

export interface Profile {
  id: string;
  full_name: string | null;
  email?: string | null;
  role: Role;
  status?: UserStatus | null;
  phone?: string | null;
  dob?: string | null;
  joining_date?: string | null;
  designation?: string | null;
  college?: string | null;
  branch?: string | null;
  address?: string | null;
  skills?: string | null;
  hobbies?: string | null;
  avatar_url?: string | null;
}

export type TaskStatus = "todo" | "in_progress" | "in_review" | "done";
export type Priority = "low" | "med" | "high" | "critical";

export interface Task {
  id: string;
  title: string | null;
  description?: string | null;
  status: TaskStatus | null;
  priority: Priority | null;
  due_date: string | null;
  assignee_ids: string[] | null;
  project?: string | null;
  blocked_reason?: string | null;
  created_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  /** When it was last moved to Done (from the activity log; falls back to updated_at). Client-side only. */
  completed_at?: string | null;
  /** Who moved it to Done. Client-side only. */
  completed_by?: string | null;
}

export interface Subtask {
  id: string;
  task_id: string;
  title: string;
  status: "todo" | "in_progress" | "done";
  position: number | null;
  created_at: string;
}

export interface Activity {
  id: string;
  task_id: string;
  actor_id: string | null;
  kind: string;
  detail: Record<string, unknown> | null;
  created_at: string;
}

export type DrawerTab = "details" | "chat" | "activity";

export interface AuthorRef {
  full_name: string | null;
}

export interface Message {
  id: string;
  task_id: string;
  body: string | null;
  file_url: string | null;
  file_name: string | null;
  file_type: string | null;
  author_id: string;
  created_at: string;
  profiles?: AuthorRef | null;
}

export interface Notice {
  id: string;
  title: string | null;
  body: string | null;
  author_id: string;
  created_at: string;
  profiles?: AuthorRef | null;
}

export interface Attendance {
  id: string;
  user_id: string;
  day: string;
  check_in: string | null;
  check_out: string | null;
  status?: string | null;
  office_id?: string | null;
  distance_m?: number | null;
  check_in_accuracy_m?: number | null;
  location_status?: "inside" | "outside" | "no_location" | null;
  outside_reason?: string | null;
  review_status?: "pending" | "approved" | "rejected" | null;
}

export interface Office {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radius_m: number;
  active: boolean;
  updated_at?: string | null;
}

export interface AppNotification {
  taskId: string;
  title: string;
  author: string;
  preview: string;
  at: string;
}

export type Tab = "board" | "dir" | "notices" | "attendance";
