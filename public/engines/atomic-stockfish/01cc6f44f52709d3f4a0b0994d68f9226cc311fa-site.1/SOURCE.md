Atomic-Stockfish browser build for Atomic Puzzles
=================================================

Base: https://github.com/Belzedar94/Atomic-Stockfish/tree/01cc6f44f52709d3f4a0b0994d68f9226cc311fa

This is a downstream build, not an upstream release. The complete changes to the
base are in [source.patch](source.patch): the native search thread parks while
waiting for `stop` or `ponderhit`, and the browser worker bounds startup, cancels
the network request on disposal, and accepts the optional decoded `expectedBytes`
alongside the required SHA-256.

To rebuild, check out the base, apply the patch, activate Emscripten 4.0.10 and run:

```sh
git checkout --detach 01cc6f44f52709d3f4a0b0994d68f9226cc311fa
git apply /path/to/source.patch
SOURCE_DATE_EPOCH=0 python3 tests/wasm-browser/build.py --out-dir build/wasm-browser
```

[manifest.json](manifest.json) records compiler flags and the reference NNUE
size and hash. [SHA256SUMS](SHA256SUMS) covers the shipped files. Do not replace
this build in place: the site serves these URLs with immutable caching.

The engine and network are distributed under GPLv3; see [Copying.txt](../01cc6f44f52709d3f4a0b0994d68f9226cc311fa/Copying.txt)
and [AUTHORS](../01cc6f44f52709d3f4a0b0994d68f9226cc311fa/AUTHORS).
Network attribution: "Atomic-Stockfish network by Belzedar".
