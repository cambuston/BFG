# Flecos y Barbas

Citas, regreso y memoria para peluqueros y barberos independientes.

**Un solo código, dos apps.** `flecos.mx` y `barbas.mx` son el mismo programa
con distinta marca. Lo único que cambia entre las dos vive en
[`src/brand.js`](src/brand.js): nombre, dominio y color. Nada más.

El look es el de **Días que Cuentan**, copiado tal cual: mismo fondo azul plano,
mismo calendario de argollas, misma tipografía (Inter 200), mismos botones,
mismos tamaños. Las hojas de estilo son literalmente las mismas
(`styles.css`, `header-split.css`, `calendar-form.css`, `calendar-colors.css`);
`handle.css` solo agrega lo que allá no existía.

## Correr

```bash
npm install
npm start          # Flecos en http://localhost:3100
npm run barbas     # Barbas en http://localhost:3101
```

Con `BRAND` vacío, la marca se decide por el dominio de cada petición
(`barbas.mx` → Barbas), así que un solo proceso puede servir las dos.

| Variable | Default | Para qué |
|---|---|---|
| `BRAND` | *(por Host)* | `flecos` \| `barbas` |
| `PORT` | `3100` | Puerto |
| `FYB_DB_PATH` | `./data/flecosybarbas.db` | Archivo SQLite |
| `AUTH_MODE` | `demo` | `demo` \| `supabase` |
| `SUPABASE_URL` | — | Solo con `AUTH_MODE=supabase` |
| `SUPABASE_ANON_KEY` | — | Solo con `AUTH_MODE=supabase` |

Ver [`.env.example`](.env.example).

## Qué está construido

**Solo el alta, en dos pasos.** A propósito: es lo que se pidió, y el resto se
decide después de ver esto funcionando.

### Paso 1 — Elegir la dirección

`flecos.mx/[juan]`. Mientras se teclea, se limpia en vivo (mayúsculas → minúsculas,
`José` → `jose`, espacios → guiones) y se pregunta al servidor si está libre.

Reglas, en [`src/handles.js`](src/handles.js): único, minúsculas, sin espacios,
sin acentos, letras/números/guion, 3–30 caracteres. Las rutas de la propia app
(`mi`, `registro`, `api`, `cita`…) están apartadas y nadie puede tomarlas.

### Paso 2 — Guardar la cuenta

Google, Apple o Facebook. Sin usuario ni contraseña propios.

- `AUTH_MODE=demo` (default) — los tres botones funcionan con una identidad de
  mentiras y el alta se completa de verdad. Sirve para ver el flujo completo hoy
  sin dar de alta nada en ningún lado. **Nunca en producción.**
- `AUTH_MODE=supabase` — login real. El navegador sale a Supabase y vuelve con un
  `access_token` que el servidor **verifica contra Supabase** antes de creer nada
  ([`src/auth.js`](src/auth.js)). Sin SDK ni dependencias extra.

### La carrera por el mismo identificador

El punto delicado del alta. Entre "está disponible" y el momento en que la persona
termina de autenticarse pueden pasar segundos, y otra persona puede ganársela.

Por eso el chequeo del paso 1 **no aparta nada** — es solo para pintar la palomita.
Quien manda es el `INSERT` del claim, protegido por un índice `UNIQUE(brand, handle)`
en SQLite. Si el segundo llega tarde, la base lo rechaza, el API devuelve `409` y la
pantalla regresa sola al paso 1 con el aviso. No hay forma de que dos personas
queden con la misma dirección.

Además `UNIQUE(brand, handle)` es **por marca**: `flecos.mx/juan` y `barbas.mx/juan`
son dos negocios distintos y ninguno estorba al otro.

## Probar

### A mano, en 2 minutos

```bash
npm start        # y abre http://localhost:3100
```

Con `AUTH_MODE=demo` los tres botones funcionan de verdad, así que el alta se
completa sin Supabase. Vale la pena probar estos cinco caminos:

1. Escribe `JOSÉ PÉREZ` → se corrige solo a `jose-perez`.
2. Escribe `mi` o `registro` → dice que no se puede (son rutas de la app).
3. Escribe `juan`, apártalo con Google, y visita `localhost:3100/juan`.
4. Vuelve al inicio y escribe `juan` otra vez → "Ya está ocupada".
5. Abre `localhost:3101` (`npm run barbas`) → mismo `juan`, ahora libre, en verde.

Para ver la carrera con tus propios ojos, con el servidor corriendo:

