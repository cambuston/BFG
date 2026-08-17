# Implementation mapping

Status: first decorated implementation completed and visually verified.

## Component mapping

- `body.is-decorated.is-complete`: confines the experiment to `?decorated=1` and the final state.
- `.calendar-dialog`: preserves the CSS-built calendar.
- `.decoracion-floral`: supplies a non-interactive transparent floral overlay.
- `[data-step="3"]`: applies reference-inspired completion typography and spacing.
- `.palomita`: preserves CSS recoloring while adjusting decorated size and position.
- `.argolla`: preserves the existing CSS hardware unchanged.

## Production asset

- `/public/decorations/flecos-floral-frame.png`
- Provenance: generated from the supplied decorated reference as a style/composition reference,
  initially rendered on a flat magenta chroma key and converted locally to RGBA.
- The original chroma render and a record copy of the transparent asset remain under `assets/`.

The production file is separate from the record artifacts. The overlay uses `pointer-events: none`
and `aria-hidden="true"`; all text and controls remain live HTML.

## State and activation

The initial supplied original image represented address entry, so it was replaced in this record
with a browser-rendered undecorated completion state at 430×932. No functional element was removed.
The test variant is opt-in at `/?decorated=1`; the ordinary `/` route retains the normal design.

## Intentional deviations

- The flowers are a generated approximation, not a pixel-exact extraction.
- The existing gold spark and CSS rings were preserved.
- The reference's exact proportions were adapted to the 430×932 live viewport.
