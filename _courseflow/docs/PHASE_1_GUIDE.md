# Phase 1 learning guide

## Goal

Establish the smallest complete vertical slice: React sends an HTTP request, a Spring controller receives it, a service applies application rules, a repository reads PostgreSQL, and JSON returns to the browser.

## Backend packages

- `course`: course entity, DTO, repository, service, and controller.
- `section`: section/meeting entities and section query API.
- `schedule`: request DTOs, conflict detection, recursive search, and scoring.
- `common`: consistent API exception responses.
- `config`: cross-origin development configuration.

## Why DTOs are separate from entities

JPA entities describe persistence and relationships. API DTOs describe the public JSON contract. Returning entities directly can accidentally expose internal fields, trigger lazy-loading queries, and make database changes break clients.

## Request path

For `GET /api/courses?q=database`:

1. `CourseController` reads the query parameter.
2. `CourseService` trims and validates it.
3. `CourseRepository` searches code and title.
4. `CourseDto.from` converts entities to API output.
5. Spring serializes the DTOs as JSON.

## Database migration

`V1__initial_schema.sql` is the authoritative schema. Flyway records applied migrations so every environment reaches the same structure in the same order. Never edit V1 after a shared or production database has applied it; create V2 instead.

## Schedule conflict rule

Two meetings overlap only when they occur on the same day and both inequalities are true:

```text
a.start < b.end AND b.start < a.end
```

The intervals are treated as half-open, so a class ending at 11:00 does not conflict with one starting at 11:00.

## Backtracking

The generator chooses one section for each requested course. Before descending to the next course, it rejects a candidate that conflicts with any chosen section. This early pruning prevents many invalid complete combinations from being generated.

Worst-case complexity remains exponential. Phase 3 will add branch-and-bound and reproducible benchmarks.

## Exercises before Phase 2

1. Run the full project and open Swagger.
2. Search for `CS3100` and explain the controller-service-repository flow.
3. Change one synthetic seat count through a new Flyway V2 migration.
4. Add a unit test for two meetings that overlap only by one minute.
5. Explain why Banner data must be behind a provider interface rather than embedded in the scheduler.