```bash
for i in 1 2 3 4 5; do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST localhost:3100/api/handle/claim \
    -H 'Content-Type: application/json' \
    -d "{\"handle\":\"peleado\",\"auth\":{\"provider\":\"google\",\"sub\":\"p$i\"}}" &
done; wait
```

Sale un `201` y cuatro `409`. Siempre.

### Automático

```bash
npm test              # todo: 48 pruebas
npm run test:rapido   # solo las 38 sin navegador (~0.2 s)
npm run test:navegador # solo las 10 de navegador (~17 s)
```

Todo con `node --test`, lo que ya trae Node: **un solo corredor, sin framework**
(igual que en Días que Cuentan). Cada archivo corre en su propio proceso y usa
una base de datos temporal que se borra sola — nunca toca `data/`.

| Archivo | Pruebas | Cubre |
|---|---|---|
| [`test/handles.test.js`](test/handles.test.js) | 18 | Reglas del identificador: acentos, mayúsculas, espacios, largo, rutas apartadas |
| [`test/brand.test.js`](test/brand.test.js) | 7 | Que cada dominio reciba su marca, y que sin Host nunca truene |
| [`test/alta.test.js`](test/alta.test.js) | 13 | El alta por HTTP: disponibilidad, 401/400/409, las dos marcas conviviendo, la carrera |
| [`test/navegador.test.js`](test/navegador.test.js) | 10 | Los dos pasos en un navegador de verdad |

#### Las de navegador

Necesitan Chromium una sola vez:

```bash
npm run test:instalar
```

Levantan por dentro cuatro cosas y las apagan solas: Flecos y Barbas en modo
demo, Flecos en modo Supabase, y **un Supabase de mentiras** que hace de
Google/Apple/Facebook en local.

A Google, Apple y Facebook **no se les habla de verdad**. El Supabase falso
recibe el `authorize`, rebota al navegador con un token inventado y luego
responde quién es ese token. Así se prueba el camino completo —incluida la
verificación que hace el servidor— sin salir de la máquina y sin cuentas reales.

Las capturas quedan en `test/screenshots/` cada vez que corren.

#### Que las pruebas sirvan de algo

Una suite en verde no prueba nada si no puede ponerse en rojo. Estas tres se
comprobaron rompiendo el código a propósito:

| Si se rompe… | Falla |
|---|---|
| Quitarle `UNIQUE` al índice de [`handles.db.js`](src/handles.db.js) | *"cinco personas peleando…"* y la del 409 |
| Quitar el regreso al paso 1 tras un 409 en [`app.js`](public/app.js) | La 9 (se la ganaron durante la autenticación) |
| Darle a Barbas el color de Flecos en [`brand.js`](src/brand.js) | La 10 (cada marca la suya) |

Ninguna es decorativa.

## API

| Método | Ruta | Qué hace |
|---|---|---|
| `GET` | `/api/config` | Marca y modo de autenticación |
| `GET` | `/api/handle/:handle` | ¿Está libre? → `{ handle, valid, available, reason }` |
| `POST` | `/api/handle/claim` | Quedarse el identificador. `201` nuevo · `409` ya lo tomaron · `401` sin cuenta |

## Qué NO está construido

Servicios, precios, horarios, la página pública del profesional, reservar cita,
la ficha del cliente, los regresos. Nada de eso existe todavía.

`flecos.mx/juan` responde con una página mínima que solo confirma que la dirección
quedó apartada — para que no se vea como un 404 roto.

## Estructura

```
server.js                 Express: config, alta, estáticos, /:handle
src/brand.js              ← LAS DOS MARCAS VIVEN AQUÍ
src/handles.js            Reglas del identificador (las usan servidor y navegador)
src/handles.db.js         SQLite + índices únicos
src/handles.routes.js     GET disponibilidad · POST claim
src/auth.js               demo | supabase
public/index.html         Los dos pasos
public/app.js             El flujo
public/handle.css         Lo único nuevo de CSS
public/styles.css         ┐
public/header-split.css   ├ copiados de Días que Cuentan, sin tocar
public/calendar-*.css     ┘
ideas.txt                 Notas originales del producto (Flecos 1.0 completo)
```

## Pendiente conocido

El arte del calendario (`top-frame.png`) trae un halo azul horneado alrededor de
las argollas. En Flecos no se nota porque el fondo es azul; en Barbas (verde) se
alcanza a ver un arco azul. Se arregla re-exportando ese PNG con el borde
transparente, o dejando a Barbas en un color de la familia azul.
