# Flecos y Barbas

Citas, regreso y memoria para peluqueros y barberos independientes.

**Un solo código, dos apps.** `flecos.mx` y `barbas.mx` son el mismo programa
con distinta marca. Lo único que cambia entre las dos vive en
[`src/brand.js`](src/brand.js): nombre, dominio y color. Nada más.

El look es el de **Días que Cuentan**, copiado tal cual: mismo fondo azul plano,
mismo calendario de argollas, misma tipografía (Inter 200), mismos botones,
mismos tamaños. Las hojas de estilo son literalmente las mismas
(`styles.css`, `header-split.css`, `calendar-form.css`, `calendar-colors.css`);
`handle.css`, `negocio.css` y `mi.css` solo agregan lo que allá no existía.

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
| `FYB_SECRET` | *(se genera y se guarda en la base)* | Firma de las sesiones |

Ver [`.env.example`](.env.example).

---

## Las tres patas

Todo el producto cuelga de tres ideas, y cada una tiene su pantalla:

| | Dónde vive | Qué hace |
|---|---|---|
| 📅 **Citas** | `/mi` → Hoy | La agenda del día, y reservar desde `flecos.mx/juan` |
| 🔁 **Regreso** | `/mi` → Regresos | Quién ya se pasó de su tiempo sin venir |
| 🧠 **Memoria** | `/mi` → Clientes | Cómo le gusta a cada quien, para que se sienta conocido |

## El mapa

```
flecos.mx
│
├── /                     Alta del profesional (2 pasos)
│
├── /juan                 Página pública de Juan
│   ├── Hacer cita        servicio → día y hora → nombre y celular
│   └── Ya soy cliente    lo reconocemos por su celular
│
└── /mi                   Área del profesional (pide sesión)
    ├── Hoy
    ├── Clientes          ← la ficha, con las notas y el historial
    ├── Regresos
    └── Mi negocio        servicios, precios, duración, horario, días cerrados
```

---

## Qué está construido

### El alta, en dos pasos

`flecos.mx/[juan]`. Mientras se teclea, se limpia en vivo (mayúsculas →
minúsculas, `José` → `jose`, espacios → guiones) y se pregunta al servidor si
está libre. Después, Google / Apple / Facebook. Sin usuario ni contraseña
propios.

Reglas del identificador, en [`src/handles.js`](src/handles.js): único,
minúsculas, sin espacios, sin acentos, letras/números/guion, 3–30 caracteres.
Las rutas de la propia app (`mi`, `registro`, `api`, `cita`…) están apartadas.

**Al terminar el alta, el negocio ya existe.** Servicios de ejemplo (Corte
$250, Barba $150, Corte + barba $350), horario de lunes a sábado y la página
pública funcionando. A nadie se le deja una pantalla en blanco con nueve cosas
por configurar antes de poder ver nada.

### La sesión

Una cookie **firmada** ([`src/sesion.js`](src/sesion.js)), sin tabla de
sesiones y sin librería: `<handleId>.<expira>.<HMAC-SHA256>`. El servidor no
guarda nada, solo comprueba la firma. Cambiar un caracter la invalida, así que
nadie puede escribir «soy el handle 7» a mano.

Es **por marca**: una sesión de Flecos no sirve en Barbas, aunque sea la misma
persona. Son dos negocios distintos.

### Reservar

El cliente no crea cuenta. Escoge servicio, día y hora, y deja nombre y
celular. Ya está.

**El celular es su identidad.** Con eso lo reconocemos cuando vuelve — «Hola,
Luis 👋 · Lo de siempre: Corte + barba» — sin pedirle nada. Da igual si lo
escribe `686 999 1122` o `(686) 999-1122`: se guardan solo los dígitos.

### La ficha del cliente

Tocar un cliente en cualquier lista abre la misma hoja: próxima cita, lo que se
hace siempre, cuánto lleva sin venir, el historial, y un campo de texto libre
para las notas.

Un solo campo, a propósito: es lo que un peluquero de verdad escribe
(«Máquina 1 lados. Tijera arriba. Más largo enfrente»). Los campos
estructurados nadie los llena.

**Las notas nunca salen de `/api/mi`.** Son la memoria privada del profesional.
[`src/publico.routes.js`](src/publico.routes.js) arma cada respuesta campo por
campo justo para que no se escape nada por un `...cliente` descuidado, y hay
una prueba que lo vigila.

---

## Las dos decisiones que explican el resto

Están arriba de todo en [`src/db.js`](src/db.js), pero valen la pena aquí:

**Las fechas son texto, en la hora del local.** `'2026-08-14'` y `'10:00'`.
Sin epoch, sin UTC, sin zonas horarias. Una peluquería está en un solo lugar:
cuando Juan dice «el viernes a las 10» son las 10 de su reloj. Guardar epoch
obligaría a saber la zona del negocio y convertir en cada pantalla, para no
ganar nada. Como texto ordenable, comparar citas es `<` y `ORDER BY`.

**El dinero son pesos enteros.** 250, no 250.00. Nadie cobra $250.50 por un
corte, y un entero no tiene errores de redondeo.

## Las dos carreras

