# CourseFlow free public query proxy

`worker.mjs` exports a standard Cloudflare Workers module (`default.fetch(request, env, ctx)`). It requires no dependencies, credentials, or database. Import `createHandler()` if the hosting framework needs a route adapter; create one handler at module scope so it can reuse its bounded cache and request queue.

```js
import publicProxy from './worker.mjs';
export default {
  fetch(request, env, ctx) {
    return publicProxy.fetch(request, env, ctx);
  },
};
```

Route `/api/status`, `/api/catalog/terms`, and `/api/catalog/sections?term=202710&q=CS3100` to this module. JSON contracts match the existing Java API. The frontend must use the deployed API origin for these GET requests with `credentials: 'omit'`. Only the exact browser origin `https://wangcb424.github.io` receives CORS access. For local development only, set `ALLOW_LOCALHOST=true` to permit `http://localhost:5173` and `http://localhost:4173`.

## What this free service does

It reads public, anonymous Northeastern Banner search results on demand. Queries run only while a client makes requests. A 60-second response cache and request coalescing reduce repeated lookups. Every upstream call is serialized within an isolate with at least 1.2 seconds between start times. At most four distinct lookups may be in progress. Calls have a 12-second request/body timeout, a 2 MB body limit, and a bounded waiting queue. Each anonymous course search has its own cookie jar.

`status.backgroundMonitoring=false` is intentional: this proxy has no periodic tasks, email login, synchronized watchlists, SMTP, or background push notifications. `lastPoll` is the last successful on-demand lookup within this isolate. The frontend's local watchlist can poll while the page is open and must clearly disclose this limitation. Cached results retain the original observation timestamp; failures return errors instead of inventing zero available seats.

## Deployment limits

The cache (256 entries), request queue, and rate limiter (60 API requests per IP per minute; at most 5,000 buckets) are in-memory and **per isolate**. Cloudflare may create multiple isolates or discard them. These limits therefore are not a global rate guarantee. A multi-user production service requiring a global Banner limit should use a Durable Object or another coordinated queue. On Cloudflare, `CF-Connecting-IP` is set by the platform. If integrating on another host, remove client-supplied versions and use the platform's trusted client address. Do not add artificial traffic to keep free hosts awake.

The upstream host and endpoint paths are fixed. The proxy does not accept upstream URLs, school logins, registration requests, or redirects outside the public Banner paths. Browser CORS is not authentication: server clients may still call public endpoints. Banner is an undocumented public integration, and its interface or availability can change.

## Verification

Run offline tests with Node 22 or later:

```sh
npm test
```

Tests cover parsing, overenrollment, missing seat counts, input validation, cookie merging/path/expiry/isolation, permitted and rejected redirects, SSRF constraints, timeouts/body limits, spacing/queue bounds, CORS, cache expiry/coalescing, failure responses, and per-IP rate limits. Upstream responses in tests are fixtures; they do not prove that the deployed worker can access Banner. Perform one live query after deployment and verify that the UI marks stale/error states honestly.
