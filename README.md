# Kuroshio Task Board

A simple team task board for Kuroshio AI. Admins assign tasks; team members
sign in and move their own tasks through **To Do → In Progress → Done**.

- **Frontend:** single static `index.html` (no build step)
- **Backend:** Supabase (Postgres + Auth), project `kuroshio-tasks`
- **Hosting:** Vercel (static)

## How it works

- Sign up with name, email and password. **The first person to sign up becomes the admin.**
- Admins see an add-task bar and a **Team & roles** panel, and can promote
  others to admin.
- Members see the board and can change the status of tasks assigned to them.
- Security (Row Level Security) is enforced in the database, not the browser:
  - everyone signed in can read all tasks,
  - only admins can create, reassign or delete tasks,
  - members can only change the **status** of their **own** tasks.

## Configuration

The Supabase URL and public key are set at the top of the `<script>` block in
`index.html`. The public (publishable) key is safe to ship in the browser — the
database is protected by Row Level Security.

## Local preview

Open `index.html` in a browser, or run any static server:

```bash
npx serve .
```

## Deploy (Vercel)

1. Import this repository at https://vercel.com/new
2. Framework preset: **Other** (it is a static site, no build command).
3. Deploy. Every push to the default branch redeploys automatically.

## Auth note

By default Supabase requires email confirmation on sign-up. To let your team in
without the confirmation step, turn it off in the Supabase dashboard:
**Authentication → Providers → Email → “Confirm email” = Off**.
