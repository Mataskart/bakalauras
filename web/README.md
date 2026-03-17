# keliq — Web

Web app for keliq: homepage, login, drive history, leaderboard, and contacts.

## Setup

```bash
npm install
```

## Develop

```bash
npm run dev
```

Runs at http://localhost:3000. API requests to `/api/*` are proxied to https://keliq.lt (see `vite.config.js`). For local API use, ensure the backend allows CORS or use the proxy.

## Build

```bash
npm run build
```

Output is in `dist/`. Serve the contents of `dist/` from your domain (e.g. Nginx as the root for keliq.lt or a subpath).

## Deploy on same domain as API (keliq.lt)

1. Build: `npm run build`
2. Copy `dist/*` to the server (e.g. `/var/www/bakalauras/web/dist/`).
3. In Nginx, serve the SPA for `/` and proxy `/api` to the Symfony backend. Example:

```nginx
root /var/www/bakalauras/web/dist;
index index.html;
location /api {
    # proxy to Symfony (e.g. PHP-FPM or same server)
    proxy_pass http://127.0.0.1:...;
}
location / {
    try_files $uri $uri/ /index.html;
}
```

Then the app uses relative `/api`, so no CORS and no `VITE_API_URL` needed.
