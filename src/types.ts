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
export type Recurrence = "none" | "daily" | "weekly" | "monthly";

export interface Task {
  id: string;
  title: string | null;
  description: string | null;
  status: TaskStatus | null;
  priority: Priority | null;
  due_date: string | null;
  start_date: string | null;
  estimate_hours: number | null;
  assignee_ids: string[] | null;
  tags: string[] | null;
  category: string | null;
  project: string | null;
  requires_approval: boolean;
  reviewer_id: string | null;
  deliverables: string | null;
  acceptance_criteria: string | null;
  recurrence: Recurrence;
  recurred_from: string | null;
  blocked_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type SubtaskStatus = "todo" | "in_progress" | "done";

export interface Subtask {
  id: string;
  task_id: string;
  title: string;
  assignee_id: string | null;
  due_date: string | null;
  status: SubtaskStatus;
  position: number;
  created_at: string;
}

export interface TaskDependency {
  task_id: string;
  depends_on_id: string;
}

export interface TaskTemplate {
  id: string;
  name: string;
  title: string;
  description: string;
  priority: Priority;
  estimate_hours: number | null;
  tags: string[];
  category: string | null;
  project: string | null;
  requires_approval: boolean;
  deliverables: string | null;
  acceptance_criteria: string | null;
  recurrence: Recurrence;
  subtasks: string[];
  created_at: string;
}

export interface SubmissionFile {
  url: string;
  name: string;
  type: string;
  size: number;
}

export type SubmissionStatus = "submitted" | "approved" | "revision_requested";

export interface Submission {
  id: string;
  task_id: string;
  submitted_by: string | null;
  note: string;
  files: SubmissionFile[];
  status: SubmissionStatus;
  reviewer_id: string | null;
  review_comment: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface Activity {
  id: string;
  task_id: string;
  actor_id: string | null;
  kind: string;
  detail: Record<string, unknown>;
  created_at: string;
}

export interface TimeLog {
  id: string;
  task_id: string;
  user_id: string;
  minutes: number;
  log_date: string;
  note: string;
  created_at: string;
}

export interface DbNotification {
  id: string;
  user_id: string;
  kind: string;
  task_id: string | null;
  actor_id: string | null;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
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
  mentions?: string[] | null;
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

export type Tab = "dashboard" | "board" | "dir" | "notices" | "attendance" | "leave";
