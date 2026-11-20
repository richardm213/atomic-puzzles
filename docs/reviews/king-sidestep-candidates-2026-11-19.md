# King sidestep candidates

Reviewed on 2026-11-19 against the current database. The 15 shortlisted puzzles were subsequently tagged at the user’s request.

The revised motif is a king move out of danger to prepare an attack, often breaking a pin and/or clearing a square for an attacking piece. It now sits directly under Defensive, separately from King walk. A forced king move by itself is not enough to establish the motif.

## Search and validation

- Replayed all 2,638 active puzzles, including every solution branch and all 24 King walk puzzles. All had parsable solution lines.
- Checked the solver's king moves with both queens still present at the actual move, including later positions in solutions. Excluded castling and branches marked as incorrect/retry.
- Found 161 puzzles passing that broad filter. These are a search pool, not confirmed motif assignments.
- Inspected the existing King walk lines and shortlisted 15 positions for engine checks, including puzzles with no tags and puzzles carrying other motifs.
- Engine: Atomic-Stockfish `dev-20261116-097b77b6`, 2 threads, 128 MB hash, MultiPV 3, 1.2 seconds per position plus 0.8 seconds restricted to the sidestep. These short checks support candidate selection; they are not exhaustive proof of a unique solution.

## Strong starting points

| Puzzle | Move | Existing tags | Why it fits |
| --- | --- | --- | --- |
| [2851](https://atomicpuzzles.org/solve/2851) | **11. Kd1** | King walk | Clear existing-puzzle example: vacates e1 for Re1+. The existing explanation explicitly describes this idea. One-move solution; engine selected Kd1. |
| [1272](https://atomicpuzzles.org/solve/1272) | **15. Kd1** | King walk, Defensive | Steps away from the explosion threat against e1; the short line continues …Ne3+ fxe3. Engine selected Kd1. |
| [2824](https://atomicpuzzles.org/solve/2824) | **7…Kf8** | King walk | Existing explanation describes escaping the d-file pin and Bb5+ tactics. Engine selected Kf8. |
| [215](https://atomicpuzzles.org/solve/215) | **15…Kd8** | King walk, Defensive | Leaves the danger around e8 and permits …Rf7/…Rf8 against Qg7/Qg8+. Engine selected Kd8; this is a defensive resource, not a forced win. |
| [25](https://atomicpuzzles.org/solve/25) | **10. Kd1** | King walk, Defensive, Fork, Epaulette fork | Short relocation away from the knight's threats around e1. Engine selected Kd1. |
| [1174](https://atomicpuzzles.org/solve/1174) | **11. Kd1** | None | Quiet king safety move with a Re1+ continuation in the stored variations. Engine selected Kd1. |
| [11](https://atomicpuzzles.org/solve/11) | **6…Kd8** | Unpinning | Direct one-move opening example with both queens. Engine selected Kd8. |
| [283](https://atomicpuzzles.org/solve/283) | **10…Kh8** | None | One-move escape from f7's explosion radius while both queens remain. Engine selected Kh8. |

## Additional candidates

| Puzzle | Move / position | Assessment |
| --- | --- | --- |
| [576](https://atomicpuzzles.org/solve/576) | **10. Kd1** | Accepted one-move alternative. The engine preferred Bg6+ but also found a mating continuation after Kd1. Do not describe Kd1 as unique. |
| [2589](https://atomicpuzzles.org/solve/2589) | **Kd1** | Untagged for this motif; engine's first choice. A longer continuation makes it less concise as a teaching example. |
| [1742](https://atomicpuzzles.org/solve/1742) | **9. Kf1**, after dxe3 d5 | Existing explanation says the sidestep prepares exd5. Also appears after an intermediate Bf4. Engine selected Kf1 at the reached position. |
| [2815](https://atomicpuzzles.org/solve/2815) | **21. Kf2**, after Qd1 Qa1 | Breaks the pin and clears d1 for Rd1 after …Qxd1. Engine selected Kf2 at the reached position. |
| [2645](https://atomicpuzzles.org/solve/2645) | **11…Kf8** | Untagged; engine's first choice. Defense/equality rather than a winning tactic, so review the instructional goal before tagging. |
| [2180](https://atomicpuzzles.org/solve/2180) | **13…Kf8** | Untagged; engine's first choice. Worth reviewing for the precise avoided follow-up before assigning the new motif. |
| [585](https://atomicpuzzles.org/solve/585) | **14. Kf2**; Kd1 also accepted | Defensive/Prophylaxis. Engine preferred Kf2. Several valid king moves make this useful for the idea, less useful for a unique-move example. |

## Review of every existing King walk puzzle

| Puzzle | Result |
| --- | --- |
| 2 | Queenless multi-move walk; outside this search's queen-present sidestep target. |
| 25 | Strong Kd1 candidate above. |
| 86 | Kf1 is a later alternative; secondary candidate, not engine-checked in this review. |
| 113 | Kh8 is a short move, but no queen pair remains. |
| 121 | Queens are exchanged before the king move; outside the requested target. |
| 169 | Queenless castling and Kb1 sequence; retain the broader King walk motif. |
| 173 | Queenless Kh7 sequence; outside the requested target. |
| 215 | Strong Kd8 candidate above. |
| 869 | No queens at the king moves; outside the requested target. |
| 1140 | Ke2 follows Bb4+; possible secondary escape example, less clear than the shortlist. |
| 1216 | Queens disappear before the king moves; outside the requested target. |
| 1272 | Strong Kd1 candidate above. |
| 1618 | Ke7/Kd8 replies to Bb5+; secondary candidate, not engine-checked in this review. |
| 1742 | Kf1 prepares exd5; candidate above. |
| 1945 | Queenless Kf2 position; outside the requested target. |
| 2026 | Only one queen remains; outside the strict two-queen search. |
| 2050 | The queen capture precedes Kc5/Kc4; no queen pair remains at those moves. |
| 2324 | Ke2 answers Nd3+ late in the line; generic forced escape is a weaker motif match. |
| 2468 | Only one queen remains; outside the strict two-queen search. |
| 2519 | Queenless, several successive king moves; a walk rather than a concise sidestep. |
| 2635 | Queenless multi-move walk; outside the requested target. |
| 2815 | Kf2 breaks the pin; candidate above. |
| 2824 | Strong Kf8 candidate above. |
| 2851 | Clear single-move puzzle example; the interactive demonstration now uses a simpler teaching position. |
