# Architecture and interview notes

The product is a single-origin PWA served by a modular Spring Boot monolith. PostgreSQL holds durable state; Redis is optional. One application instance runs polling and delivery tasks. Horizontal scaling requires shared sessions, worker leases, distributed rate limits, and per-delivery claiming; those are not claimed by v0.2.

| Module | Responsibility |
|---|---|
| React / api.ts | UI, same-origin requests, CSRF token, accessible forms |
| SecurityConfig / AuthService | Session authentication, OTP attempts, ownership boundary |
| CatalogService / SeatFeed | Cached source retrieval behind an interface |
| TrackerService / TrackerRepository | Transactional observations, watches, history, outbox |
| MonitorJobs | Shared polling and independently retried email delivery |
| PushJobs / PushGateway | Encrypted push, failed endpoint cleanup, retry state |
| SQL V1–V3 | Versioned schema and constraints |
| Docker / CI | Reproducible build and automated verification |

Section identity is `(source, term, CRN)`, not CRN alone. A CRN may recur in another term. Legacy schedule lab entities are isolated from the live tracking schema.

API responses expose both `checkedAt` (last success) and `lastAttemptAt`. On a failed source check the previous number is retained, an error is attached, and the UI presents the value as last known rather than currently available.

The default five-minute poll uses fixed delay after the whole preceding pass. A nominal interval is not a maximum alert latency. Requests have bounded timeouts and a global per-instance gap. Exact course searches are capped at the first 50 upstream results; truncation is shown. A missing watched CRN becomes unknown, never full.

The durable outbox records events inside the observation transaction. SMTP is external to the database transaction. Normal threshold transitions are deduplicated, but delivery retries are at-least-once, not exactly-once. An SMTP success followed by an acknowledgement failure remains a possible duplicate. Failed notifications remain visible in-app.

Security measures include HttpOnly/SameSite cookies, secure cookies in production, CSRF on state changes, parameterized SQL, validated inputs, per-user query filters, hashed expiring OTPs, bounded rate limiting, and a push-provider allowlist. This is not a claim of an independent security audit.

Potential résumé wording **after the corresponding checks and deployment actually pass**:

- Built a Java/Spring Boot and React PWA for cross-device course-seat monitoring with PostgreSQL persistence and anonymous public-source integration.
- Implemented shared polling, threshold-transition alerts, transactional notification outbox, and bounded retries; validated account isolation and failure handling with integration tests.
- Containerized the application and configured CI against PostgreSQL, with optional Redis caching and Web Push delivery.

Add actual test counts, measured latency or user numbers only after collecting that evidence. Do not claim AWS deployment from a Dockerfile or a Render configuration; AWS remains a separate deployment exercise if chosen.
