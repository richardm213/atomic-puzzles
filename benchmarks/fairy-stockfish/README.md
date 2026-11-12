# Local chess engine browser benchmark

This benchmark measures the production local analysis path in a real desktop Firefox session. It selects the engine explicitly and does not use the site's saved preference.

```bash
npm run benchmark:fsf -- --engine=atomic-stockfish
npm run benchmark:fsf -- --engine=fairy-stockfish-14
```

The command starts a local cross-origin-isolated Vite server, opens Firefox, runs six fixed atomic positions, and writes the result to `benchmarks/fairy-stockfish/results/`. Fairy-Stockfish 14 is the default when `--engine` is omitted. Atomic-Stockfish uses the configured NNUE URL (or the site's public asset URL); give the benchmark tab focus so it can acquire the engine lease. Set `FIREFOX_BIN` if Firefox is installed elsewhere, or add `--no-open` to open the printed URL yourself.

## What it measures

- first complete three-line result, including initialization on the first (cold) position;
- total elapsed time for each three-second search;
- final primary-line depth, nodes, and engine-reported NPS;
- warm medians across the remaining five positions.

Every FEN is unique within a run and the page must reload before another run. This prevents the app's in-memory evaluation cache from satisfying a benchmark request. The harness calls `analyzeFairyStockfishPosition` directly and never requests AtomicDB.

## Comparing runs

Use the same computer, Firefox version, power mode, and approximate background load. Compare the warm median NPS first, then warm first-result latency. Cold latency also includes JavaScript, worker, and WASM startup and is naturally more variable.

Do not turn the measurements into a CI pass/fail threshold: browser scheduling and machine load make wall-clock performance unsuitable for a stable automated assertion. Commit a representative result to `baselines/` only when deliberately updating the reference machine or engine configuration; ordinary timestamped results are gitignored.
