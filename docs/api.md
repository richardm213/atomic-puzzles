# Atomic Puzzles API

The site API is a same-origin JSON API served below `/api`. It is intended for the Atomic Puzzles
web client and trusted first-party tools. Routes that expose private puzzle data or change state
require a signed site session; mutation routes also reject cross-site requests.

The machine-readable OpenAPI 3.1 description is available at
[`/api/openapi.json`](https://atomicpuzzles.org/api/openapi.json). API responses advertise it through
the `Link` header.

## Request conventions

- Send `Accept: application/json`.
- For `POST` routes, send `Content-Type: application/json` and a JSON object body.
- JSON request bodies are limited to 64 KiB. Individual batch limits are smaller where noted by a
  route's schema.
- Authenticated browser requests use the signed site-session cookie created by `/api/auth/session`.
- `OPTIONS` is supported on platform routes and returns an `Allow` header. Unsupported methods
  return `405` with the same header.
- Responses include `X-Request-Id`. Include that value in bug reports so a request can be traced in
  Netlify logs.
- Responses include `X-API-Version: 1`. Existing successful payload fields remain compatible within
  this version; new optional fields may be added.

## Errors

Errors have a stable base shape:

```json
{
  "error": "Invalid puzzle details request.",
  "code": "validation_failed",
  "details": {
    "issues": [{ "path": "puzzleIds", "message": "Too big: expected array to have <=20 items" }]
  }
}
```

`error` is safe to show to a person. `code` is the machine-readable branch. `details` is optional;
validation details contain field paths and messages but never echo submitted values.

Common codes are:

| Code                  | Typical status | Meaning                                                  |
| --------------------- | -------------: | -------------------------------------------------------- |
| `invalid_json`        |            400 | The request body is not valid JSON.                      |
| `validation_failed`   |            400 | JSON parsed, but fields do not satisfy the route schema. |
| `method_not_allowed`  |            405 | Use one of the methods in the `Allow` response header.   |
| `payload_too_large`   |            413 | The JSON request body exceeds 64 KiB.                    |
| `invalid_request`     |            400 | The request is invalid outside a field-schema check.     |
| `unauthorized`        |            401 | A valid signed site session is required.                 |
| `forbidden`           |            403 | The current user cannot perform this operation.          |
| `not_found`           |            404 | The requested record does not exist.                     |
| `conflict`            |            409 | The operation conflicts with existing state.             |
| `rate_limited`        |            429 | Retry after the delay in the `Retry-After` header.       |
| `service_unavailable` |            503 | A required service is not configured or available.       |
| `internal_error`      |            500 | An unexpected server error was hidden from the response. |

## Route catalog

| Route                      | Method            | Access     | Purpose                                                              |
| -------------------------- | ----------------- | ---------- | -------------------------------------------------------------------- |
| `/api/auth/session`        | GET, POST, DELETE | mixed      | Read, create, or clear the signed site session.                      |
| `/api/puzzles/play`        | POST              | signed in  | Load playable puzzle details by ID.                                  |
| `/api/puzzles/progress`    | POST              | signed in  | Idempotently record a first puzzle attempt.                          |
| `/api/puzzles/submit`      | POST              | signed in  | Submit one puzzle or a batch for review.                             |
| `/api/puzzles/community`   | POST              | mixed      | Load discussions and rankings; voting/commenting requires a session. |
| `/api/puzzles/issues`      | POST              | mixed      | Create an issue or manage the reviewer's issue queue.                |
| `/api/puzzles/rating`      | POST              | mixed      | Read rating history/leaderboards or perform restricted rating edits. |
| `/api/puzzles/explanation` | POST              | restricted | Update a puzzle explanation.                                         |
| `/api/puzzles/tags`        | POST              | restricted | Update puzzle motif tags.                                            |
| `/api/puzzles/review`      | POST              | restricted | Manage the puzzle-review queue.                                      |
| `/api/puzzle-sets`         | POST              | mixed      | Read or manage custom puzzle sets.                                   |
| `/api/notifications`       | POST              | signed in  | List, count, mark, or delete notifications.                          |
| `/api/coins`               | POST              | mixed      | Read or mutate Atomic Coin data according to the requested action.   |
| `/api/betting`             | POST              | mixed      | Read AWC markets or place and review Atomic Coin bets.               |
| `/api/badges`              | POST              | public     | Load earned achievements for a username.                             |
| `/api/archive-data`        | GET               | public     | Query the read-only match and rating archive.                        |
| `/api/opening-explorer`    | GET               | public     | Query opening statistics.                                            |
| `/api/atomicdb-analysis`   | GET, POST         | public     | Query one AtomicDB position or a bounded batch.                      |

“Mixed” routes authorize each action separately. Treat their server-side Zod schemas as the source
of truth for request fields and limits; they live in `netlify/features`.

### Match archive pagination

`GET /api/archive-data?resource=matches` accepts `page` and `pageSize` (maximum 200). Its response
keeps the existing `rows` and `total` fields and also includes navigation metadata:

```json
{
  "rows": [],
  "total": 0,
  "page": 1,
  "pageSize": 100,
  "totalPages": 0,
  "hasPreviousPage": false,
  "hasNextPage": false
}
```

Numeric filters must be finite numbers. `pairA`/`pairB` and `ratingMin`/`ratingMax` must be supplied
as pairs; inverted time or rating ranges are rejected rather than silently ignored. Supported match
modes are `hyperbullet`, `bullet`, `blitz`, `wolfrandom`, and `atomic960`.

## Examples

Load two puzzles from a signed-in browser session:

```ts
const response = await fetch("/api/puzzles/play", {
  method: "POST",
  credentials: "same-origin",
  headers: { Accept: "application/json", "Content-Type": "application/json" },
  body: JSON.stringify({ puzzleIds: [120, 121] }),
});

const body = await response.json();
if (!response.ok) {
  throw new Error(`${body.error} (${body.code}; request ${response.headers.get("X-Request-Id")})`);
}
```

Query a public AtomicDB position:

```bash
curl --get 'https://atomicpuzzles.org/api/atomicdb-analysis' \
  --data-urlencode 'fen=4k3/8/8/8/8/8/8/4K3 w - - 0 1'
```

Within the web client, prefer `apiRequest` (any method) or its `postApi` convenience wrapper from
`src/lib/api/postApi.ts`. They add a 30-second timeout, forward cancellation, validate optional
response schemas, distinguish network/time-out/server errors, and preserve the response status,
error code, details, and request ID on `ApiError`.
For `429` responses, `ApiError.retryAfterMs` exposes the server's `Retry-After` value.
