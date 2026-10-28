# MySkylight

A household calendar and task management app inspired by Skylight Calendar. Manage shared family tasks and your own personal task + habit tracker from a single dashboard.

## What's new

- Local development runs over HTTP by default (`http://localhost:5173` and `http://localhost:3001`)
- Automatic dependency bootstrapping on `npm install` via a root `postinstall` script
- Personal Tracker overview now combines **task + habit** completion in daily and weekly progress metrics
- Habit toggle persistence improved to avoid duplicate log rows and preserve checkbox state across refreshes
- Frontend now uses protected routes with JWT session restore (`/api/auth/me`) on refresh
- Insights view includes scoreboards, completion counts, and date-range summaries
- Calendar feed endpoint is available for rendering task events in day/week/month views
- Users now belong to a household; registration creates a household and makes the registering user its head
- Heads of household can invite members from the Household page (accounts are created with a temporary password)

## Features

- **Calendar view** – Day, week, and month views with task visibility
- **Task management** – Create daily/weekly/monthly/one-time tasks and assign users
- **Completion tracking** – Record completions, batch-complete, and mark items undone
- **Personal Tracker** – Manage weekly personal tasks + habits with daily cards, charting, and completion rings
- **Star rewards** – Earn stars for completing tasks
- **Insights & scoring** – Review user scores, top tasks, and completion activity over time
- **Filters** – Filter tasks by assignee/type and completions by date/user/task
- **Households** – Register a household, then invite members from the Household page

## Authentication flow

- `POST /api/auth/register` requires a `household_name`; it creates the household and makes the registering user its head
- `POST /api/auth/login` issues a JWT token
- Client stores the token in `localStorage`
- On app load, `AuthContext` calls `GET /api/auth/me` to restore the session
- Unauthenticated users are redirected to `/login`
- The head of household can invite members via `POST /api/household/invite`; each invited account receives a unique, randomly generated temporary password

### Existing databases

On startup, `server/database.js` automatically backfills a `MySkylight Household` for users that predate households and makes the oldest user its head. To do it manually instead, run:

```sql
CREATE TABLE IF NOT EXISTS households (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  head_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE users ADD COLUMN household_id INTEGER REFERENCES households(id) ON DELETE CASCADE;
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'member';

INSERT INTO households (name) VALUES ('MySkylight Household');
UPDATE users
SET household_id = (SELECT id FROM households ORDER BY id LIMIT 1)
WHERE household_id IS NULL;
UPDATE households
SET head_user_id = (SELECT id FROM users WHERE household_id = households.id ORDER BY id LIMIT 1)
WHERE head_user_id IS NULL;
UPDATE users
SET role = 'head'
WHERE id IN (SELECT head_user_id FROM households WHERE head_user_id IS NOT NULL);
```

## Quick start

```bash
# Install root + client + server dependencies
npm install

# Start client and server concurrently
npm run dev
```

- **Frontend**: http://localhost:5173
- **Backend**: http://localhost:3001

### Environment variables

Backend (`server/server.js`, `server/auth.js`):

- `PORT` (optional): API port (default `3001`)
- `JWT_SECRET`: token signing secret. Required when `NODE_ENV=production`; local development falls back to a known value.
- `SERVER_ORIGIN`: public HTTPS origin, e.g. `https://myskylight.duckdns.org`. Used for Google Calendar OAuth callbacks.
- `CORS_ORIGIN` (optional): comma-separated allowed origins (default `http://localhost:5173`). Same-origin deployments do not need to change this.
- `ALLOW_REGISTRATION` (optional): set to `true` to allow the initial household registration. Registration is disabled by default in production and closes automatically after the first account is created. In development it is enabled by default until the first account is created.
- `SEED_DEMO` (optional): demo data is seeded only when the database is empty and `NODE_ENV` is not `production`. Set to `false` to disable demo seeding; production never seeds demo accounts.
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (optional): enable Google Calendar integration.

Frontend: the client always calls the relative `/api` base. Vite proxies `/api` to the backend during development, and in production the same origin serves both the app and the API.


