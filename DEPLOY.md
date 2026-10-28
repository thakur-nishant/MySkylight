# Deploying MySkylight

This is the production runbook for MySkylight on **Oracle Cloud Always Free** with an **Oracle Linux 9** ARM VM, a free **DuckDNS** hostname, and **Caddy** for automatic HTTPS.

The app stores all data in `server/myskylight.db`. Run exactly one app process against that file. Do not run multiple app processes, containers, or a second checkout against the same database.

## Current production instance

| Item | Value |
|---|---|
| URL | https://myskylight.duckdns.org |
| VM | Oracle Cloud Ampere A1, `VM.Standard.A1.Flex`, 2 OCPU / 12 GB |
| OS | Oracle Linux 9.8, aarch64 |
| Public IP | `161.153.9.88` (ephemeral) |
| SSH | `ssh -i ~/.ssh/myskylight_oracle opc@161.153.9.88` |
| App directory | `/opt/myskylight/app` |
| App user | `myskylight` (system user, no login shell) |
| Environment file | `/etc/myskylight.env` (root, mode `600`) |
| systemd unit | `myskylight.service` |
| Reverse proxy | Caddy on ports 80/443, proxying to `127.0.0.1:3001` |
| Database | `/opt/myskylight/app/server/myskylight.db` |
| Backups | `/var/backups/myskylight/`, daily at 03:15 UTC |

> **Important:** `/opt/myskylight` is mode `700`. The `opc` user cannot `cd` into it. Run git and npm commands as the app user:
>
> ```bash
> sudo -u myskylight -H bash -c 'cd /opt/myskylight/app && <command>'
> ```
>
> Commands in this guide run on the VM as `opc` unless stated otherwise.

## 1. Create the Oracle Cloud VM

