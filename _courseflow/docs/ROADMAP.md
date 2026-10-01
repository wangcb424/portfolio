# CourseFlow delivery roadmap

Each phase is a working release of the same repository. A later phase extends the earlier one; it does not replace it with unrelated generated code.

| Phase | Deliverable | Core concepts |
|---|---|---|
| 1 | Foundation, catalog, sections, demo seats, schedule MVP | Spring layers, REST, PostgreSQL, Flyway, React, Docker |
| 2 | Catalog importer and prerequisite graph | parsing, validation, DFS, cycle detection, topological sort |
| 3 | Advanced schedule optimizer | backtracking, branch-and-bound, scoring, benchmarks |
| 4 | Accounts and saved plans | Spring Security, password hashing, JWT, authorization |
| 5 | Watchlists and seat snapshots | scheduled jobs, change detection, idempotency |
| 6 | Public Banner provider | adapter pattern, HTML parsing, caching, rate limits, source policy |
| 7 | Email and web notifications | events, retry, deduplication, notification preferences |
| 8 | Redis and integration testing | cache-aside, invalidation, Testcontainers, coverage |
| 9 | CI/CD, AWS, monitoring, load tests | GitHub Actions, deployment, metrics, P95 latency |
| 10 | Portfolio release | documentation, demo, measured resume bullets, interview stories |

## Completion rule

A phase is complete only after its code builds, its relevant tests pass, the run instructions work on a clean machine, and the user can explain the main design decision in their own words.
