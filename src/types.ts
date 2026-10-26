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

export type TaskStatus = "todo" | "in_progress" | "done";
export type Priority = "low" | "med" | "high";

export interface Task {
  id: string;
  title: string | null;
  status: TaskStatus | null;
  priority: Priority | null;
  due_date: string | null;
  assignee_ids: string[] | null;
}

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
}

export type LeaveType = "casual" | "sick" | "earned" | "unpaid";
export type LeaveStatus = "pending" | "approved" | "rejected";

export interface LeaveRequest {
  id: string;
  user_id: string;
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  days: number;
  reason: string | null;
  status: LeaveStatus;
  created_at: string;
  profiles?: AuthorRef | null;
}

export interface AppNotification {
  taskId: string;
  title: string;
  author: string;
  preview: string;
  at: string;
}

export type Tab = "board" | "dir" | "notices" | "attendance" | "leave";