1. Sign in to [Oracle Cloud](https://cloud.oracle.com/) and open **Compute → Instances → Create instance**.
2. Name it `myskylight`.
3. Image: **Oracle Linux 9** (aarch64). The default user on Oracle Linux images is `opc`.
4. Shape: **Ampere → VM.Standard.A1.Flex**, **2 OCPUs**, **12 GB memory**.
5. Boot volume: **30 GB** is enough for this app. You can use up to 200 GB total within the Always Free block-storage allowance.
6. Networking: assign a **public IPv4 address**. Choose **Ephemeral public IP** and **Use VCN, subnet or VNIC route table**. The ephemeral IP is what this deployment uses.
7. Add your SSH public key. Keep the matching private key safe; it is the only way to log in.
8. Create the instance and note its public IP.

Then open the VCN security list and add ingress rules. In the console: **Networking → Virtual Cloud Networks → your VCN → Security Lists → Default Security List → Add Ingress Rules**.

| Port | Source | Purpose |
|---|---|---|
| 22/tcp | your public IP | SSH |
| 80/tcp | `0.0.0.0/0` | Let's Encrypt HTTP challenge and HTTP→HTTPS redirect |
| 443/tcp | `0.0.0.0/0` | HTTPS |

The Oracle VCN security list is separate from the VM's own firewall. Both must allow the traffic. If you use a network security group (NSG) instead of the default security list, add the same rules there.

If Oracle returns **“out of host capacity”**, try another availability domain or retry later. Ampere capacity is not guaranteed. Your Always Free home region cannot be changed later.

> Oracle may reclaim an Always Free instance that looks idle over a 7-day window (95th-percentile CPU < 20%, network < 20%, memory < 20%). Upgrading the account to Pay As You Go generally avoids this and still costs $0 while you stay within the Always Free limits. Alternatively, run another small service on the same VM.

## 2. Create the free DuckDNS hostname

1. Sign in at [duckdns.org](https://www.duckdns.org/) with GitHub, Google, or Reddit.
2. Create a subdomain, for example `myskylight`, which gives `myskylight.duckdns.org`.
3. Set its IP to the VM's public IPv4 address.
4. Verify from your machine:

```bash
dig +short myskylight.duckdns.org
```

It should return the VM IP. DNS may take a minute to propagate.

The public IP is **ephemeral**. If you stop and recreate the instance and the IP changes, update the DuckDNS record. You can automate this with `deploy/duckdns-update.sh`:

```bash
DUCKDNS_DOMAIN=myskylight DUCKDNS_TOKEN=<token> ./deploy/duckdns-update.sh
```

## 3. Install packages

SSH into the VM as `opc`:

```bash
ssh -i ~/.ssh/myskylight_oracle opc@<vm-ip>
```

Install the base packages, Node.js 22, and Caddy:

```bash
sudo dnf update -y
sudo dnf install -y git curl sqlite dnf-plugins-core

curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -
sudo dnf install -y nodejs

sudo dnf copr enable -y @caddy/caddy
sudo dnf install -y caddy
```

Check the versions:

```bash
node -v
npm -v
git --version
caddy version
sqlite3 --version
```

Notes:

- The Oracle Linux package is named `sqlite`, but it provides the `sqlite3` binary.
- SELinux is enforcing by default. This layout works without extra policy changes. If you move the app or database to a different path, check the SELinux contexts with `ls -Z` before debugging permissions.
- If `dnf update` installs a new kernel, reboot before continuing: `sudo reboot`.

## 4. Open the host firewall

Oracle Linux uses `firewalld`, not `ufw`:

```bash
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
sudo firewall-cmd --list-all
```

The `public` zone should now list `http`, `https`, and `ssh` under services. SSH is normally allowed by the image already.

## 5. Create the app user and check out the code

```bash
sudo useradd --system --create-home --home-dir /opt/myskylight --shell /sbin/nologin myskylight
sudo -u myskylight -H git clone https://github.com/thakur-nishant/MySkylight.git /opt/myskylight/app

sudo -u myskylight -H bash -c 'cd /opt/myskylight/app && npm ci && npm run build'
```

`npm ci` installs the root, client, and server dependencies. The build produces `client/dist`, which the Express server serves directly.

Verify the build:

```bash
sudo ls -l /opt/myskylight/app/client/dist/index.html
```

The `useradd` command creates `/opt/myskylight` with mode `700`. This is why every git/npm command must run as `myskylight`; running `cd /opt/myskylight/app` directly as `opc` gives **Permission denied**.

## 6. Configure the environment

Create `/etc/myskylight.env`:

```bash
sudo tee /etc/myskylight.env >/dev/null <<EOF
NODE_ENV=production
PORT=3001
JWT_SECRET=$(openssl rand -hex 32)
SERVER_ORIGIN=https://myskylight.duckdns.org
CORS_ORIGIN=https://myskylight.duckdns.org
ALLOW_REGISTRATION=false
EOF

sudo chmod 600 /etc/myskylight.env
```

Replace `myskylight.duckdns.org` with your actual hostname. If the file already exists, edit it instead of re-running the block; re-running generates a new `JWT_SECRET`, which logs everyone out.

- `JWT_SECRET` must be a random value. Changing it invalidates existing login tokens.
- `ALLOW_REGISTRATION=false` is the normal production setting. Enable it temporarily only for the initial household creation; see step 9.
- Registration also closes automatically once any account exists, even if `ALLOW_REGISTRATION=true` is left set.
- If you are migrating an existing database that already has a household, keep registration disabled from the start.
- The file stays on the server. Never commit it to git.

If you use the Google Calendar integration, also set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, and add this authorized redirect URI in Google Cloud:

```
https://myskylight.duckdns.org/api/integrations/google/callback
```

The template is also available at `deploy/myskylight.env.example`.

## 7. Install the systemd service

```bash
sudo cp /opt/myskylight/app/deploy/myskylight.service /etc/systemd/system/myskylight.service
sudo systemctl daemon-reload
sudo systemctl enable --now myskylight

sudo systemctl status myskylight --no-pager
curl -s -o /dev/null -w 'root=%{http_code}\n' http://127.0.0.1:3001/
curl -s -o /dev/null -w 'api=%{http_code}\n' http://127.0.0.1:3001/api/users
```

Expected: `/` returns `200` with the built client, and `/api/users` returns `401` because no token was sent.

The unit runs as `myskylight` with `WorkingDirectory=/opt/myskylight/app/server`, loads `/etc/myskylight.env`, and uses `ProtectSystem=strict` with write access only to `/opt/myskylight/app/server`. If you move the database, update `ReadWritePaths` in the unit.

If the service fails, check:

```bash
sudo journalctl -u myskylight --no-pager -n 100
```

## 8. Configure Caddy

```bash
sudo cp /opt/myskylight/app/deploy/Caddyfile /etc/caddy/Caddyfile
sudo sed -i 's/myskylight\.duckdns\.org/yourname.duckdns.org/g' /etc/caddy/Caddyfile

sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl enable --now caddy
sudo systemctl reload caddy
```

Caddy obtains and renews a Let's Encrypt certificate automatically. Verify from your own machine:

```bash
curl -I https://yourname.duckdns.org
```

If certificate issuance fails, confirm that:

- DuckDNS points at the VM's current public IP.
- Ports 80 and 443 are open in the Oracle VCN security list.
- Ports 80 and 443 are open in `firewalld`.
- Nothing else is listening on port 80.

Let's Encrypt rate-limits repeated failed validations. After fixing DNS or firewall rules, wait a few minutes, then retry with `sudo systemctl restart caddy`. Check the log with:

```bash
sudo journalctl -u caddy --no-pager -n 50
```

## 9. Create your household

Registration is disabled by default. For the initial setup, enable it temporarily:

```bash
sudo sed -i 's/^ALLOW_REGISTRATION=.*/ALLOW_REGISTRATION=true/' /etc/myskylight.env
sudo systemctl restart myskylight
```

Open `https://yourname.duckdns.org` and use **Create household**. The registering email becomes the head of household. Registration closes automatically after that first account is created.

Disable registration again and restart:

```bash
sudo sed -i 's/^ALLOW_REGISTRATION=.*/ALLOW_REGISTRATION=false/' /etc/myskylight.env
sudo systemctl restart myskylight
```

Projects, tasks, completions, insights, calendar events, and challenges are scoped to their household. Registration stays closed once an account exists, even if `ALLOW_REGISTRATION=true` is later set. Add members from the **Household** page instead.

Each invite generates a unique random temporary password and shows it once. The invited member can change it from **Profile → Change password**. If you previously deployed the old shared invitation password, ask existing invited members to change their passwords too.

## 10. Migrate the existing database

If you are moving the current Termux deployment, copy its database before inviting anyone on the new server.

On the current host, stop the app first so the database is not being written. Copy the database to your Mac:

```bash
scp -P <old-ssh-port> <old-user>@<old-host>:~/MySkylight/server/myskylight.db ./myskylight.db
```

Then upload it to the VM:

```bash
scp -i ~/.ssh/myskylight_oracle ./myskylight.db opc@<vm-ip>:/tmp/myskylight.db
```

On the VM, check the copy and install it:

```bash
sqlite3 /tmp/myskylight.db 'PRAGMA integrity_check;'

sudo systemctl stop myskylight
sudo install -o myskylight -g myskylight -m 600 \
  /tmp/myskylight.db /opt/myskylight/app/server/myskylight.db
sudo systemctl start myskylight
```

Verify the data and permissions:

```bash
sudo -u myskylight sqlite3 /opt/myskylight/app/server/myskylight.db \
  "SELECT 'users', COUNT(*) FROM users
   UNION ALL SELECT 'households', COUNT(*) FROM households
   UNION ALL SELECT 'tasks', COUNT(*) FROM tasks
   UNION ALL SELECT 'projects', COUNT(*) FROM projects;"

sudo ls -l /opt/myskylight/app/server/myskylight.db
```

The file must be owned by `myskylight` and mode `600`. The app runs its schema migrations on startup. Log in with the existing accounts to confirm the household and members are intact, then remove the temporary copy:

```bash
rm /tmp/myskylight.db
```

If the migrated database already has a household, keep `ALLOW_REGISTRATION=false` in `/etc/myskylight.env` and restart the service.

If you are starting fresh instead, skip this step. The app creates an empty database on first start in production; use **Create household** on the login page.

## 11. Backups

Install the backup script and run it once:

```bash
sudo install -m 755 /opt/myskylight/app/deploy/backup-db.sh /usr/local/bin/myskylight-backup
sudo /usr/local/bin/myskylight-backup
sudo ls -lt /var/backups/myskylight | head
```

Verify the snapshot:

```bash
sudo sh -c 'sqlite3 /var/backups/myskylight/<backup-file>.db "PRAGMA integrity_check;"'
```

Schedule it daily with a file in `/etc/cron.d`:

```bash
echo '15 3 * * * root /usr/local/bin/myskylight-backup >> /var/log/myskylight-backup.log 2>&1' \
  | sudo tee /etc/cron.d/myskylight-backup >/dev/null
sudo chmod 644 /etc/cron.d/myskylight-backup
cat /etc/cron.d/myskylight-backup
```

The script writes to `/var/backups/myskylight/`, verifies each copy with `PRAGMA integrity_check`, and keeps 14 days by default (`KEEP_DAYS` overrides this). The VM clock is UTC; confirm with `timedatectl`.

Copy backups off the VM periodically. A backup on the same disk is not enough if the instance or volume is lost.

## 12. Updating the app

This is the manual runbook for this server. Run it after every merge to `main`.

### 12.1 SSH in

```bash
ssh -i ~/.ssh/myskylight_oracle opc@<vm-ip>
```

### 12.2 Back up the database first

```bash
sudo /usr/local/bin/myskylight-backup
```

The script prints the path of the verified snapshot. If it fails, stop and fix that before deploying.

### 12.3 Pull, install, and build

```bash
sudo -u myskylight -H bash -c 'cd /opt/myskylight/app && git pull --ff-only && npm ci && npm run build'
```

- `git pull --ff-only` updates the code and refuses to create a merge commit on the server.
- `npm ci` installs the root, client, and server dependencies.
- `npm run build` rebuilds `client/dist`.

### 12.4 Restart the app

```bash
sudo systemctl restart myskylight
```

Caddy does **not** need to be restarted for app updates.

### 12.5 Verify

On the VM:

```bash
sudo systemctl status myskylight --no-pager
sudo journalctl -u myskylight -n 30 --no-pager

curl -s -o /dev/null -w 'root=%{http_code}\n' http://127.0.0.1:3001/
curl -s -o /dev/null -w 'api=%{http_code}\n' http://127.0.0.1:3001/api/users
```

Expected: `root=200`, `api=401`.

From your Mac:

```bash
curl -s -o /dev/null -w 'public=%{http_code}\n' https://myskylight.duckdns.org/
```

Expected: `public=200`.

### 12.6 One-liner from your Mac

```bash
ssh -i ~/.ssh/myskylight_oracle opc@<vm-ip> \
  'sudo /usr/local/bin/myskylight-backup && sudo -u myskylight -H bash -c "cd /opt/myskylight/app && git pull --ff-only && npm ci && npm run build" && sudo systemctl restart myskylight'
```

### 12.7 Notes

- Never run `git pull`, `npm ci`, or `npm run build` as `opc` inside `/opt/myskylight/app`; the parent directory is mode `700`.
- `server/myskylight.db` is gitignored, so pulling or resetting code does not touch the database.
- If `git pull` fails because of local changes on the server, inspect them first:
  ```bash
  sudo -u myskylight -H bash -c 'cd /opt/myskylight/app && git status'
  ```
  Do not `git reset --hard` until you know what would be discarded.
- If `npm ci` or the build fails, the running process keeps serving the old code until you restart. Fix the error, rerun the command, then restart. If the service happens to restart mid-build, it may fail with incomplete `node_modules`; rerun `npm ci` and start it again.
- If a release adds or changes environment variables, edit `/etc/myskylight.env` and restart the service. `daemon-reload` is only needed when the systemd unit itself changes.
- Do not start a second copy of the app against the same SQLite file.

## 13. Rollback

### Roll back the code

Find the previous commit:

```bash
sudo -u myskylight -H bash -c 'cd /opt/myskylight/app && git log --oneline -5'
```

Reset to it, rebuild, and restart:

```bash
sudo -u myskylight -H bash -c \
  'cd /opt/myskylight/app && git reset --hard <previous-commit> && npm ci && npm run build'
sudo systemctl restart myskylight
```

If the release included a database migration, older code may not understand the migrated schema. In that case, also restore the matching pre-deploy database backup.

### Restore the database

Only restore the database if the new version corrupted it or you need to undo data changes. Restoring loses every write made after the snapshot.

```bash
sudo systemctl stop myskylight
sudo ls -lt /var/backups/myskylight | head

sudo install -o myskylight -g myskylight -m 600 \
  /var/backups/myskylight/myskylight-YYYYMMDD-HHMMSS.db \
  /opt/myskylight/app/server/myskylight.db

sudo systemctl start myskylight
```

If the current database is still readable and you may need its data later, take a snapshot before overwriting it:

```bash
sudo /usr/local/bin/myskylight-backup
```

## 14. Production checklist

- [ ] `JWT_SECRET` is set to a random value.
- [ ] `ALLOW_REGISTRATION=false` after your household exists. Registration also closes automatically after the first account.
- [ ] HTTPS works and HTTP redirects to HTTPS.
- [ ] Oracle security list allows only 22 (your IP), 80, and 443.
- [ ] `firewalld` allows `http` and `https`.
- [ ] SSH password login is disabled; use keys.
- [ ] `server/myskylight.db` is mode `600` and owned by `myskylight`.
- [ ] Nightly backups run and have been test-restored.
- [ ] At least one backup has been copied off the VM.
- [ ] Google OAuth redirect URI updated, if used.
- [ ] Only one app process is using the SQLite file.

### Known gaps before opening this to untrusted users

- **No self-service password reset.** Invited members receive a unique random temporary password and can change it from **Profile → Change password**, but there is no “forgot password” email flow. If someone forgets it, an operator must stop the service and reset the password hash directly in the database; the invite endpoint rejects an email that is already registered.
- **Cross-household challenge participation is not supported.** Household-scoped records are isolated by the server, but challenges are still designed for members of one household.
- **No login rate limiting.** Consider `express-rate-limit` or a Cloudflare proxy in front of the app.
- **SQLite is single-process.** Do not scale horizontally or run a second copy against the same file.
- **Backups are local.** Add an off-box copy (object storage, another machine, or a scheduled download) for disaster recovery.

## Troubleshooting

| Symptom | Check |
|---|---|
| `Permission denied` when entering `/opt/myskylight/app` | Run the command as the app user: `sudo -u myskylight -H bash -c 'cd /opt/myskylight/app && ...'` |
| Caddy cannot get a certificate | `dig +short <domain>`, ports 80/443 in the Oracle security list and `sudo firewall-cmd --list-all`, `sudo journalctl -u caddy` |
| Caddy keeps retrying after a fix | Let's Encrypt rate limit; wait a few minutes, then `sudo systemctl restart caddy` |
| `502 Bad Gateway` | `systemctl status myskylight`, `journalctl -u myskylight` |
| App starts but page is blank | Did `npm run build` create `client/dist/index.html`? Check `ls /opt/myskylight/app/client/dist` |
| `SQLITE_CANTOPEN` or DB permission error | `sudo ls -l /opt/myskylight/app/server/myskylight.db`; it must be owned by `myskylight` and writable |
| `npm ci` fails | Check `node -v` is 22.x, free disk with `df -h /`, and the full error output |
| `git pull` fails on the server | `sudo -u myskylight -H bash -c 'cd /opt/myskylight/app && git status'`; resolve local changes before pulling |
| Oracle “out of host capacity” | Retry, try another availability domain, or use a different home region |
| Login works but data looks empty | Confirm you copied the existing `myskylight.db`, then restart the service |
| Public IP changed after a stop/recreate | Update the DuckDNS record to the new IP |

## Optional: Cloudflare Tunnel instead of public ports

If you later buy a domain and move its DNS to Cloudflare, you can run `cloudflared` on the VM and expose the app through a named tunnel. That removes the need to open 80/443 and hides the VM IP. DuckDNS alone cannot be used with a Cloudflare named tunnel because you do not control the `duckdns.org` zone.
