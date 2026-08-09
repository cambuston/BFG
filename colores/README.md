# colores

Banco de trabajo para el color de las marcas. **Nada de esta carpeta corre en
la app**: se puede romper, rehacer y borrar sin consecuencias.

Si eres otra sesión y te tocó trabajar aquí, esto es lo que hay que saber.

---

## La regla, una sola

**El color vive en [`src/brand.js`](../src/brand.js) y en ningún otro lado.**

```js
flecos: { color: '#2F6BFF', … }
barbas: { color: '#0F766E', … }
```

El servidor lo incrusta en el HTML como `:root { --brand-blue: … }` antes de
que cargue el CSS, y de ahí cuelga todo. Cambiar esa línea cambia la app
entera. **No hay una segunda lista de colores que actualizar** — si encuentras
un color escrito a mano en algún CSS, eso es un bug, no una excepción.

## Qué sigue al color y qué no

**Sí lo sigue** (todo esto es CSS, se recolorea solo):

- El fondo azul plano.
- **El marco del calendario entero** — las argollas, el papel y el cierre.
  Esto es nuevo: hasta hace poco eran PNG con el azul horneado, y por eso
  Barbas mostraba un halo azul alrededor de las argollas. Ver
  [`public/marco.css`](../public/marco.css).
- Botones, textos, la barra del navegador (`theme-color`).

**No lo sigue** (son PNG con color horneado):

- **La estrella dorada** (`star.png`, `spark.png`). El oro funciona sobre
  cualquier fondo oscuro, así que no estorba. Si un color candidato pelea con
  el dorado, es motivo para descartar el color — no para reexportar el arte.

- **La palomita (`check.png`) es AZUL**, y ese azul no cambia nunca. Míralo en
  la hoja de contactos: en Vino, Tabaco o Ciruela queda una palomita azul
  celeste en una página vino, y canta.

  Es lo primero que hay que resolver si Flecos y Barbas dejan de ser azul y
  verde. Tres salidas, de menos a más trabajo:

  1. Quitarla (`.calendar-dialog::after { content: none }` desde `marco.css`).
  2. Redibujarla en CSS, como ya se hizo con el marco del calendario
     ([`public/marco.css`](../public/marco.css) explica cómo se midió el arte).
  3. Reexportar el PNG en gris/blanco y teñirlo con `mask` + `background:
     var(--brand-blue)`, que es el truco que ya usa `calendar-colors.css`.

  La 2 es la que deja el proyecto donde debe estar.

  (Detalle aparte: en la pantalla del alta la palomita no se ve, sólo en la
  página pública. Eso ya pasaba antes de todo esto y está anotado en el
  [README principal](../README.md#pendiente-conocido).)

## Probar un color

```bash
node colores/ver.js                    # toda la paleta de paleta.js
node colores/ver.js "#9F1239"          # uno suelto
node colores/ver.js "#9F1239" "#334155"
```

Levanta su propio servidor con una base de usar y tirar, da de alta un negocio
de ejemplo, y pinta cada color en las dos pantallas que importan (el alta y la
página pública). No toca `src/brand.js` ni tu base de datos: mete el color
pisando `:root` con `addStyleTag`, que es el mismo mecanismo que usa el
servidor.

Deja todo en `colores/muestras/`, con un **`index.html` para comparar los
colores lado a lado** en el navegador. Esa carpeta está en `.gitignore`.

## El contraste manda

La app es **texto blanco sobre el color de marca**. Eso hace que la elección
del color no sea sólo de gusto: si el color es claro, la letra no se lee.

`ver.js` calcula el contraste (WCAG) de blanco sobre cada color. AA pide
**4.5**, pero el cuerpo de la app va en **Inter 200**, que es muy delgada, así
que quedarse en 4.5 se queda corto en la práctica. Apunta a 7 o más.

### Lo que salió al medir los dos colores de hoy

| Marca | Color | Contraste | |
|---|---|---|---|
| Flecos | `#2F6BFF` | **4.499** | por un pelo **no** llega a AA |
| Barbas | `#0F766E` | 5.47 | pasa, pero justo |

El azul de Flecos se queda a milésimas del mínimo. Viene heredado de Días que
Cuentan, así que **cambiarlo no es una decisión de esta carpeta**: es de Luis,
y afecta a los dos proyectos. Queda anotado, no arreglado.

Si algún día se decide, el mismo azul un escalón más oscuro arregla el número
sin perder el carácter (medido, no estimado):

| | Contraste |
|---|---|
| `#2F6BFF` hoy | 4.499 |
| `#2A5FE0` | 5.509 |
| `#2557E8` | 5.822 |
| `#1E4FD6` | 6.678 |

## Las reglas de la casa que aplican aquí

- **Sin dependencias nuevas.** `ver.js` usa Playwright, que ya estaba para las
  pruebas, y nada más.
- **No toques** `styles.css`, `header-split.css`, `calendar-form.css` ni
  `calendar-colors.css`. Son copias literales de Días que Cuentan. Si el look
  hay que cambiarlo, se cambia en `handle.css`, `marco.css`, `negocio.css`,
  `mi.css` o con las variables de `src/brand.js`. Ver
  [`CLAUDE.md`](../CLAUDE.md).
- **Todo en español**, incluidos los comentarios y los nombres de las pruebas.

## Qué hay aquí

```
paleta.js    Los colores candidatos. Solo datos; nadie los importa desde la app.
ver.js       Genera las muestras y la hoja de contactos.
muestras/    Salida. Se regenera sola y está en .gitignore.
```
