# Implementation mapping

- Activación: `/?decorated=barbas-mexico` con `BRAND.id === "barbas"`.
- Alcance: solamente el estado final (`body.is-complete`); las pantallas anteriores conservan el diseño normal.
- CSS: `public/decorado.css`, bloque `is-decorated-barbas-mexico`.
- Selector de modo: `public/app.js`.
- Fondo: `public/decorations/barbas-mexico-fondo.png`.
- Fuente del fondo: generado con ImageGen a partir de la referencia, usando motivos futboleros mexicanos genéricos y prohibiendo escudos, marcas y texto oficiales.

## Parámetros editables

- `--decor-icon-color: #d9b45d` — color del icono de la marca.
- `--decor-check-disc: #006847` — fondo del círculo de confirmación.
- `--decor-check-ring-light: #ffffff` — parte clara del aro.
- `--decor-check-ring-dark: #e5e0d6` — profundidad/sombra del aro.
- `--decor-check-mark: #ffffff` — color de la palomita.
- `--decor-check-shadow: rgb(25 42 28 / 48%)` — sombra exterior del check.

No hay texto, URL ni marca horneados en el bitmap; todo el contenido funcional sigue viniendo del DOM.
