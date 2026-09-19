# Knockout bracket seeding

Use this pattern when generating or repairing a seeded single-elimination main bracket. AWC 2024, AWC 2025, and AWC 2026 are the canonical examples.

## Core rule

The draw is mirrored in the bottom half. Do not place every seed at the top of its local section.

At each pairing scale, use this visual rhythm:

```text
seed
unseeded
unseeded
seed
```

Expand the same rule recursively for 8 or 16 seeded sections. The seed on the lower side of a section belongs in the bottom slot of the section's final first-round match. Its path stays on the lower slot through every generated round until it meets the seed at the top of that section.

## Canonical 16-seed order

Read from the top of the draw to the bottom, the seeded pair blocks are:

```text
1–16
8–9
5–12
4–13
14–3
11–6
10–7
15–2
```

For a 128-player draw, each pair block contains eight Round-of-128 matches. Place the first listed seed as `p1` in the block's first match and the second listed seed as `p2` in the block's eighth match.

| R128 order | Seed | Slot |
| ---: | ---: | :--- |
| 1 | 1 | p1 |
| 8 | 16 | p2 |
| 9 | 8 | p1 |
| 16 | 9 | p2 |
| 17 | 5 | p1 |
| 24 | 12 | p2 |
| 25 | 4 | p1 |
| 32 | 13 | p2 |
| 33 | 14 | p1 |
| 40 | 3 | p2 |
| 41 | 11 | p1 |
| 48 | 6 | p2 |
| 49 | 10 | p1 |
| 56 | 7 | p2 |
| 57 | 15 | p1 |
| 64 | 2 | p2 |

This means seed 2 is at the absolute bottom of the draw. Seeds 3, 6, 7, and 2 occupy bottom slots in the lower half, matching the historical AWC layouts.

## Advancement and byes

- Preserve the same top/bottom orientation in Round of 64, Round of 32, and Round of 16. A lower anchor remains `p2`; do not move it to `p1` merely because it advanced by bye.
- Keep all feeder links explicit. Every match in the next round must have exactly two feeder matches.
- Keep structural `bye` versus `bye` matches when an otherwise empty branch is needed to preserve the tree. Display both byes explicitly.
- A seed versus `bye` is an automatic advancement, but the seed stays in its assigned slot.
- Qualifier matches are not part of the main bracket when the published bracket starts at Round of 128. Insert a known qualifier winner into the assigned R128 slot; leave unresolved qualifier slots empty.

## Validation checklist

Before publishing a generated bracket:

1. Confirm the first-round orders are consecutive and unique.
2. Confirm each later-round match has exactly two feeders.
3. Check all 16 seed anchors against the table above for a 128-player draw.
4. Confirm seed 2 is the bottom-most player and remains on the lower path through R16.
5. Confirm the bottom-half seed anchors are not vertically flipped.
6. Render the full bracket and inspect connector alignment from R128 through R16.
