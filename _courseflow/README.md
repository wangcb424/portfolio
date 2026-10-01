# CourseFlow — Public Course Seat Tracker

A responsive React PWA for tracking Northeastern course seats, with a free anonymous edition and a separate Java/Spring Boot full edition. Regular users only need a modern browser.

**中文使用入口：[START_HERE_ZH.md](START_HERE_ZH.md)**

**Public app:** https://wangcb424.github.io/portfolio/courseflow/

The public edition requires no GitHub, ChatGPT, or university login. Each browser keeps its own watchlist and checks seats while the page is open and visible. It does not run a user's monitor after the page closes. See [the free-edition guide](docs/FREE_EDITION_ZH.md) and [the verification record](docs/VERIFICATION.md) for deployment status and tested limits.

## Free public edition

- Real public Banner term/course lookup through a read-only server proxy.
- Up to 20 local watches, thresholds, pause/resume, history, and in-app alerts.
- Approximately five-minute checks while the page is visible and online; optional browser notifications.
- Validated watchlist export/import for moving between devices; no account or database needed.
- Responsive layout, PWA shell, clear stale/error states, and an explicit warning when storage is unavailable.

The proxy implementation and tests are in `public-query-proxy/`. GitHub Pages serves static assets; it does not execute Java. The deployed free edition does not use PostgreSQL, email, Redis, or a background notification server.

## Java full edition (separate deployment)

- Public Banner course search using anonymous per-search cookies, with term + CRN identities.
- Email one-time-code login, server sessions, CSRF protection, ownership checks, and request limits.
- Up to 20 watched sections per account; threshold, pause, resume, and remove controls.
- Server polling shared by course across subscribers, bounded cache, optional Redis TTL cache.
- Seat-change history, last successful check, and explicit stale/error states.
- Transactional notification outbox, in-app alerts, SMTP email retries, and optional encrypted Web Push.
- Installable PWA manifest, service worker, offline fallback, desktop/mobile layouts.
- Optional Chrome/Edge quick-access extension. It opens the main app; it does not run a separate monitor.
- Original synthetic schedule-generation lab, with bounded combinations and existing conflict tests.
- Flyway migrations, Docker build, PostgreSQL/Redis deployment configuration, CI and browser tests.

The Java edition is preserved for local learning and independent deployment. Its server-side accounts and background features are not enabled on the free public website.

## Local demo

For a zero-install **interface preview**, open `PREVIEW.html` in a desktop browser. Its prominent banner identifies all data as simulated. This self-contained file runs no backend, does not monitor courses, sends no mail, and resets on reload. Its simulator is isolated in `scripts/preview-fixture.mjs` and is never included in the deployed app.

If a `release/courseflow.jar` is included, double-click `Start-Demo.cmd` on Windows (Java 17+ required on this developer machine only), then open http://localhost:8080. The demo uses a local H2 database and synthetic seats. It displays sign-in codes on screen and never sends mail.

From source, use `Build-Demo.cmd` on Windows or `sh scripts/build.sh` on macOS/Linux. Developer builds need a JDK 17+ and Node 24 LTS; Maven Wrapper is included. Alternatively:

```sh
docker compose -f compose.demo.yml up --build
```

Sign in with any example email in the **local demo**, search CS3100, track a full section, open My watchlist, and click **Open 2 seats**. Inspect Alerts and History. Demo identities are intentionally not email-verified; do not put personal information into a public demo.

## Deployment

Read [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). The root Dockerfile builds the frontend into the Spring Boot jar: one public origin, one application service, PostgreSQL, and optional Redis. Use **one application replica** in v0.2; scheduled workers and in-memory sessions are not designed for multiple replicas.

Set `SPRING_PROFILES_ACTIVE=production`, database configuration, `PUBLIC_URL`, and SMTP credentials. `render.yaml` is an optional full-edition deployment template; it provisions paid resources only if you choose to deploy it. The free public edition uses none of these paid resources.

## Development

```sh
# Terminal 1
cd backend
./mvnw spring-boot:run
# Terminal 2
cd frontend
npm ci
npm run dev
```

Vite forwards `/api` to localhost:8080. The service worker registers in production builds only. On Windows PowerShell use `mvnw.cmd` and `npm.cmd` if script execution policies block the other forms.

## Verification commands

```sh
cd backend
./mvnw verify
cd ../frontend
npm run build
# Frontend-only checks with simulated API responses:
npm run test:ui
# Free anonymous edition and GitHub Pages/PWA checks:
npm run test:free
npm run test:pages
# Requires the jar built with frontend assets included:
npm run test:e2e
```

The repository CI is configured to run backend integration tests against PostgreSQL 17. Local backend tests default to H2 in PostgreSQL mode. Automated tests use controlled upstream fixtures and do not send real email. Live anonymous data checks are recorded separately. Browser tests require the Chromium download (`npx playwright install chromium`) once on the developer machine and use Node 24.

## Operational limits

- Banner is an undocumented public-web integration, not a contracted API. Public availability does not establish permission for unrestricted automated use. Verify applicable usage requirements before public rollout.
- Default checks are every five minutes **after the preceding poll finishes**. Upstream requests are serialized and separated by at least 1.2 seconds; actual delay grows with watched courses. Failures do not become zero-seat observations.
- Availability is not enrollment eligibility. Reserved seats, linked sections, prerequisites and holds still matter. CourseFlow never registers anyone.
- Notification delivery is at-least-once. A crash after delivery but before the database acknowledgement can duplicate an email. Web Push uses a stable notification tag to collapse retries where supported.
- Sessions expire after seven days of inactivity and are lost on server restart. Sign in again to restore the database-backed watchlist.
- Seat-change history is retained for 90 days. The UI displays the latest 100 observations/notifications.
- Web Push needs HTTPS, configured VAPID keys, supported browsers and user permission. iOS requires adding the app to the Home Screen. Email is an independent channel.

## Learning

[docs/LEARNING_ZH.md](docs/LEARNING_ZH.md) walks through the files and the seat-change → notification path. [docs/ARCHITECTURE_V2.md](docs/ARCHITECTURE_V2.md) covers tradeoffs and interview discussion. Existing phase-one documents describe the earlier schedule lab, not the current deployment flow.
