# Deploying MySkylight

This guide deploys MySkylight to an **Oracle Cloud Always Free** ARM VM, gives it a free **DuckDNS** hostname, and puts **Caddy** in front for automatic HTTPS.

The app stores all data in `server/myskylight.db`, so run exactly one instance against that file. Do not run multiple app processes or multiple containers sharing the same SQLite file.

## 1. Create the Oracle Cloud VM

1. Sign in to [Oracle Cloud](https://cloud.oracle.com/) and open **Compute → Instances → Create instance**.
2. Name it `myskylight`.
3. Image: **Canonical Ubuntu 24.04** (aarch64).
4. Shape: **Ampere → VM.Standard.A1.Flex**, **2 OCPUs**, **12 GB memory**.
5. Boot volume: **50 GB** (the minimum is around 47 GB; it counts toward the 200 GB Always Free block storage).
6. Networking: assign a **public IPv4 address**.
7. Add your SSH public key.
8. Create the instance and note its public IP.

Then open the VCN security list and add ingress rules:

| Port | Source | Purpose |
|---|---|---|
| 22/tcp | your public IP | SSH |
| 80/tcp | `0.0.0.0/0` | Let's Encrypt HTTP challenge and HTTP→HTTPS redirect |
| 443/tcp | `0.0.0.0/0` | HTTPS |

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

For a cloud VM the public IP normally stays the same. If it changes, update DuckDNS manually or schedule `deploy/duckdns-update.sh` with `DUCKDNS_DOMAIN` and `DUCKDNS_TOKEN` set.

## 3. Install packages

SSH into the VM (the default Ubuntu user on Oracle images is `ubuntu`):

```bash
ssh ubuntu@<vm-ip>

sudo apt update && sudo apt upgrade -y
sudo apt install -y caddy git curl sqlite3
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

node -v
caddy version
```

If `caddy` is not available in the Ubuntu repositories, use the official Caddy repository:

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy
```

## 4. Create the app user and check out the code

```bash
sudo useradd --system --create-home --home-dir /opt/myskylight --shell /usr/sbin/nologin myskylight
sudo -u myskylight -H git clone https://github.com/thakur-nishant/MySkylight.git /opt/myskylight/app

cd /opt/myskylight/app
sudo -u myskylight -H npm ci
sudo -u myskylight -H npm run build
```

`npm ci` installs the root, client, and server dependencies. The build produces `client/dist`, which the Express server serves directly.

## 5. Configure the environment

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

Replace `myskylight.duckdns.org` with your actual hostname. Registration stays disabled until you explicitly enable it for initial setup.

If you use the Google Calendar integration, also set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, and add this authorized redirect URI in Google Cloud:

```
https://myskylight.duckdns.org/api/integrations/google/callback
```

## 6. Install the systemd service

```bash
cd /opt/myskylight/app
sudo cp deploy/myskylight.service /etc/systemd/system/myskylight.service
sudo systemctl daemon-reload
sudo systemctl enable --now myskylight

sudo systemctl status myskylight --no-pager
curl -I http://127.0.0.1:3001/
curl -i http://127.0.0.1:3001/api/users
```

Expected: `/` returns `200` with the built client, and `/api/users` returns `401` because no token was sent.

If the service fails, check:

```bash
sudo journalctl -u myskylight --no-pager -n 100
```

## 7. Configure Caddy

```bash
cd /opt/myskylight/app
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
sudo sed -i 's/myskylight\.duckdns\.org/yourname.duckdns.org/g' /etc/caddy/Caddyfile

sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
sudo journalctl -u caddy --no-pager -n 50
```

Caddy will obtain a Let's Encrypt certificate automatically. Verify:

```bash
curl -I https://yourname.duckdns.org
```

If certificate issuance fails, confirm that DNS points at the VM, ports 80 and 443 are open in both the Oracle security list and the VM firewall, and that nothing else (such as Apache) is listening on port 80.

## 8. Enable the host firewall

```bash
sudo apt install -y ufw
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
sudo ufw status
```

The Oracle VCN security list is separate from the host firewall; both must allow the traffic.

## 9. Create your household

Temporarily enable registration, then restart the service:

```bash
sudo sed -i 's/^ALLOW_REGISTRATION=.*/ALLOW_REGISTRATION=true/' /etc/myskylight.env
sudo systemctl restart myskylight
```

Open `https://yourname.duckdns.org` and use **Create household**. The registering email becomes the head of household. Registration automatically closes after that first account is created. Explicitly disable registration again and restart the service:

```bash
sudo sed -i 's/^ALLOW_REGISTRATION=.*/ALLOW_REGISTRATION=false/' /etc/myskylight.env
sudo systemctl restart myskylight
```

Projects, tasks, completions, insights, calendar events, and challenges are scoped to their household. Registration remains closed once an account exists, even if `ALLOW_REGISTRATION=true` is later set; household members should be added through the Household page.

After that, the head of household can invite members from the **Household** page.
If you previously deployed a version with a shared invitation password, have existing invited members change their passwords from their profiles.

## 10. Migrate the existing database

If you are moving the current Termux deployment, copy its database before inviting anyone on the new server.

From the current host:

```bash
scp ~/MySkylight/server/myskylight.db nishant@<vm-ip>:/tmp/myskylight.db
```

Or download it to your local machine and upload it:

```bash
scp nishant@10.0.0.130:~/MySkylight/server/myskylight.db ./myskylight.db
scp ./myskylight.db ubuntu@<vm-ip>:/tmp/myskylight.db
```

On the VM:

```bash
sudo systemctl stop myskylight
sudo install -o myskylight -g myskylight -m 600 /tmp/myskylight.db /opt/myskylight/app/server/myskylight.db
sudo systemctl start myskylight
sudo -u myskylight test -r /opt/myskylight/app/server/myskylight.db && echo "db readable"
```

The app runs its schema migrations on startup. Log in with the existing accounts to confirm the household and members are intact.

If you are starting fresh instead, skip this step. The app creates an empty database on first start in production; use **Create household** on the login page.

## 11. Backups

```bash
cd /opt/myskylight/app
sudo install -m 755 deploy/backup-db.sh /usr/local/bin/myskylight-backup
sudo /usr/local/bin/myskylight-backup
```

Schedule it daily:

```bash
sudo crontab -e
```

Add:

```cron
15 3 * * * /usr/local/bin/myskylight-backup >> /var/log/myskylight-backup.log 2>&1
```

Backups are written to `/var/backups/myskylight/` and verified with `PRAGMA integrity_check`. Copy them off the VM periodically; a backup on the same disk is not enough.

## 12. Updating the app

```bash
cd /opt/myskylight/app
sudo -u myskylight -H git pull --ff-only
sudo -u myskylight -H npm ci
sudo -u myskylight -H npm run build
sudo systemctl restart myskylight
```

## 13. Production checklist

- [ ] `JWT_SECRET` is set to a random value.
- [ ] `ALLOW_REGISTRATION=false` after your household exists (registration also closes automatically after the first account).
- [ ] HTTPS works and HTTP redirects to HTTPS.
- [ ] Oracle security list allows only 22 (your IP), 80, and 443.
- [ ] SSH password login is disabled; use keys.
- [ ] `server/myskylight.db` is mode `600` and owned by `myskylight`.
- [ ] Nightly backups run and have been test-restored.
- [ ] Google OAuth redirect URI updated, if used.

### Known gaps before opening this to untrusted users

- Invited members receive a unique randomly generated temporary password; they can change it from their profile.
- Household-scoped records are isolated by the server; cross-household challenge participation is not supported.
- **No login rate limiting.** Consider `express-rate-limit` or a Cloudflare proxy in front of the app.
- **SQLite is single-process.** Do not scale horizontally or run a second copy against the same file.

## Troubleshooting

| Symptom | Check |
|---|---|
| Caddy cannot get a certificate | `dig +short <domain>`, ports 80/443 in Oracle security list and `ufw`, `journalctl -u caddy` |
| `502 Bad Gateway` | `systemctl status myskylight`, `journalctl -u myskylight` |
| App starts but page is blank | Did `npm run build` create `client/dist/index.html`? Check `ls client/dist` |
| `SQLITE_CANTOPEN` or DB permission error | `ls -l server/myskylight.db`; it must be writable by `myskylight` |
| Oracle “out of host capacity” | Retry, try another availability domain, or use a different home region |
| Login works but data looks empty | Confirm you copied the existing `myskylight.db`, then restart the service |

## Optional: Cloudflare Tunnel instead of public ports

If you later buy a domain and move its DNS to Cloudflare, you can run `cloudflared` on the VM and expose the app through a named tunnel. That removes the need to open 80/443 and hides the VM IP. DuckDNS alone cannot be used with a Cloudflare named tunnel because you do not control the `duckdns.org` zone.
