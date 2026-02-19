# MySkylight

A household calendar and task management app inspired by Skylight Calendar. Manage daily, weekly, and monthly tasks with user assignments, track completions, and earn star rewards.

## Features

- **Calendar view** – Day, week, and month views with task completions
- **Task management** – Create daily/weekly/monthly tasks, assign to users or groups
- **Completion tracking** – Record who completed each task and when
- **Star rewards** – Earn stars for completing tasks
- **Insights & scoring** – View scores by user, task counts per person, and analytics
- **Filters** – Filter tasks by user, unassigned, type; filter completions by date range

## Quick start

```bash
# Install all dependencies
npm run install:all

# Start both client and server
npm run dev
```

- **Frontend**: https://localhost:5173
- **Backend**: https://localhost:3001

## Demo credentials

- Email: `demo@myskylight.app`
- Password: `demo123`

## Tech stack

- **Frontend**: React, Vite, Tailwind CSS, React Big Calendar, date-fns
- **Backend**: Node.js, Express
- **Database**: SQLite (sql.js – pure JS, no native build required)

## Project structure

```
MySkylight/
├── client/          # React frontend
│   └── src/
│       ├── components/
│       ├── context/
│       ├── hooks/
│       ├── pages/
│       └── api.js
├── server/          # Express backend
│   ├── server.js    # API routes
│   ├── database.js  # SQLite schema & seed
│   └── auth.js      # JWT auth
└── package.json
```

## API overview

| Endpoint | Description |
|----------|-------------|
| POST /api/auth/register | Create account |
| POST /api/auth/login | Sign in |
| GET /api/users | List users |
| GET /api/tasks | List tasks (filter: assigned_to, type) |
| POST /api/tasks | Create task |
| PATCH /api/tasks/:id | Update task |
| DELETE /api/tasks/:id | Delete task |
| GET /api/completions | List completions (filter: task_id, user_id, start_date, end_date) |
| POST /api/completions | Record task completion |
| GET /api/insights/scores | User scores (filter: start_date, end_date) |
| GET /api/insights/task-counts | Task completion counts per user |
| GET /api/insights/overview | Overview stats |
| GET /api/calendar/events | Calendar events |
