# Turso opening explorer benchmark

This benchmark measures representative opening explorer loads through the deployed API and current Turso database.

```bash
npm run benchmark:openings
```

The suite covers general start/early/deeper positions, a date-filtered request, player start/early positions with an exact minimum-opponent-rating cutoff, and a head-to-head request. It runs each case three times and stores raw measurements plus medians in `benchmarks/opening-explorer/results/`.

Use another deployment or more samples when needed:

```bash
npm run benchmark:openings -- --origin=https://deploy-preview.example --runs=5 --label=after
```

## Cache integrity

Each request changes only the FEN halfmove and fullmove counters. Those counters create a unique URL, while the opening database hashes only the first four FEN fields into the same 12-byte position key. The runner also checks Netlify's `Cache-Status` header and fails if a response reports a cache hit. Database page warmth is intentionally not defeated: it is part of normal Turso performance, unlike a cached explorer response.

## Reading results

Compare medians on the same network and deployment. The first request can include DNS, TLS, Netlify function startup, and a cold Turso connection, so retain the individual samples instead of judging a change from one number. Personalized requests are especially useful for detecting extra database round trips.

Deployments with the benchmark instrumentation also report `medianServerMs` from the `Server-Timing` header. This isolates queue, query, and serialization time inside the opening explorer from the caller's network latency.

Timestamped runs are gitignored. Copy a deliberate reference run into `baselines/` with a descriptive name when the deployment and environment are known.

This runner measures API load time. On the analysis board, isolated positions fetch immediately; only rapid consecutive navigation adds the configured 100 ms trailing debounce before the request begins.
