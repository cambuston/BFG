# Implementation mapping

Status: implemented and visually verified at 390×844.

- Activation: `/<handle>?decorated=barbas`, restricted to Barbas.
- Shared theme: `/public/decorado.css`.
- Shared generated texture: `/public/decorations/barbas-piedra.png`.
- Live business name, prices, schedule, and actions remain semantic HTML populated from the database.
- No functional element was removed.

The shared Barbas theme exposes independent `--decor-icon-color`, `--decor-check-disc`,
`--decor-check-ring-light`, `--decor-check-ring-dark`, `--decor-check-mark`, and
`--decor-check-shadow` parameters. The public screen consumes the same values as the alta.

Intentional deviation: preview content comes from the local `barbas.mx/luis` record, not the mockup's Ana Ruiz.
