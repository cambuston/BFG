# Implementation mapping

Status: implemented and visually verified at 390×844.

- Activation: `/?decorated=barbas`, restricted to `BRAND.id === "barbas"`.
- Theme rules: `/public/decorado.css`.
- Texture: `/public/decorations/barbas-piedra.png`.
- Texture provenance: generated with the supplied image as a style reference; no UI or text is baked in.
- Copper frame, rings, cream fields, brown buttons, logo tile, and leather badge remain CSS/HTML.
- `.etiqueta-cuero` is `aria-hidden` and `pointer-events: none`.
- No functional element was removed.

## Independent color parameters

- `--decor-icon-color: #e8a16f`
- `--decor-check-disc: #74432f`
- `--decor-check-ring-light: #fff0da`
- `--decor-check-ring-dark: #a96142`
- `--decor-check-mark: #fff8ec`
- `--decor-check-shadow: rgb(0 0 0 / 0.52)`

The icon no longer inherits the dark general accent, so it remains visible on the copper logo tile.

Intentional deviation: the badge says “Barbas” instead of the reference's placeholder English copy.
