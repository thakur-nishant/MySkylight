# MySkylight

A household calendar and task management app inspired by Skylight Calendar. Manage shared family tasks and your own personal task + habit tracker from a single dashboard.

## What's new

- HTTPS-only local development for both client and server (`https://localhost:5173` + `https://localhost:3001`)
- Automatic dependency bootstrapping on `npm install` via a root `postinstall` script
- Personal Tracker overview now combines **task + habit** completion in daily and weekly progress metrics
- Habit toggle persistence improved to avoid duplicate log rows and preserve checkbox state across refreshes

## Features

- **Calendar view** – Day, week, and month views with task visibility
- **Task management** – Create daily/weekly/monthly/one-time tasks and assign users
- **Completion tracking** – Record completions, batch-complete, and mark items undone
- **Personal Tracker** – Manage weekly personal tasks + habits with daily cards, charting, and completion rings
- **Star rewards** – Earn stars for completing tasks
- **Insights & scoring** – Review user scores, top tasks, and completion activity over time
- **Filters** – Filter tasks by assignee/type and completions by date/user/task

## Quick start

```bash
# Install root + client + server dependencies
npm install

# Start client and server concurrently
npm run dev
```

- **Frontend**: https://localhost:5173
- **Backend**: https://localhost:3001

> On first run, your browser may show a warning because the app uses a locally generated self-signed certificate. Continue to `localhost` to proceed.

## Demo credentials

- Email: `demo@myskylight.app`
- Password: `demo123`

## Tech stack

- **Frontend**: React, Vite, Tailwind CSS, React Big Calendar, date-fns
- **Backend**: Node.js, Express, CORS, JWT auth
- **Database**: SQLite (`sql.js`, pure JS)

## Project structure

```text
MySkylight/
├── client/            # React frontend (Vite)
│   └── src/
│       ├── components/
│       ├── context/
│       ├── hooks/
│       ├── pages/
│       └── api.js
├── server/            # Express HTTPS API server
│   ├── server.js      # API routes + HTTPS bootstrap
│   ├── database.js    # SQLite schema + seed
│   └── auth.js        # JWT auth helpers
└── package.json       # Root scripts (dev/install/build)
```

## Available scripts

```bash
npm run dev         # start client + server
npm run client      # start frontend only
npm run server      # start backend only
npm run build       # build frontend
npm run start       # run backend in non-watch mode
```

## API overview

All endpoints below are under `https://localhost:3001`. Most routes require `Authorization: Bearer <token>`.

### Auth

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Register a user |
| POST | `/api/auth/login` | Log in and receive JWT |
| GET | `/api/auth/me` | Get current authenticated user |

### Users

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/users` | List users for assignments |

### Shared tasks & completions

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/tasks` | List shared tasks (filters: `assigned_to`, `type`) |
| POST | `/api/tasks` | Create task |
| PATCH | `/api/tasks/:id` | Update task |
| DELETE | `/api/tasks/:id` | Delete task |
| GET | `/api/completions` | List completions (filters: `task_id`, `user_id`, `start_date`, `end_date`) |
| POST | `/api/completions` | Create completion(s) |
| PATCH | `/api/completions` | Batch update completion metadata |
| DELETE | `/api/completions/:id` | Delete completion |

### Personal tracker (tasks + habits)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/tracker/weekly` | Weekly tracker payload + computed overview (`week_start`) |
| POST | `/api/tracker/tasks` | Create personal tracker task |
| PATCH | `/api/tracker/tasks/:id` | Edit personal task |
| DELETE | `/api/tracker/tasks/:id` | Delete personal task |
| PATCH | `/api/tracker/tasks/:id/toggle` | Toggle personal task completion for a date |
| POST | `/api/tracker/habits` | Create habit |
| PATCH | `/api/tracker/habits/:id` | Edit habit |
| DELETE | `/api/tracker/habits/:id` | Delete habit |
| PATCH | `/api/tracker/habits/:id/toggle` | Toggle habit completion for a date |

### Insights & calendar

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/insights/scores` | User scores (optional date range) |
| GET | `/api/insights/task-counts` | Completion counts per task/user |
| GET | `/api/insights/overview` | Aggregate totals + top tasks |
| GET | `/api/calendar/events` | Calendar-formatted task events |
