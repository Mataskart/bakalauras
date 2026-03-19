# keliq — Full Project Context (Handoff Document)

This document describes the **keliq** project in full detail so a new AI or developer can continue work with full context. Use it to onboard a fresh chat (e.g. in Claude Code).

---

## 1. Project overview

**keliq** is a **safe-driving app**: users record drives (manually or automatically via GPS), the backend scores driving quality (smooth driving + speed compliance using OpenStreetMap speed limits), and results appear in history and on a leaderboard.

- **Repository:** `bakalauras` (monorepo)
- **Live site / API:** https://keliq.lt
- **Components:**
  - **Backend:** Symfony (PHP 8.3), PostgreSQL, Redis — API only; no server-side rendering of the web app.
  - **Mobile:** React Native (Expo) app — main user-facing app for recording drives (Android; iOS config exists).
  - **Web:** React (Vite) SPA — login, history, leaderboard, profile; consumes the same API.

---

## 2. Repository structure

```
bakalauras/
├── backend/          # Symfony API
│   ├── bin/console
│   ├── config/       # security, doctrine, routes, lexik_jwt, cache (Redis)
│   ├── migrations/
│   ├── src/
│   │   ├── Command/  # SpeedLimitCacheFillCommand
│   │   ├── Controller/ # Auth, Session, Event, Me, Leaderboard
│   │   ├── Entity/   # User, DrivingSession, DrivingEvent, SpeedLimitCache
│   │   ├── Repository/
│   │   └── Service/  # ScoringService, SpeedLimitService, SpeedImputationService
│   ├── templates/    # Twig (auth page, etc.)
│   └── tests/
├── mobile/           # Expo / React Native
│   ├── App.js
│   ├── app.json
│   ├── index.js      # Imports backgroundLocation + dailySummary (task registration)
│   ├── assets/       # icon.png, splash, favicon
│   ├── android/      # Native project (prebuild)
│   └── src/
│       ├── api/client.js
│       ├── backgroundLocation.js   # Background GPS task (watch/record)
│       ├── dailySummary.js        # 21:00 notification
│       ├── driveBuffer.js          # Local event buffer
│       ├── notifications.js
│       ├── uploadDrive.js
│       ├── storage/   # token.js, autoDetect.js
│       └── screens/   # HomeScreen, LoginScreen, HistoryScreen, LeaderboardScreen, ProfileScreen, RegisterScreen
├── web/              # React (Vite) SPA
│   ├── src/
│   │   ├── api/client.js
│   │   ├── context/AuthContext.jsx
│   │   ├── pages/     # Home, History, Leaderboard, Login, Register, Contacts
│   │   └── components/
│   └── vite.config.js
├── .github/workflows/deploy.yml
└── docs/
    ├── DEPLOY.md
    ├── nginx-keliq.example.conf
    └── PROJECT_CONTEXT.md (this file)
```

---

## 3. Backend (Symfony) — detailed

### 3.1 Authentication

- **JWT** via Lexik JWTAuthenticationBundle.
- **Config:** `config/packages/security.yaml`, `config/packages/lexik_jwt_authentication.yaml`.
- **Firewall:** All `/api` (except `/api/auth/login`, `/api/auth/register`) require a valid JWT.
- **Endpoints:**
  - `POST /api/auth/register` — register (email, password, firstName, lastName).
  - `POST /api/auth/login` — login (email, password); returns `{ token }`.

### 3.2 Main entities

- **User** — id, email (userIdentifier), password (hashed), firstName, lastName, createdAt; OneToMany DrivingSession.
- **DrivingSession** — id, driver (User), startedAt, endedAt (nullable), status ('active' | 'completed'), score (nullable); OneToMany DrivingEvent. Score computed when session is stopped.
- **DrivingEvent** — session, latitude, longitude, accelerationX/Y/Z, speed (nullable), speedLimitKmh (nullable), recordedAt; eventType/speeding set by ScoringService.
- **SpeedLimitCache** — rounded lat/lon, speedLimitKmh; used to cache OSM lookups in DB.

### 3.3 API endpoints (all under `/api`, JWT required unless noted)

