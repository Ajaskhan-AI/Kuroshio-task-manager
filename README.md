# Kuroshio Portal

Internal team workspace for Kuroshio AI: a task board with per-task chat, a team
directory, notices, attendance and leave. Admins assign tasks; team members sign in
and move their own tasks through **To Do → In Progress → Review → Done**.

- **Frontend:** React 18 + TypeScript + Vite
- **Backend:** Supabase (Postgres + Auth + Storage + Realtime), project `kuroshio-tasks`
- **Hosting:** Vercel

## Getting started

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build locally
```

## Project structure

```
index.html                 Vite entry (theme pre-paint script, fonts)
public/logo.png            Static assets served at /
src/
  main.tsx                 React root
  App.tsx                  Session, profile loading, idle auto-logout, routing between views
  workspace.ts             Shared context (user, profile, people, tasks, realtime revisions)
  types.ts                 Database row types
  index.css                All styles (light/dark theme tokens)
  lib/
    supabase.ts            Supabase client
    utils.ts               Date/format helpers, avatar colours
    tasks.ts               Task statuses, sorting, due-date states, quick-add parser
    useTaskActions.ts      Optimistic task updates shared by board and drawer
    useTheme.ts            Light/dark toggle
    useClickOutside.ts     Popover close helper
  components/
    AuthView.tsx           Sign in / sign up
    PendingView.tsx        "Awaiting approval" / blocked screen
    Workspace.tsx          Logged-in shell: data loading, realtime, notifications
    Header.tsx             Top bar, tabs, notification bell
    Board.tsx              Task board: filters, stats, quick add, board + list views, drag and drop
    TaskDrawer.tsx         Task side panel: status, details, checklist, chat and activity tabs
    TaskChat.tsx           Per-task discussion with files and emoji
    Directory.tsx          Team directory, approvals, profile detail
    EditProfileModal.tsx   Profile editor + photo upload
    Notices.tsx            Announcements
    Attendance.tsx         Check in / out, history, team today
    Leave.tsx              Balances, apply, admin approvals
```

## Task board

- **Cards** show the project, assignee avatars, checklist progress, a due chip (amber today/tomorrow,
  red when overdue), blocked or stuck flags, and a red dot when there are new chat messages.
- **Drag and drop** cards between To Do, In Progress, Review and Done (or use the status bar in the panel).
- **Click a card** to open the side panel: edit details, tick off the checklist, chat, and see the
  activity log (written automatically by the database).
- **Filters:** My tasks / Everyone, person, project, search (`/`), and the stats strip
  (Overdue, In review, Blocked, Stuck 5d+) doubles as one-click filters. Choices are remembered.
- **Board or List** view. Done tasks older than 7 days are tucked away behind "Show older".
- **Quick add (admins, `n`):** `Fix meter parser @parthiv !high fri #CBAM` → assignee, priority,
  project and due date. Dates are read from the end of the title (`today`, `tomorrow`, `fri`,
  `12 nov`, `in 3 days`).
- On phones the columns become tabs and the panel opens full screen.

## How it works

- Sign up with name, email and password. **The first person to sign up becomes the admin.**
- New sign-ups wait on an approval screen until an admin approves them.
- Admins see the add-task bar, pending approvals, and can promote, block or delete people.
- Members see the board and can change the status of tasks assigned to them.
- Security (Row Level Security) is enforced in the database, not the browser:
  - everyone signed in can read all tasks,
  - only admins can create, reassign or delete tasks,
  - members can only change the **status** of their **own** tasks.
- Users are signed out automatically after 30 minutes of inactivity.

## Configuration

The Supabase URL and publishable key default to the values in `src/lib/supabase.ts`.
To override them, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_KEY` (see `.env.example`)
in `.env.local` or in Vercel's environment variables. The publishable key is safe to
ship in the browser — the database is protected by Row Level Security.

## Deploy (Vercel)

Vercel detects Vite automatically:

- Framework preset: **Vite**
- Build command: `npm run build`
- Output directory: `dist`

If the project was previously set up with the **Other** (static) preset, change it to
**Vite** under Project → Settings → Build & Deployment. Every push to the default
branch redeploys automatically.

## Auth note

By default Supabase requires email confirmation on sign-up. To let your team in
without the confirmation step, turn it off in the Supabase dashboard:
**Authentication → Providers → Email → “Confirm email” = Off**.
