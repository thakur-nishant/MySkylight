# MySkylight

A household calendar and task management app inspired by Skylight Calendar. Manage shared family tasks and your own personal task + habit tracker from a single dashboard.

## What's new

- Local development runs over HTTP by default (`http://localhost:5173` and `http://localhost:3001`)
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

- **Frontend**: http://localhost:5173
- **Backend**: http://localhost:3001


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

This project is split into:

- a static frontend build (`client/dist`)
- a Node.js API server (`server/server.js`)

Use the flow below for a production environment.

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
    ProxyPass /api https://127.0.0.1:3001/api
    ProxyPassReverse /api https://127.0.0.1:3001/api

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
