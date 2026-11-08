# CSS theming

Components use shared roles such as `--color-panel`, `--color-input-border`,
`--color-table-head`, and `--color-primary-soft`. Don't branch on a palette to
recolor an individual panel or table. Change the role or its shared recipe instead.

## Where to make changes

| File in `src/theme/tokens/` | Owns                                                             |
| --------------------------- | ---------------------------------------------------------------- |
| `foundation.css`            | Spacing, radii, shell sizing, and shared aliases                 |
| `color-modes.css`           | Light/Dark surfaces, text, borders, shadows, and native controls |
| `semantic-colors.css`       | Status, rating, market, and third-party colors                   |
| `palettes.css`              | Accent hues, brand colors, and the page background wash          |

`src/theme/site-theme.css` loads them in that order. `AppSettings` sets
`data-theme` for Light/Dark and `data-palette` for the selected palette.
`data-gemstone-theme` marks palettes that share the gemstone recipes.

## Keep surfaces consistent

- **Dark:** the mode defines the material recipe for panels, navigation, insets,
  elevated surfaces, and overlays. A palette can recolor their
  `--theme-*-ink` inputs; opacity belongs to the mode. For example, change
  `--theme-raised-ink` to recolor both elevated surfaces without changing their depth.
- **Light:** all palettes inherit the same neutral surfaces and text. Palette
  color stays on actions, links, selected states, and branding.
- **Semantic colors:** adjust them for contrast in Light or Dark, not to match a
  palette. A loss or rating series should stay recognizable when the palette changes.
- **Boards:** board presets and saved board settings are separate from the site
  surface tokens. The homepage gemstone diagrams use the same preset colors as
  the default playable boards.

When adding or tuning a palette, start in `palettes.css`. Compare it against
Default using the same page and data. Rankings is a useful check because it
shows a canvas, panel, inset controls, table header, rows, and hover states together.