| Method | Path | Purpose |
|--------|------|--------|
| POST | /auth/register | Register (public) |
| POST | /auth/login | Login, returns JWT (public) |
| GET | /me | Current user profile + aggregate stats (totalSessions, averageScore, bestScore) |
| GET | /me/today-stats?date=YYYY-MM-DD | Drive count and average score for that calendar day (for daily notification) |
| POST | /sessions | Start session; body optional: `{ "startedAt": "ISO8601" }` |
| PATCH | /sessions/{id}/stop | End session; body optional: `{ "endedAt": "ISO8601" }`; returns score; invalidates leaderboard cache |
| GET | /sessions | List current user's sessions (for history) |
| POST | /sessions/{sessionId}/events | Append events (single object or array); recalculates score; returns currentScore, speedLimitKmh |
| GET | /leaderboard | Top 10 by duration-weighted average score (Redis cache 60s) |

### 3.4 Key services

- **ScoringService** (`src/Service/ScoringService.php`) — Computes 0–100 score from session events. Uses magnitude of acceleration (orientation-agnostic) and axis-based rules (hard brake, acceleration, sharp turn). Speeding penalty from OSM speed limit. Final score = 80% speed compliance + 20% smooth driving. Constants: STATIONARY_SPEED_KMH=5, HARSH_MAGNITUDE_THRESHOLD=2.5, various penalties.
- **SpeedLimitService** (`src/Service/SpeedLimitService.php`) — **Fetches road speed limit at (lat, lon).** First checks in-memory cache, then **DB cache** (SpeedLimitCacheRepository), then **OpenStreetMap Overpass API** (`https://overpass-api.de/api/interpreter`). Query: ways with highway+maxspeed in 50 m radius. Parses maxspeed (numeric, mph, km/h). Saves result to DB cache. **No local OSM map download yet** — every cache miss hits Overpass. See **user priority** below for implementing local VPS OSM cache.
- **SpeedImputationService** — Fills missing `speed` on events from consecutive GPS points when device didn’t report speed.
- **SpeedLimitCacheFillCommand** — `php bin/console app:speed-limit-cache:fill --bbox=minLat,minLon,maxLat,maxLon [--step=0.01] [--delay=1]` to pre-fill cache for a region (e.g. Lithuania) so runtime Overpass calls are reduced. Does not implement “download OSM maps to local storage” — it still calls Overpass per grid point.

### 3.5 Caches

- **Redis** — Leaderboard (key `leaderboard_top10`, TTL 60s). Configured in `config/packages/cache.yaml`. SessionController injects `CacheItemPoolInterface $leaderboardCache` and invalidates on session stop.
- **Speed limit** — PostgreSQL table (SpeedLimitCache); no Redis for speed limits.

### 3.6 Migrations

- Under `backend/migrations/`. Run with `php bin/console doctrine:migrations:migrate --no-interaction`. Deploy workflow runs this on every push to main.

---

## 4. Mobile app (Expo / React Native) — detailed

### 4.1 Entry and auth flow

- **index.js** — Imports `./src/backgroundLocation` and `./src/dailySummary` **before** App so that `TaskManager.defineTask(...)` and Background Fetch task are registered at load time. Then registers App with Expo.
- **App.js** — State: token, loading, screen ('login'|'register'). On mount: setUnauthorizedHandler, and bootstrapAuth (getToken → if stored, GET /me to verify → setToken, then scheduleDailySummaryAt21, registerDailySummaryTask, setupDailyNotification in try/catch). When token is set, useEffect runs setupDailyNotification (so notification permission requested after login). If no token or invalid: show LoginScreen or RegisterScreen; onLogin sets token and shows tab navigator.
- **Screens:** Drive (HomeScreen), History, Leaderboard, Profile. Token stored in AsyncStorage via `src/storage/token.js`.

### 4.2 HomeScreen — drive recording (manual and “Auto”)

- **Manual drive:** User taps “START” → startTracking() runs: Accelerometer listener + 2 s interval calling Location.getCurrentPositionAsync and pushOneEvent (append to buffer). No API calls during drive. User taps “STOP” → handleStopSession → completeCurrentDriveAndStop (or uploadBufferAndStop if coming from background), which trims buffer, uploads via uploadDrive.js, shows score.
- **Auto drive (background detection):** Toggle “Auto on” requires background location permission (“Allow all the time”). When Auto is on, HomeScreen runs an effect (after 800 ms delay) that calls startBackgroundWatching(). When app becomes active again, another effect retries startBackgroundWatching() so that after returning from Settings the watch can start. A separate effect polls isBackgroundRecording() every 2 s and if true sets tracking and takeOverWithAccel() (foreground recording with accelerometer). AppState listener: on background, stopTrackingSilent and resumeBackgroundRecording(); on active, retry startBackgroundWatching if Auto on, and takeOverWithAccel if recording.
- **Auto persistence:** `src/storage/autoDetect.js` — getAutoDetect / setAutoDetect (AsyncStorage). HomeScreen loads on mount and saves when user toggles.

