Atomic-Stockfish browser release
================================

Release: https://github.com/Belzedar94/Atomic-Stockfish/releases/tag/browser-wasm-51150b0

Corresponding source: https://github.com/Belzedar94/Atomic-Stockfish/tree/51150b0c84bb27cde06d7d356efb3fa7bd1ec11f

These are the official release artifacts. Compiler flags, memory/thread settings,
artifact sizes and supported network formats are recorded in manifest.json.
Release-provided checksums are preserved in SHA256SUMS.

The matching atomic-ft3b-1p2B.nnue network is hosted separately in Supabase Storage,
compressed for delivery. The worker verifies the decompressed network against SHA-256
`a32645ea6749c2500119bd53b55cc5baf2f6c502659f247e5e5ca4f26ea48e29`
before loading it. The release reports the browser bench signature as 416708 nodes.

Atomic-Stockfish and the network are distributed under GPLv3; see Copying.txt and AUTHORS.
Network attribution: "Atomic-Stockfish network by Belzedar".
