Atomic-Stockfish browser release
================================

Release: https://github.com/Belzedar94/Atomic-Stockfish/releases/tag/browser-wasm-51150b0

Corresponding source: https://github.com/Belzedar94/Atomic-Stockfish/tree/51150b0c84bb27cde06d7d356efb3fa7bd1ec11f

Compiler flags, memory/thread settings, artifact sizes and supported network formats
are recorded in manifest.json. Upstream checksums are preserved in SHA256SUMS.
The site uses a separately named worker, atomic-stockfish-gzip.worker.js, with a
patch to decode the static gzip network before verifying it. The original worker
is retained for clients that cached its immutable URL.

The matching atomic-ft3b-1p2B.nnue network is served as a static gzip file from this directory. The worker verifies the decompressed network against SHA-256
`a32645ea6749c2500119bd53b55cc5baf2f6c502659f247e5e5ca4f26ea48e29`
before loading it. The release reports the browser bench signature as 416708 nodes.

Atomic-Stockfish and the network are distributed under GPLv3; see Copying.txt and AUTHORS.
Network attribution: "Atomic-Stockfish network by Belzedar".
