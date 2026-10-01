# Architecture

## Why a modular monolith

The current scale does not justify microservice deployment, networking, tracing, and data-consistency overhead. One Spring Boot deployment keeps operations simple while package boundaries preserve future extraction options.

## Request flow

1. React sends course codes and preferences to `POST /api/schedules/generate`.
2. The controller validates JSON and calls `ScheduleService`.
3. The repository loads sections and meetings in one query.
4. Backtracking selects one section per course.
5. Conflict pruning rejects partial schedules immediately.
6. Complete schedules are scored, sorted, and returned as JSON.

## Overlap rule

Two half-open intervals `[aStart,aEnd)` and `[bStart,bEnd)` overlap exactly when:

`aStart < bEnd && bStart < aEnd`

This correctly allows one class to begin at the exact instant another ends.

## Complexity

With `C` courses and at most `S` sections per course, the worst case is `O(S^C)`. Early conflict pruning reduces the practical search space. A later milestone will add branch-and-bound and measured benchmarks.
