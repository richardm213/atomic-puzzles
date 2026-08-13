# CSS system: incremental adoption

The CSS system is intentionally being constrained without a rewrite. Existing page styles remain
valid; use the shared layer whenever a page or feature is already being changed.

## Tokens

`src/theme/site-theme.css` owns color, spacing, radius, shadow, control, and panel tokens. New
spacing should use `--space-*`; controls should prefer `--control-*`; panel composition should
prefer `--panel-*`. Add a semantic token there instead of introducing a raw color in a feature
stylesheet.

## Shared primitives

`src/theme/site-layout.css` provides low-specificity classes that are safe to combine with a
feature class:

- `sitePage`, `siteStack`, and `siteCluster` for composition
- `sitePanel` for the standard panel surface
- `controlField`, `controlLabel`, `controlInput`, and `controlButton` for controls and states

Override their documented custom properties from the feature class rather than increasing selector
specificity. `TournamentsPage` is the first incremental page adoption example.

## Feature styles

Keep page composition in the page stylesheet. When a meaningful feature is extracted into a new
component, colocate its styles with that component and use a CSS Module. Do not convert an existing
page wholesale merely to adopt CSS Modules. `TournamentArchiveCard` is the reference extraction.

## Raw-color guardrail

`npm run lint:styles` rejects new hex colors outside `src/theme`. The committed baseline preserves
legacy colors so the rule can be introduced without a rewrite. If a legacy color is removed, it may
be deleted from `.stylelint-raw-colors.json`; do not regenerate the baseline to make a new color pass.
Use `npm run lint:styles:baseline` only after an intentional repository-wide baseline reset.
