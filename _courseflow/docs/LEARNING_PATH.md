# Learning path and estimated schedule

Assumption: 10–12 focused hours per week.

| Week | Deliverable | What you must understand |
|---|---|---|
| 1 | Local environment and HTTP API | request/response, JSON, dependency injection |
| 2 | PostgreSQL schema and Flyway | primary/foreign keys, joins, migrations |
| 3 | Course and prerequisite import | parsing, validation, idempotency, source policy |
| 4 | Scheduler MVP | recursion, backtracking, interval conflicts |
| 5 | React planner UI | state, forms, fetch, typed API data |
| 6 | Authentication and saved plans | password hashing, authorization, ownership |
| 7 | Unit/integration tests and Docker | test pyramid, real database tests, containers |
| 8 | Redis and indexes | cache-aside, invalidation, query plans |
| 9 | CI/CD and cloud deployment | pipelines, environments, secrets, rollback |
| 10 | Load test, monitoring, README/demo | P95, error rate, metrics, honest resume bullets |

## How we will study each part

For every milestone: explain the problem, draw the data/control flow, read the full implementation, run it, deliberately break it, write tests, then explain the tradeoff in your own words. Do not copy resume metrics until a reproducible benchmark produces them.

## Course data

- Catalog data: course code, title, credits, description, prerequisites.
- Term data: CRN, instructor, meeting times, campus, capacity, term.
- Personal data: completed courses and preferences, entered by the user.

Start with seed data and an explicit CSV import. Later add a connector only for a source whose access and terms permit automated retrieval. Never collect login cookies or scrape authenticated registration pages.