El proyecto tiene dos sitios donde dos personas pueden pelear por lo mismo, y
se resuelven distinto **a propósito**:

**Por el identificador** — lo resuelve el índice `UNIQUE(brand, handle)` de
SQLite. El chequeo del paso 1 no aparta nada: es solo para pintar la palomita.
Quien manda es el `INSERT`. Si el segundo llega tarde, la base lo rechaza, el
API devuelve `409` y la pantalla vuelve sola al paso 1.

**Por la misma hora** — aquí un `UNIQUE` **no basta**, y es la parte que más
cuidado tiene. Una cita de 60 min a las 10:00 y otra de 30 a las 10:30 tienen
hora distinta y aun así se encanan: hay que comparar *rangos*, no valores. Por
eso `reservar()` corre dentro de `db.transaction()` — revisa los empalmes e
inserta sin que nadie se meta en medio.

Eso es hermético aquí por una razón concreta: **better-sqlite3 es síncrono y
Node tiene un solo hilo**, así que mientras corre la transacción no se ejecuta
ni una línea de otra petición. No hay ventana entre el «está libre» y el
`INSERT`.

Y del lado de quien reserva, si le ganan la hora mientras llena sus datos, no
se queda colgado: vuelve a las horas con el aviso de por qué.

---

## Probar

### A mano, en 3 minutos

```bash
npm start        # y abre http://localhost:3100
```

Con `AUTH_MODE=demo` los tres botones funcionan de verdad, así que se puede
recorrer todo sin Supabase:

1. Escribe `JOSÉ PÉREZ` → se corrige solo a `jose-perez`.
2. Escribe `mi` o `registro` → dice que no se puede (son rutas de la app).
3. Aparta `juan` con Google → **caes directo en tu agenda**, con servicios y
   horario ya puestos.
4. En otra ventana (o de incógnito) abre `localhost:3100/juan` y haz una cita.
5. Vuelve a `/mi` → ahí está. Tócala, escríbele una nota, ciérrala y vuelve a
   abrirla.
6. Desde la página pública, «Ya soy cliente» con el mismo celular → te saluda
   por tu nombre y te ofrece lo de siempre.
7. Abre `localhost:3101` (`npm run barbas`) → mismo `juan`, ahora libre.

Para ver las dos carreras con tus propios ojos, con el servidor corriendo:

```bash
# Cinco personas peleando el mismo identificador
for i in 1 2 3 4 5; do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST localhost:3100/api/handle/claim \
    -H 'Content-Type: application/json' \
    -d "{\"handle\":\"peleado\",\"auth\":{\"provider\":\"google\",\"sub\":\"p$i\"}}" &
done; wait
```

Sale un `201` y cuatro `409`. Siempre.

### Automático

```bash
npm test               # todo: 102 pruebas
npm run test:rapido    # las 84 sin navegador (~0.5 s)
npm run test:navegador # las 18 de navegador (~35 s)
```

Todo con `node --test`, lo que ya trae Node: **un solo corredor, sin
framework** (igual que en Días que Cuentan). Cada archivo corre en su propio
proceso con una base temporal que se borra sola — nunca toca `data/`.

| Archivo | Pruebas | Cubre |
|---|---|---|
| [`test/handles.test.js`](test/handles.test.js) | 18 | Reglas del identificador |
| [`test/brand.test.js`](test/brand.test.js) | 7 | Que cada dominio reciba su marca |
| [`test/agenda.test.js`](test/agenda.test.js) | 22 | Horas, fechas, empalmes y huecos libres |
| [`test/alta.test.js`](test/alta.test.js) | 13 | El alta por HTTP, y la carrera del identificador |
| [`test/citas.test.js`](test/citas.test.js) | 24 | Sesión, mi negocio, reservar, ficha, regresos, aislamiento entre negocios |
| [`test/navegador.test.js`](test/navegador.test.js) | 10 | Los dos pasos del alta en un navegador |
| [`test/flecos.navegador.test.js`](test/flecos.navegador.test.js) | 8 | El círculo completo: Juan se da de alta, Luis reserva, la cita aparece |

`agenda.test.js` es puro cálculo, sin servidor ni base: es donde se esconden
los errores de «se me empalmaron dos citas», así que es la parte más probada.

#### Las de navegador

Necesitan Chromium una sola vez:

```bash
npm run test:instalar
```

Levantan por dentro lo que haga falta y lo apagan solas: Flecos y Barbas en
modo demo, Flecos en modo Supabase, y **un Supabase de mentiras** que hace de
Google/Apple/Facebook en local. A los tres proveedores no se les habla de
verdad: el falso recibe el `authorize`, rebota al navegador con un token
inventado y luego responde quién es ese token. Así se prueba el camino
completo —incluida la verificación del servidor— sin salir de la máquina.

Las capturas quedan en `test/screenshots/` cada vez que corren.

#### Que las pruebas sirvan de algo

Una suite en verde no prueba nada si no puede ponerse en rojo. Estas se
comprobaron **rompiendo el código a propósito** y verificando que fallaran:

