# Changelog

## 0.2.0 — Web seat tracker

- Added the anonymous public Banner adapter and synthetic demo adapter.
- Added email-code login, cross-device watchlists, thresholds, pause/resume, history and outbox notifications.
- Added optional Redis caching and Web Push, with server-side ownership and input checks.
- Rebuilt the UI as a responsive PWA and added the optional quick-access extension.
- Preserved V1 and the schedule lab; added V2/V3 migrations and bounded schedule requests.
- Added Docker/cloud configuration, integration/browser tests and Chinese learning guides.
- Corrected the prior unresolved Spring Boot parent coordinate. See VERIFICATION.md for execution evidence.

## 0.1.0 — Phase 1

- Created the Spring Boot/PostgreSQL/React monorepo.
- Added Maven Wrapper and Docker builds.
- Modeled courses, prerequisites, sections, meetings, and seat fields.
- Added course search and section lookup APIs.
- Added the first backtracking schedule generator and conflict tests.
- Added consistent API errors and responsive demo UI.
- Marked all local section/seat seed data as synthetic.
