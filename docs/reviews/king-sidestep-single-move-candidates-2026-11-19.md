# More King sidestep candidates

This follow-up uses the narrower definition: the king steps out of danger to prepare an attack, often breaking a pin and/or clearing a square for an attacking piece. King sidestep is directly under Defensive, separate from King walk.

Replayed all 2,638 active puzzles, excluding the 15 already tagged King sidestep. Across accepted branches, 370 further puzzles have a line containing exactly one solver king move. Of those, 25 have an accepted line requiring only that king move, sometimes followed by the opponent's reply. This broad pool includes endgame moves and forced escapes that do not satisfy the attacking purpose.

Engine-checked 19 positions with Atomic-Stockfish `dev-20261116-097b77b6`: 2 threads, 128 MB hash, MultiPV 3 for 1.2 seconds, then 0.8 seconds restricted to the candidate move. No new candidates were tagged in this review. Short engine checks support selection but do not prove uniqueness.

## Best additional examples to review

| Puzzle | King move | Solution format | Attacking purpose |
| --- | --- | --- | --- |
| [418](https://atomicpuzzles.org/solve/418) | **21. Kd2** | One move | Vacates c1 so the d1-rook can reach b1 and attack along the b-file. Engine selected Kd2 with a winning evaluation and continued …Ba3 Rb1. |
| [535](https://atomicpuzzles.org/solve/535) | **13…Kh8** | One-move branch; longer main line | Vacates g8 for the f8-rook. The stored line and engine both show …Rg8 and …Rg6. Both queens remain. Engine selected Kh8 and evaluated the position as roughly equal. |
| [2468](https://atomicpuzzles.org/solve/2468) | **22…Kh6** | One move | Moves the king outside g8's explosion radius, freeing the f8-rook to capture the white rook on g8. Engine selected Kh6 with a winning evaluation. |
| [308](https://atomicpuzzles.org/solve/308) | **25. Kg2** | Accepted one-move alternative | Vacates h1 for Rg1–h1 and stops the g-pawn's advance. The engine preferred Kg2 and then used Rh1 and Re1. |
| [2026](https://atomicpuzzles.org/solve/2026) | **…Kg8** | One move | Escapes the knight check and clears f7 for a rook lift along the f-file. Engine selected Kg8 and later continued …Rf6–h6. Defensive/equal rather than a forced win. |
| [22](https://atomicpuzzles.org/solve/22) | **11…Kh8** | One move | Vacates g8 for …Rg8, matching its existing Square clearance tag. Engine selected Kh8, but the position remained unfavorable for Black; treat it as an attacking defensive resource. |

## Longer lines with only one solver king move

| Puzzle | Move | Assessment |
| --- | --- | --- |
| [710](https://atomicpuzzles.org/solve/710) | **11. Kh1** | Both queens remain. Sidesteps the danger on the g-file and lets the knights attack via Nh4/Ng5. Engine selected Kh1. |
| [1297](https://atomicpuzzles.org/solve/1297) | **13. Kd1** | Frees White from the e-file threats before the h-pawn and rook attack. Engine selected Kd1, then h5 and Rh4–h8. |
| [1826](https://atomicpuzzles.org/solve/1826) | **Kd1** | Sidesteps the e1 explosion threats before developing Bd3/Bc4 and activating the rooks. Engine selected Kd1. |

## Secondary or weaker matches

- **854, …Kd8:** a one-move answer to check, followed by a winning counterattack. The escape is clear; verify that the teaching emphasis is attack preparation rather than merely answering check.
- **1662, …Kd8:** one move and the engine's first choice, but the follow-up is less immediate. Keep secondary to the clear square-clearance examples.
- **1373, …Kf8:** accepted one-move alternative. The engine preferred …d5; Kf8 is less compelling than the main shortlist.
- **1945, Kf2:** engine's first choice but the resulting position remained unfavorable. Needs a clearer attacking explanation before tagging.
- **1286, …Kf7:** engine preferred …Kf8; keep provisional.
- **2398, …Kh7:** a valid winning alternative, but the engine preferred …Rb3 and the attacking purpose of the king move is less direct.
- **2962, Kg2:** accepted winning move, but the engine preferred Kh1; looks more like a response to check than a clear attacking clearance.
- **228, …Kf8:** engine selected it with a winning evaluation. A rook/pawn endgame maneuver, less representative of the revised motif.
- **1633, Kh1:** engine selected it, but the follow-up centers on promoting the e-pawn; less direct than freeing an attacking piece.
- **2360, …Ke7:** accepted one-move alternative and engine's first choice, but primarily a defensive/equal position.

## All 25 one-move-answer matches

2072 Kf2; 2962 Kg2; 2360 Ke7; 2907 Kh1; 228 Kf8; 1373 Kf8; 2514 Kb5+; 854 Kd8; 1286 Kf7; 22 Kh8; 2026 Kg8; 1819 Ke6; 535 Kh8; 2398 Kh7; 1662 Kd8; 2684 Kf2; 1289 Ke2; 2875 Kf1; 245 Kd8; 308 Kg2; 418 Kd2; 1633 Kh1; 2468 Kh6; 1945 Kf2; 1873 Ke4.

The remaining matches include opposition, king blockade, connected-king tactics, simple escapes, and drawing resources. A single king move alone is not sufficient for the new attacking definition.
