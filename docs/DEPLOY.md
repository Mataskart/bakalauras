# Deploy (VPS + GitHub Actions)

## What the deploy workflow does on push to `main`

1. **Checkout** the repo on the runner.
2. **Build** the web app: `cd web && npm ci && npm run build` (produces `web/dist/`).
3. **SSH to VPS:**
   - `git pull origin main`
   - `mkdir -p web/dist`
   - Backend: `composer install --no-dev`, run migrations, clear/warm cache.
4. **SCP** the contents of `web/dist` to the VPS at `/var/www/bakalauras/web/dist`.

So after each push: backend is updated and migrated, and the built web app is uploaded. **Node/npm are not required on the VPS**; the web app is built in GitHub Actions.

---

## What must be installed on the VPS (once)

| Component | Purpose |
|-----------|--------|
| **PHP 8.3** + **Composer** | Backend (Symfony). |
| **PostgreSQL 16** | Database. |
| **Nginx** | HTTPS, serve API and (optionally) web app. |
| **PHP-FPM** | Run PHP (e.g. for `/api`). |
| **Redis** | Leaderboard cache. |
| **Git** | `git pull` in the deploy script. |
| **osmium-tool** | One-time OSM speed limit import (see below). |

You do **not** need Node/npm on the VPS for the web app; it is built in CI and only the built files are uploaded.

---

## VPS config to keep in mind

- **Backend:** `/var/www/bakalauras/backend` (Symfony). `.env.local` with `APP_ENV=prod`, `DATABASE_URL`, `JWT_PASSPHRASE`, `REDIS_URL=redis://127.0.0.1:6379`.
- **Web app (static):** `/var/www/bakalauras/web/dist` after deploy. Nginx should serve this for the site root (or the path you use for the web app) with `try_files $uri $uri/ /index.html` for the SPA.
- **Redis:** Running and reachable at `127.0.0.1:6379` (or whatever you set in `REDIS_URL`).

---

## GitHub secrets

- `VPS_HOST` — server IP or hostname  
- `VPS_USER` — SSH user (e.g. `deploy`)  
- `VPS_SSH_KEY` — private SSH key for that user  
- (Backend uses `VPS_DB_PASSWORD`, `VPS_JWT_PASSPHRASE` etc. in env or deploy script if you use them.)

No extra secrets are required for the web deploy; SCP uses the same SSH key as the SSH step.

---

---

## One-time OSM speed limit import (run once on the VPS)

This populates the `speed_limit_cache` table with every tagged road speed limit in Lithuania so
the app never needs to call the public Overpass API during normal operation.

See `docs/osm-setup.sh` for the full script. Manual steps:

```bash
# 1. Install osmium-tool
sudo apt-get install -y osmium-tool

# 2. Create a directory for OSM data (outside the web root)
mkdir -p /var/www/bakalauras/osm
cd /var/www/bakalauras/osm

# 3. Download the Lithuania OSM extract (~35 MB)
wget https://download.geofabrik.de/europe/lithuania-latest.osm.pbf

# 4. Filter to ways that have a maxspeed tag
osmium tags-filter lithuania-latest.osm.pbf w/maxspeed \
  -o lithuania-maxspeed.osm.pbf

# 5. Export geometry + tags as streamable GeoJSONSeq (one feature per line)
osmium export lithuania-maxspeed.osm.pbf \
  --geometry-types=linestring \
  -f geojsonseq \
  -o lithuania-maxspeed.geojsonseq

# 6. Run the Symfony import command (takes ~1–2 min)
cd /var/www/bakalauras/backend
php bin/console app:osm:import-speed-limits \
  --file=/var/www/bakalauras/osm/lithuania-maxspeed.geojsonseq
```

**Re-running:** safe to re-run at any time (uses `ON CONFLICT DO NOTHING`). Re-download the PBF
and repeat steps 4–6 to pick up OSM map updates (e.g. every few months).

**Disk usage:** the PBF + GeoJSONSeq are ~60–80 MB total. The files in `/var/www/bakalauras/osm/`
can be deleted after import if disk space is tight.

---

## Troubleshooting: `dial tcp :22: i/o timeout`

The runner cannot reach the VPS on port 22. Fix this on the **VPS** side:

1. **Firewall** — Allow inbound SSH. For example (Ubuntu/Debian with `ufw`):
   ```bash
   sudo ufw allow 22/tcp
   sudo ufw reload
   sudo ufw status
   ```
   If you previously added SSH with `ufw limit 22/tcp`, replace it with `allow` so GitHub (different IPs each run) can connect.

2. **Cloud / provider firewall** — If the VPS is behind a cloud security group or network ACL (e.g. AWS, GCP, Hetzner), open inbound TCP 22 from `0.0.0.0/0` (or from [GitHub’s IP ranges](https://api.github.com/meta) if you prefer to restrict).

3. **Check from your machine** — From your laptop run `ssh -v $VPS_USER@$VPS_HOST`. If that works but the workflow still times out, the VPS is likely blocking GitHub’s IPs.

4. **Optional: longer timeout** — The workflow sets `timeout: 60s` for the SSH connection; if the network is slow you can increase it in `.github/workflows/deploy.yml`.
