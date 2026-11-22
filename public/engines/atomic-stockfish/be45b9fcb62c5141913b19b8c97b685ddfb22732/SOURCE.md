Atomic-Stockfish browser release
================================

Release: https://github.com/Belzedar94/Atomic-Stockfish/releases/tag/browser-wasm-be45b9f

Corresponding source: https://github.com/Belzedar94/Atomic-Stockfish/tree/be45b9fcb62c5141913b19b8c97b685ddfb22732

The upstream manifest.json records the build flags, runtime limits and artifact
hashes. SHA256SUMS preserves the upstream checksums. The published browser bench
signature is 659511 nodes.

The site serves the matching network as atomic-ft5-0p8B.nnue-gzip. The site worker,
atomic-stockfish-gzip.worker.js, decompresses it before validating the original
network SHA-256 and loading it. The upstream worker is included for comparison.

Atomic-Stockfish and the network are distributed under GPLv3. See Copying.txt and AUTHORS.
Network attribution: "Atomic-Stockfish network by Belzedar".
