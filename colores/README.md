# colores

Banco de trabajo para el color de las marcas. **Nada de esta carpeta corre en
la app**: se puede romper, rehacer y borrar sin consecuencias.

Si eres otra sesión y te tocó trabajar aquí, esto es lo que hay que saber.

---

## La regla, una sola

**El look vive en [`src/brand.js`](../src/brand.js) y en ningún otro lado.**

Una marca tiene un `color`, y puede tener además un `tema` con once piezas:
fondo, tintaFondo, papel, superficie, tinta, acento, logo, texto, sombra,
sombraAccion y herraje. Lo que no diga se deduce del `color` — por eso Flecos
y Barbas siguen sin traer `tema` y se ven igual que siempre.

```js
flecos: { color: '#2F6BFF', … }
barbas: { color: '#0F766E', … }
```

Hay temas completos listos en [`temas.js`](temas.js): la maqueta de Luis
(Flecos crema y salvia, Barbas negro, las dos con herraje de latón) y dos
ideas para garras. **Aplicar uno es pegarlo en `src/brand.js`, y nada más.**

```bash
node colores/ver.js --tema flecosMaqueta
node colores/ver.js --temas
```

El servidor lo incrusta en el HTML como `:root { --brand-blue: … }` antes de
que cargue el CSS, y de ahí cuelga todo. Cambiar esa línea cambia la app
entera. **No hay una segunda lista de colores que actualizar** — si encuentras
un color escrito a mano en algún CSS, eso es un bug, no una excepción.

## Qué sigue al color y qué no

**Sí lo sigue** (todo esto es CSS, se recolorea solo):

- El fondo azul plano.
- **El marco del calendario entero** — las argollas, el papel y el cierre.
  Hasta hace poco eran PNG con el azul horneado, y por eso Barbas mostraba un
  halo azul. Ver [`public/marco.css`](../public/marco.css).
- **El herraje**: `herraje: 'laton'` cambia las argollas de plata a latón.
- **El logo**, el texto oscuro de los campos, y **las sombras** — incluida la
  del botón principal, que llevaba su propio azul marino.
- Botones, textos, la barra del navegador (`theme-color`).

Esas últimas eran fugas y se taparon en
[`public/tema.css`](../public/tema.css), que explica cada una.

**No lo sigue** (son PNG con color horneado):

- **La estrella dorada** (`star.png`, `spark.png`). El oro funciona sobre
  cualquier fondo oscuro, así que no estorba. Si un color candidato pelea con
  el dorado, es motivo para descartar el color — no para reexportar el arte.

La palomita **ya no** es un PNG: se redibujó en CSS (`tema.css`) y sigue al
acento de cada marca. Era el estorbo más gordo — en la hoja de familias salía
una palomita azul celeste sobre páginas crema, negras y ciruela.

## Las tres juntas

Para decidir el look de Flecos, Barbas y Garras **como familia** — que es como
hay que decidirlo, porque lo que importa no es si un color gusta suelto sino si
las tres se leen como hermanas:

```bash
node colores/ver-familias.js
```

Deja `colores/muestras-familias/index.html`: una fila por familia, las tres
marcas en columnas, con los dos contrastes de cada una. Las familias están en
[`familias.js`](familias.js).

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

Y hay una SEGUNDA pregunta que se olvida fácil: **el `acento` hace de texto del
botón principal, que va sobre blanco.** O sea que también tiene que ser oscuro.
Es lo que descarta los colores bonitos:

| | sobre blanco | |
|---|---|---|
| `#C9A227` oro de la maqueta | 2.42 | ilegible |
| `#8A6D1F` oro apagado | 4.90 | sirve |
| `#FF4D8D` rosa neón | 3.14 | ilegible |
| `#C2185B` rosa profundo | 5.87 | sirve |

Si algún día se quiere el oro brillante para adornos sobre fondo oscuro, hace
falta un token aparte (`acentoClaro`): son dos usos con fondos opuestos y un
solo color no puede con los dos.

`ver.js` y `ver-familias.js` calculan las dos. AA pide **4.5**, pero el cuerpo
de la app va en **Inter 200**, que es muy delgada, así que quedarse en 4.5 se
queda corto. Apunta a 7 o más para el fondo.

### Lo que falta para un tema CLARO

Un tema oscuro (la maqueta de Barbas, las ideas de garras) ya sale entero solo
con datos. Un tema **claro** como el Flecos de la maqueta sale casi entero: lo
que queda es el texto a media tinta que vive en las hojas copiadas de Días que
Cuentan (`rgba(255,255,255,.72)` y compañía). En las hojas nuevas ya está
puesto con `rgb(var(--tinta) / …)`, respetando la opacidad de cada uno.

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
paleta.js         Colores sueltos candidatos. Solo datos; la app no los importa.
temas.js          Temas completos de UNA marca, listos para pegar en src/brand.js.
familias.js       Las TRES marcas a la vez: tres propuestas de familia.
ver.js            Compara colores sueltos.
ver-familias.js   Compara familias completas.  ← el de decidir
muestras/         Salida de ver.js.            (.gitignore)
muestras-familias/  Salida de ver-familias.js. (.gitignore)
```