### 4.3 Background location task (critical — currently not working)

- **File:** `mobile/src/backgroundLocation.js`.
- **Task name:** `keliq-background-location` (expo-location task).
- **Modes:** `watch` (low frequency) and `record` (high frequency).
- **Constants:** DRIVING_START_KMH = 10; WATCH_INTERVAL_MS = 3 * 60 * 1000 (3 min); RECORD_INTERVAL_MS = 2000 (2 s).
- **Flow:**
  1. startBackgroundWatching() — checks foreground + background location permission; stops any existing updates; setMode(MODE_WATCH); startLocationUpdatesAsync(LOCATION_TASK_NAME, { timeInterval: WATCH_INTERVAL_MS, distanceInterval: 0 }).
  2. TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => { ... }). When **mode === MODE_WATCH:** takes last location, reads coords.speed (m/s), converts to km/h; if speedKmh >= 10: setMode(MODE_RECORD), clearBuffer(), showRecordingNotification(), stopLocationUpdatesAsync, then startLocationUpdatesAsync with RECORD_INTERVAL_MS and foregroundService notification. When **mode === MODE_RECORD:** appends each location to buffer via locationToEvent(loc); then checks hasBeenStationaryFor15Min(buffer); if true, stops updates, trimStationaryTail, uploadDriveAndClear, setMode(MODE_WATCH), dismissRecordingNotification, restart watch updates.
- **Problem (user-reported):** Automatic detection of start drive via GPS speed in background **does not work** — it never records anything even when moving >50 km/h for hours. There are **no debugging logs** for each background GPS speed check, so it’s unclear whether: (a) the task is not receiving locations at all, (b) coords.speed is null/undefined on the device, (c) the task is killed by the OS, or (d) something else. **User priority:** Implement it properly and add debugging logs for each background GPS speed check (e.g. log every time the task runs with mode, locations count, last speed, threshold).

### 4.4 Drive buffer and upload

- **driveBuffer.js** — AsyncStorage key `keliq_drive_buffer`. getBuffer(), appendToBuffer(events), clearBuffer(). trimStationaryTail(buffer): drop last 15 minutes of events. hasBeenStationaryFor15Min(buffer): last 15 min all have speed &lt; 5 km/h and span ≥ 15 min. Events: latitude, longitude, accelerationX/Y/Z, speed (optional), recordedAt (ISO8601).
- **uploadDrive.js** — uploadDriveAndClear(trimmed): POST /sessions with startedAt (first event), POST /sessions/{id}/events in batches of 50, PATCH /sessions/{id}/stop with endedAt; then clearBuffer(). Returns { sessionId, score }.

### 4.5 Daily summary and notifications

- **dailySummary.js** — TaskManager.defineTask('keliq-daily-summary', ...). Background Fetch task; when run between 20:00–22:00 local and not already sent today, GET /me/today-stats?date=YYYY-MM-DD, then showDailySummaryNotification({ averageScore, driveCount }). registerDailySummaryTask() registers with minimumInterval 15 min.
- **notifications.js** — requestNotificationPermission(), setupDailyNotification() (channel + permission), scheduleDailySummaryAt21 (currently just cancelAllScheduledNotificationsAsync), showDailySummaryNotification, showRecordingNotification / dismiss. App requests notification permission when token is set (after login).

### 4.6 Android-specific

- **app.json** — name/slug "keliq", package lt.keliq.app, android.permissions include ACCESS_FINE_LOCATION, ACCESS_COARSE_LOCATION, ACCESS_BACKGROUND_LOCATION. adaptiveIcon: foregroundImage ./assets/icon.png, backgroundColor #0e1117. expo-location plugin: isAndroidBackgroundLocationEnabled, isAndroidForegroundServiceEnabled.
- **AndroidManifest.xml** — Same permissions; application android:label="@string/app_name". strings.xml in res/values has app_name "keliq".
- **Icon** — assets/icon.png (keliq “K” style). Prebuild regenerates mipmaps.

---

## 5. Web app — detailed

- **Stack:** React, Vite. Auth via context (token in localStorage key `keliq_token`). API client: baseURL from VITE_API_URL or `/api`; Bearer token on requests; 401 clears token and triggers logout.
- **Pages:** Login, Register, Home (marketing-style), History (list of sessions with formatDate and formatDuration), Leaderboard (top 10), Profile, Contacts. History timestamps are formatted in **browser local time** (parse ISO as UTC, then Intl.DateTimeFormat(undefined, { ... })).