| Si se rompe… | Falla |
|---|---|
| Quitarle `UNIQUE` al índice de [`db.js`](src/db.js) | *«cinco personas peleando…»* y la del 409 |
| Quitar el regreso al paso 1 tras un 409 en [`app.js`](public/app.js) | La 9 del alta |
| Darle a Barbas el color de Flecos en [`brand.js`](src/brand.js) | La 10 del alta |
| **Quitar la revisión de empalmes en [`citas.js`](src/citas.js)** | *«cinco clientes peleando la misma hora»* y *«una cita larga bloquea la hora de en medio»* |
| **Dejar escapar las notas en [`publico.routes.js`](src/publico.routes.js)** | *«las notas del cliente NUNCA salen»* |
| **Aceptar cualquier marca en [`sesion.js`](src/sesion.js)** | *«la sesión de Flecos no vale en Barbas»* |
| **Hacer que dos citas pegadas se consideren encimadas en [`agenda.js`](src/agenda.js)** | *«dos citas pegadas… caben»* y la de la cita que tapa |

Ninguna es decorativa.

---

## API

Todo devuelve JSON.

| Método | Ruta | Qué hace |
|---|---|---|
| `GET` | `/api/config` | Marca, modo de autenticación, y si hay sesión |
| `GET` | `/api/handle/:handle` | ¿Está libre? |
| `POST` | `/api/handle/claim` | Quedárselo. `201` nuevo · `409` ya lo tomaron · `401` sin cuenta |

**Del cliente** (sin sesión):

| Método | Ruta | Qué hace |
|---|---|---|
| `GET` | `/api/p/:handle` | Portada: nombre, ciudad, servicios, horario |
| `GET` | `/api/p/:handle/dias?servicio=N` | Próximos días con hueco |
| `GET` | `/api/p/:handle/soy?telefono=N` | ¿Nos conocemos? |
| `POST` | `/api/p/:handle/cita` | Reservar. `409` si le ganaron la hora |

**Del profesional** (cookie obligatoria, `401` sin ella):

| Método | Ruta | Qué hace |
|---|---|---|
| `GET` | `/api/mi/yo` | Quién soy |
| `GET` | `/api/mi/agenda?fecha=` | La agenda de un día |
| `POST` | `/api/mi/agenda` | Apuntar una cita a mano |
| `GET` | `/api/mi/huecos?fecha=&servicio=` | Horas libres |
| `GET` | `/api/mi/clientes?q=` | Buscar |
| `GET` | `/api/mi/cliente/:id` | La ficha completa |
| `PUT` | `/api/mi/cliente/:id/notas` | La memoria |
| `GET` | `/api/mi/regresos` | A quién le toca volver |
| `GET/PUT` | `/api/mi/negocio` | Mis datos |
| `POST/PUT/DELETE` | `/api/mi/servicio/:id?` | Servicios |
| `PUT` | `/api/mi/horario` | El horario entero |
| `POST/DELETE` | `/api/mi/cerrar/:fecha?` | Días que no trabajo |

Ninguna ruta de `/api/mi` recibe un `handle_id` del navegador: sale de la
cookie firmada. Nadie puede pedir la agenda de otro cambiando un número.

## Estructura

```
server.js                 Express: rutas, estáticos, y las tres páginas
src/brand.js              ← LAS DOS MARCAS VIVEN AQUÍ
src/db.js                 ← TODO EL ESQUEMA, y el porqué de las fechas
src/handles.js            Reglas del identificador (servidor y navegador)
src/sesion.js             Cookie firmada, sin tabla ni librería
src/agenda.js             Fechas, horas, empalmes, huecos  ← funciones puras
src/negocio.js            Servicios, horario, días cerrados
src/citas.js              Clientes, reservar, regresos
src/auth.js               demo | supabase
src/*.routes.js           handles · mi · publico
public/index.html + app.js       El alta
public/negocio.html + negocio.js La página pública y reservar
public/mi.html + mi.js           Las cuatro pestañas
public/handle.css                ┐
public/negocio.css               ├ lo único nuevo de CSS
public/mi.css                    ┘
public/styles.css                ┐
public/header-split.css          ├ copiados de Días que Cuentan, sin tocar
public/calendar-*.css            ┘
ideas.txt                 Notas originales del producto
```

## Qué NO está construido

- **Recordatorios automáticos.** Regresos enseña a quién le toca y da el botón
  de WhatsApp, pero el mensaje lo manda Juan. No hay nada que escriba solo.
- **Foto del negocio.** Requiere subir archivos y dónde guardarlos.
- **Cancelar o mover una cita desde el lado del cliente.** El API ya sabe
  cambiar el estado; falta la pantalla.
- **Que el cliente vea sus próximas citas** más allá de «Ya soy cliente».
- **Supabase de verdad.** El código está y probado contra un Supabase falso,
  pero nadie ha configurado un proyecto real todavía.

## Pendiente conocido

El arte del calendario (`top-frame.png`) trae un halo azul horneado alrededor
de las argollas. En Flecos no se nota porque el fondo es azul; en Barbas
(verde) se alcanza a ver un arco azul. Se arregla re-exportando ese PNG con el
borde transparente, o dejando a Barbas en un color de la familia azul.
