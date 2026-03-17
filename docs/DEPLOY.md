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