---

## 6. Deploy (VPS + GitHub Actions)

- **Workflow:** `.github/workflows/deploy.yml`. On push to main: checkout → build web (npm ci, npm run build) → SSH to VPS (appleboy/ssh-action): cd /var/www/bakalauras, git pull, rm -rf web/dist, mkdir -p web/dist, backend: composer install --no-dev, doctrine:migrations:migrate, cache:clear, cache:warmup → SCP web/dist to /var/www/bakalauras (appleboy/scp-action). Timeouts: 60s connection, 5m command for SSH.
- **Secrets:** VPS_HOST, VPS_USER, VPS_SSH_KEY.
- **VPS:** Backend at /var/www/bakalauras/backend (Symfony, .env.local with APP_ENV=prod, DATABASE_URL, JWT_PASSPHRASE, REDIS_URL). Web app at /var/www/bakalauras/web/dist; Nginx serves SPA and proxies /api to PHP-FPM. See docs/DEPLOY.md and docs/nginx-keliq.example.conf. Troubleshooting: if “dial tcp :22: i/o timeout”, open port 22 on VPS (ufw allow 22/tcp, cloud security group).

---

## 7. User priorities for next work (give this to the next AI)

### Priority 1: Fix automatic drive detection (background GPS) and add debugging

- **Current state:** Auto mode is implemented in code (backgroundLocation.js with watch/record modes, 3 min watch interval, 10 km/h threshold, record at 2 s, 15 min stationary → upload). **In practice it never records anything** even when the user drives >50 km/h for hours.
- **Needed:**
  1. **Implement it properly** so that background drive detection actually starts recording when speed ≥ threshold and uploads when stationary 15 min (or user stops). Possible causes to investigate: task not receiving locations (Android killing background?); coords.speed null/undefined on device (use distance/time fallback?); task not re-registered after app restart; wrong interval or permission.
  2. **Add debugging logs** for each background GPS speed check: e.g. log when the background task runs with mode (watch/record), number of locations received, last location’s speed (m/s and km/h), threshold used, and whether transition to record happened. This will allow diagnosing why it never triggers on the user’s device.

### Priority 2: OpenStreetMap maps — local VPS cache/storage

- **Current state:** SpeedLimitService fetches speed limits from Overpass API (overpass-api.de) on cache miss; results are stored in PostgreSQL (SpeedLimitCache). There is a fill command to pre-warm the cache for a bounding box, but it still **pings Overpass for each grid point**. There is **no** local OSM map download (e.g. PBF/planet or regional extract) on the VPS.
- **Needed:** Implement a **local OSM map storage/cache on the VPS** so that speed limit lookups do not “excessively ping” the Overpass API. Options might include: (a) downloading a regional OSM extract (e.g. Lithuania) and querying it locally (e.g. with a local Overpass instance or a library that reads PBF/OSM data); (b) running a local Overpass instance with a small region; (c) a more aggressive pre-fill strategy plus rate limiting; or (d) another approach that reduces external API calls. The goal is to avoid hammering the public Overpass API while still resolving speed limits for the app’s usage.

---

## 8. Quick reference — important file paths

| Area | Path |
|------|------|
| Background GPS task | mobile/src/backgroundLocation.js |
| Task registration (must load first) | mobile/index.js |
| Drive buffer | mobile/src/driveBuffer.js |
| Upload after drive | mobile/src/uploadDrive.js |
| Auto on/off persistence | mobile/src/storage/autoDetect.js |
| HomeScreen (manual + auto UI) | mobile/src/screens/HomeScreen.js |
| Daily 21:00 notification | mobile/src/dailySummary.js |
| Notifications setup | mobile/src/notifications.js |
| Speed limit (OSM Overpass) | backend/src/Service/SpeedLimitService.php |
| Speed limit DB cache | backend/src/Entity/SpeedLimitCache.php, Repository |
| Pre-fill cache command | backend/src/Command/SpeedLimitCacheFillCommand.php |
| Sessions API | backend/src/Controller/SessionController.php |
| Events API + scoring | backend/src/Controller/EventController.php |
| Scoring logic | backend/src/Service/ScoringService.php |
| Deploy workflow | .github/workflows/deploy.yml |
| Deploy docs | docs/DEPLOY.md |

Use this document as the single source of context when continuing the project in a new chat or with a new AI.