## Demo credentials

Demo data is seeded only when the database is empty and `NODE_ENV` is not `production`:

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
├── server/            # Express API server
│   ├── server.js      # API routes + HTTP bootstrap
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

## Production deployment

For a complete walkthrough using **Oracle Cloud Always Free + DuckDNS + Caddy**, see [`DEPLOY.md`](DEPLOY.md).

This project is split into:

- a static frontend build (`client/dist`)
- a Node.js API server (`server/server.js`)

When `client/dist` exists, the Express server serves it directly, including the SPA fallback. A reverse proxy such as Caddy only needs to forward all traffic to port `3001`.

The Apache example below is an alternative if you prefer to serve the static build separately.

### 1) Build and prepare artifacts

```bash
# install all dependencies (root + client + server)
npm install

# build frontend assets
npm run build
```

This produces static files in `client/dist`.

### 2) Run backend API in production mode

```bash
# starts Express API in non-watch mode
npm run start
```

- Default API port is `3001`.
- Set a custom port via environment variable:

```bash
PORT=8080 npm run start
```

### 3) Serve frontend over Apache2 (step by step)

Because the frontend uses a relative API base path (`/api`), Apache should:

- serve static files from `client/dist`
- return `index.html` for client-side routes
- reverse-proxy `/api/*` to the Node backend

#### Step 3.1: Build and copy frontend assets

```bash
npm run build
sudo mkdir -p /var/www/myskylight
sudo cp -r client/dist/* /var/www/myskylight/
```

#### Step 3.2: Enable required Apache modules

```bash
sudo a2enmod ssl rewrite proxy proxy_http headers
sudo systemctl restart apache2
```

#### Step 3.3: Create an Apache virtual host

Create `/etc/apache2/sites-available/myskylight.conf`:

```apache
<VirtualHost *:443>
    ServerName your-domain.example

    DocumentRoot /var/www/myskylight

    SSLEngine on
    SSLCertificateFile /path/to/fullchain.pem
    SSLCertificateKeyFile /path/to/privkey.pem

    <Directory /var/www/myskylight>
        Options Indexes FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>

    RewriteEngine On

    # Proxy API requests to backend
    ProxyPreserveHost On
    ProxyPass /api http://127.0.0.1:3001/api
    ProxyPassReverse /api http://127.0.0.1:3001/api

    # SPA fallback for frontend routes
    RewriteCond %{REQUEST_URI} !^/api
    RewriteCond %{DOCUMENT_ROOT}%{REQUEST_URI} !-f
    RewriteRule ^ /index.html [L]

    RequestHeader set X-Forwarded-Proto "https"
</VirtualHost>
```

#### Step 3.4: Enable the site and reload Apache

```bash
sudo a2ensite myskylight.conf
sudo apache2ctl configtest
sudo systemctl reload apache2
```

#### Step 3.5: Keep backend running in production

Use a process manager like `pm2` or a `systemd` service so `npm run start` stays up after reboot.

Example with PM2:

```bash
npm install -g pm2
cd /path/to/MySkylight
pm2 start npm --name myskylight-api -- run start
pm2 save
pm2 startup
```

> Note: in production, it's common to terminate TLS at Apache/Nginx and proxy to the backend over local HTTP (`127.0.0.1:3001`).

## API overview

All endpoints below are under `http://localhost:3001`. Most routes require `Authorization: Bearer <token>`.

### Common query parameters

- Tasks: `assigned_to`, `type`
- Completions: `task_id`, `user_id`, `start_date`, `end_date`
- Tracker weekly payload: `week_start`
- Insights: `start_date`, `end_date`

### Auth

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Create a household and its head user (`household_name` required) |
| POST | `/api/auth/login` | Log in and receive JWT |
| GET | `/api/auth/me` | Get current authenticated user |

### Users & household

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/users` | List users in the current household for assignments |
| GET | `/api/household` | Get the current household and its members |
| POST | `/api/household/invite` | Head of household creates a member account (temporary password) |

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
