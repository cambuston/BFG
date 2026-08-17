# Flecos y Barbas

Citas, regreso y memoria para peluqueros y barberos independientes.

**Un solo código, tres apps.** `flecos.mx` (peluquería), `barbas.mx`
(barbería) y `garras.mx` (uñas) son el mismo programa con distinta marca. Lo único que cambia entre las dos vive en
[`src/brand.js`](src/brand.js): nombre, dominio y **tema**. Nada más.

Una marca es un `color`, y opcionalmente un `tema` de once piezas (fondo,
papel, superficie, tinta, acento, logo, sombras, herraje…). Lo que el tema no
diga se deduce del color. Cambiar el look entero —incluido pasar a un fondo
crema con argollas de latón— es rellenar ese objeto: no se toca ni una hoja de
estilo. Hay temas listos en [`colores/temas.js`](colores/temas.js).

El look es el de **Días que Cuentan**, copiado tal cual: mismo fondo azul plano,
mismo calendario de argollas, misma tipografía (Inter 200), mismos botones,
mismos tamaños. Las hojas de estilo son literalmente las mismas
(`styles.css`, `header-split.css`, `calendar-form.css`, `calendar-colors.css`);
`handle.css`, `negocio.css`, `mi.css` y `marco.css` solo agregan lo que allá no
existía.

**Cada marca tiene su dibujo**: un fleco, una barba, unas uñas pintadas. No es una
imagen pegada — el PNG se usa de **máscara** sobre `--acento`, así que el logo
sigue al tema como todo lo demás. El arte y de dónde sale cada archivo, en
[`icons/README.md`](icons/README.md).

**El marco del calendario es CSS, no imágenes.** Las argollas, el papel y el
cierre de abajo se dibujan con `border-radius` y degradados en
[`marco.css`](public/marco.css) — antes eran PNG. Ver
[El marco, sin imágenes](#el-marco-sin-imágenes).

## Correr

```bash
npm install
npm start          # Flecos en http://localhost:3100
npm run barbas     # Barbas en http://localhost:3101
npm run garras     # Garras en http://localhost:3102
```

Con `BRAND` vacío, la marca se decide por el dominio de cada petición
(`barbas.mx` → Barbas), así que un solo proceso puede servir las dos.

| Variable | Default | Para qué |
|---|---|---|
| `BRAND` | *(por Host)* | `flecos` \| `barbas` \| `garras` |
| `PORT` | `3100` | Puerto |
| `FYB_DB_PATH` | `./data/flecosybarbas.db` | Archivo SQLite |
| `AUTH_MODE` | `demo` | `demo` \| `propio` \| `supabase` |
| `GOOGLE_CLIENT_ID[_MARCA]` | — | Solo con `AUTH_MODE=propio` |
| `GOOGLE_CLIENT_SECRET[_MARCA]` | — | Solo con `AUTH_MODE=propio` |
| `SUPABASE_URL` | — | Solo con `AUTH_MODE=supabase` |
| `SUPABASE_ANON_KEY` | — | Solo con `AUTH_MODE=supabase` |
| `FYB_SECRET` | *(se genera y se guarda en la base)* | Firma de las sesiones y del viaje |

**Todo eso puede ir en un `.env`**, que el servidor lee solo al arrancar
([`src/env.js`](src/env.js), sin dependencias). Lo que ya venga en el entorno
gana: `BRAND=barbas npm start` manda sobre el archivo. Copia
[`.env.example`](.env.example) y ajústalo:

```bash
cp .env.example .env
```

Se busca **en este directorio y, si no está, en el de encima**. Lo segundo es
para el servidor, donde la configuración vive fuera del árbol del código
(`/opt/flecosybarbas/.env`, con la app en `/opt/flecosybarbas/app`) y así un
despliegue nuevo no se lleva por delante el secreto ni las credenciales. Con
`FYB_ENV_PATH` se pone donde sea. Los dos comprobadores dicen en su primera
línea **qué archivo leyeron**.

Para el login real hay dos caminos, cada uno con su guía y su comprobador:

| | Guía | Comprobar |
|---|---|---|
| **Google y Apple directo**, sin intermediario. Cada marca enseña su dominio, su nombre y su logo. | [`identidad/`](identidad/README.md) | `npm run identidad` |
| **Supabase** de portero. Un trámite menos, pero la pantalla del proveedor enseña el dominio de Supabase, igual para las tres marcas. | [`supabase/`](supabase/README.md) | `npm run supabase` |

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
├── /                     Alta del profesional (4 pasos)
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

### El alta, en cuatro pasos

| | | |
|---|---|---|
| **1** | Tu dirección | `flecos.mx/[juan]` |
| **2** | Tu cuenta | Google o Apple |
| **3** | Tu horario | qué días, y de qué hora a qué hora |
| **4** | Tus servicios | nombre, precio y cuánto tarda |
| | **Listo** | y el botón que entra a tu agenda |

En el paso 1, mientras se teclea, se limpia en vivo (mayúsculas → minúsculas,
`José` → `jose`, espacios → guiones) y se pregunta al servidor si está libre.
Después, Google o Apple. Sin usuario ni contraseña propios.

Reglas del identificador, en [`src/handles.js`](src/handles.js): único,
minúsculas, sin espacios, sin acentos, letras/números/guion, 3–30 caracteres.
Las rutas de la propia app (`mi`, `registro`, `api`, `cita`…) están apartadas.

**Los pasos 3 y 4 no llenan una pantalla en blanco: corrigen una llena.** El
alta ya dejó el negocio estrenado con horario y servicios de ejemplo (ver
abajo), así que lo que se enseña es eso ya puesto y lo único que se hace es
cambiar lo que no cuadre. Por eso los dos llevan **«Luego lo ajusto»** y
saltárselos no rompe nada: la página pública funciona igual.

Del paso 2 en adelante ya hay sesión, así que estos dos pasos hablan por
`/api/mi` —las mismas rutas que *Mi negocio*—. No hay API nueva.

**El horario del alta es de brocha gorda a propósito**: siete fichas de día y
UNA franja para todas. La versión día por día no cabe —en un teléfono de 390 px
la tarjeta deja unos 250 de ancho y un solo `input[type=time]` pide 137— y
tampoco hace falta el primer día. Quien abra distinto los sábados lo tiene
esperándolo en *Mi negocio*, que sí tiene sitio, y la pantalla se lo dice.

A quien **ya tenía dirección** no se le pregunta nada de esto: volver a darle a
«Continuar con Google» es, de hecho, iniciar sesión, y cae directo en la
pantalla final. Preguntarle otra vez sería pedirle que confirme lo que ya
cambió.

Y el alta **termina dentro de la app**, no en una pantalla muerta: el último
paso tiene la liga para compartir y el botón que entra a la agenda.

### Cómo entra la gente

Tres modos, y cambiar de uno a otro es una línea del `.env`. Ninguno toca el
HTML ni las rutas, y los tres terminan en la misma cookie firmada.

| `AUTH_MODE` | Qué hace | Para qué |
|---|---|---|
| `demo` | identidad de mentiras; los dos botones completan el alta de verdad | probar el flujo completo sin dar de alta nada |
| `propio` | hablamos con Google y con Apple directamente ([`identidad/`](identidad/README.md)) | producción: cada marca con su dominio, su nombre y su logo |
| `supabase` | Supabase de portero ([`supabase/`](supabase/README.md)) | los dos con un trámite menos, y una cara prestada |

En modo `propio` el viaje **vuelve al servidor**, no al navegador: el
identificador que la persona escribió sobrevive en una cookie firmada de diez
minutos junto con un `state` que es lo que impide que alguien cuele una vuelta
ajena. El `code` se cambia por la identidad servidor contra servidor, así que
el `client_secret` no sale de la máquina. Está en
[`src/oauth.js`](src/oauth.js) y [`src/auth.routes.js`](src/auth.routes.js).

**Apple hace dos cosas distintas**, y las dos se notan en el código: su
`client_secret` no es una cadena que te den sino un JWT que firmamos con una
llave `.p8` en cada viaje, y la vuelta es un **POST** desde su dominio en vez
de un GET. Eso último obliga a que la cookie del viaje sea `SameSite=None`;
con `lax` el navegador no la manda y el identificador se pierde siempre.

La decisión de quedarse el identificador es **una sola**
([`src/alta.js`](src/alta.js)), aunque se llegue a ella por dos caminos: el
POST del alta o la vuelta de Google.

**Al guardar la cuenta, el negocio ya existe.** Servicios de ejemplo (Corte
$250, Barba $150, Corte + barba $350), horario de lunes a sábado y la página
pública funcionando. A nadie se le deja una pantalla en blanco con nueve cosas
por configurar antes de poder ver nada — y es lo que hace que los pasos 3 y 4
sean opcionales: ya hay algo puesto que corregir.

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

Con `AUTH_MODE=demo` los dos botones funcionan de verdad, así que se puede
recorrer todo sin Supabase:

1. Escribe `JOSÉ PÉREZ` → se corrige solo a `jose-perez`.
2. Escribe `mi` o `registro` → dice que no se puede (son rutas de la app).
3. Aparta `juan` con Google → te pregunta el horario y los servicios, **ya
   llenos**. Cierra los domingos, súbele el precio al corte, y dale a
   «Entrar a mi agenda». (O dale a «Luego lo ajusto» dos veces: también sale.)
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
npm test               # todo: 150 pruebas
npm run test:rapido    # las 93 sin navegador (~0.5 s)
npm run test:navegador # las 27 de navegador (~35 s)
```

Todo con `node --test`, lo que ya trae Node: **un solo corredor, sin
framework** (igual que en Días que Cuentan). Cada archivo corre en su propio
proceso con una base temporal que se borra sola — nunca toca `data/`.

| Archivo | Pruebas | Cubre |
|---|---|---|
| [`test/handles.test.js`](test/handles.test.js) | 17 | Reglas del identificador |
| [`test/brand.test.js`](test/brand.test.js) | 13 | Que cada dominio reciba su marca |
| [`test/agenda.test.js`](test/agenda.test.js) | 22 | Horas, fechas, empalmes y huecos libres |
| [`test/alta.test.js`](test/alta.test.js) | 17 | El alta por HTTP, la carrera del identificador y el archivo de Apple |
| [`test/citas.test.js`](test/citas.test.js) | 24 | Sesión, mi negocio, reservar, ficha, regresos, aislamiento entre negocios |
| [`test/env.test.js`](test/env.test.js) | 12 | El lector del `.env`, y dónde lo busca |
| [`test/oauth.test.js`](test/oauth.test.js) | 18 | Entrar con Google y con Apple: credenciales por marca, URL de salida y el JWT de Apple |
| [`test/navegador.test.js`](test/navegador.test.js) | 19 | El alta entera en un navegador, en los tres modos |
| [`test/flecos.navegador.test.js`](test/flecos.navegador.test.js) | 8 | El círculo completo: Juan se da de alta, Luis reserva, la cita aparece |

`agenda.test.js` es puro cálculo, sin servidor ni base: es donde se esconden
los errores de «se me empalmaron dos citas», así que es la parte más probada.

#### Las de navegador

Necesitan Chromium una sola vez:

```bash
npm run test:instalar
```

Levantan por dentro lo que haga falta y lo apagan solas: Flecos y Barbas en
modo demo, Flecos en modo Supabase, y Flecos sin intermediario contra **un
Supabase, un Google y un Apple de mentiras**. A los proveedores no se les habla
de verdad: los falsos hablan el protocolo real —el de Google devuelve un `code`
y lo cambia por un `id_token`; el de Apple vuelve por POST y **comprueba la
firma** del `client_secret` con la llave pública, como el de verdad—. Así se
prueba el camino completo, incluida la verificación del servidor, sin salir de
la máquina.

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
| **Dejar que el `.env` pise al entorno en [`env.js`](src/env.js)** | *«lo que ya está en el entorno gana»* |
| **Buscar el `.env` solo dentro del proyecto en [`env.js`](src/env.js)** | *«si no hay .env dentro del proyecto, lo busca encima»* |
| **Dejar de servir el archivo de Apple en [`server.js`](server.js)** | *«el archivo de Apple se sirve, y es el de la marca que pregunta»* |
| **Volver a buscar la cuenta por (proveedor, sub) en [`handles.routes.js`](src/handles.routes.js)** | *«la misma persona entrando con otro botón»* |
| **Quitar el mensaje de la vuelta sin token en [`app.js`](public/app.js)** | La 11 del navegador |
| **Pedir `.member-row` sin decir de qué pestaña** | La 5 de Flecos… **los días que la cita cae hoy** |
| **Aceptar cualquier `state` en [`auth.routes.js`](src/auth.routes.js)** | La 14 del navegador (la vuelta colada) |
| **Perder el identificador de la cookie del viaje** | La 12 del navegador |
| **Enseñar botones de proveedores sin credenciales** | La 15 del navegador |
| **Que las credenciales de la marca dejen de ganarle a las generales** | Dos de `oauth.test.js` |
| **Firmar el secreto de Apple en DER en vez del formato de JOSE (`ieee-p1363`) en [`oauth.js`](src/oauth.js)** | La 16 del navegador y *«el client_secret de Apple es un JWT que Apple puede verificar»* |
| **Dejar la cookie del viaje en `lax` cuando el proveedor vuelve por POST en [`auth.routes.js`](src/auth.routes.js)** | La 16 del navegador |
| **Servir el mismo favicon (o el mismo dibujo de logo) a las tres marcas** | La 10 del navegador |
| **Saltarse el horario y los servicios al terminar la cuenta en [`app.js`](public/app.js)** | Seis del navegador, la 18 y la 19 entre ellas |
| **Guardar el horario con horas que no son las que se escogieron** | La 18 del navegador |
| **Dejar de mandar los servicios que se editaron** | La 18 del navegador |
| **Quitar el botón que entra a la agenda: el alta vuelve a ser callejón** | La 18 del navegador |
| **Volver a preguntarle horario y servicios a quien ya tenía dirección** | La 19 del navegador |

Ninguna es decorativa.

---

## API

Todo devuelve JSON.

| Método | Ruta | Qué hace |
|---|---|---|
| `GET` | `/api/config` | Marca, modo de autenticación, y si hay sesión |
| `GET` | `/api/handle/:handle` | ¿Está libre? |
| `POST` | `/api/handle/claim` | Quedárselo. `201` nuevo · `409` ya lo tomaron · `401` sin cuenta |

Y con `AUTH_MODE=propio`, el viaje a Google. No devuelven JSON sino
redirecciones: son para el navegador, no para nadie más.

| Método | Ruta | Qué hace |
|---|---|---|
| `GET` | `/auth/:proveedor?handle=` | Guarda el viaje en una cookie firmada y manda al proveedor |
| `GET` | `/auth/:proveedor/callback` | La vuelta: comprueba el `state`, saca la identidad, aparta y abre sesión |

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
src/auth.js               demo | propio | supabase
src/oauth.js              Entrar con Google sin intermediario (por marca)
src/auth.routes.js        El viaje: /auth/google y su callback
src/alta.js               Quedarse el identificador  ← una sola decisión
src/env.js                Lee el .env al arrancar (sin dependencias)
src/*.routes.js           handles · mi · publico
public/index.html + app.js       El alta, sus cuatro pasos y la salida a /mi
public/negocio.html + negocio.js La página pública y reservar
public/mi.html + mi.js           Las cuatro pestañas
public/handle.css                ┐
public/negocio.css               │
public/mi.css                    ├ lo único nuevo de CSS
public/marco.css                 ┘ ← el marco del calendario, sin PNG
public/styles.css                ┐
public/header-split.css          ├ copiados de Días que Cuentan, sin tocar
public/calendar-*.css            ┘
public/marca/<marca>/            El dibujo, el favicon y los iconos de cada una
icons/                    El arte original y los juegos de iconos generados
identidad/README.md       Google directo, sin intermediario  ← la guía
identidad/comprueba.js    ¿Google acepta a cada marca?  (npm run identidad)
supabase/README.md        El otro camino: Supabase de portero
supabase/comprueba.js     ¿Quedó bien configurado?  (npm run supabase)
colores/                  Banco de trabajo del color (nada corre en la app)
ideas.txt                 Notas originales del producto
```

## Qué NO está construido

- **Recordatorios automáticos.** Regresos enseña a quién le toca y da el botón
  de WhatsApp, pero el mensaje lo manda Juan. No hay nada que escriba solo.
- **Foto del negocio.** Requiere subir archivos y dónde guardarlos.
- **Cancelar o mover una cita desde el lado del cliente.** El API ya sabe
  cambiar el estado; falta la pantalla.
- **Que el cliente vea sus próximas citas** más allá de «Ya soy cliente».
- **Facebook.** Se quitó a propósito: pedía una revisión de días para el
  público, y entre Google y Apple está cubierto casi todo el mundo. Quedan dos
  botones.
- **Los trámites de Apple.** El código está y probado, pero nadie ha creado el
  Services ID ni la llave `.p8` (pide la membresía de desarrollador, 99 USD al
  año, que ya se paga). Sin esas cuatro variables el botón simplemente no se
  pinta. La guía: [`identidad/`](identidad/README.md).
- **Dominios de verdad.** Todo está probado en `localhost`; falta apuntar
  `flecos.mx`, `barbas.mx` y `garras.mx` a un servidor y registrar esas
  direcciones de regreso.

## El marco, sin imágenes

Las puntas del calendario —las argollas de arriba y el cierre de abajo— eran
`top-frame.png` y `bottom-frame.png`, más dos máscaras para recolorear el azul.
El tramo de en medio ya era CSS puro; [`marco.css`](public/marco.css) termina
el trabajo.

Qué se gana:

- **145 KB menos que bajar**, y dos peticiones menos.
- **Se acabó el halo azul horneado** alrededor de las argollas. En Flecos no se
  notaba porque el fondo es azul; en Barbas (verde) se veía un arco azul, y era
  el pendiente conocido de este README. Ahora el color sale de `--brand-blue`:
  una marca nueva se ve bien sin volver a exportar arte.
- **Nítido a cualquier tamaño**, sin @2x ni @3x.

No está dibujado a ojo. Los PNG se midieron leyendo su canal alfa pixel por
pixel (canvas + `getImageData`), y `marco.css` está escrito en las coordenadas
reales del arte gracias a `--px: calc(100cqw / 1289)`, que vale exactamente un
pixel de la imagen original. Así `calc(163 * var(--px))` **es** el radio del
arte, y todo escala solo.

Comprobado midiendo los bordes de lo pintado en los dos modos: coinciden dentro
de 1 px (antialiasing). `marco.css` va al final y pisa a `calendar-colors.css`,
así que **quitar su `<link>` devuelve el look de imágenes** sin tocar nada más
— por eso los PNG viejos siguen en `public/`.

### La palomita, también en CSS

Igual que el marco: `check.png` era un disco AZUL con el color horneado, y ese
azul no cambiaba nunca. En la hoja de familias cantaba en las tres marcas.
Ahora se dibuja en CSS con el mismo método —se midió el PNG (388×388, disco
exterior de radio 180, disco de color de radio 133) y se reconstruyó con un
degradado radial, una máscara circular y un gancho de dos bordes girados.

De paso arregló un fallo viejo: la palomita **no se veía en la pantalla del
alta**, solo en la página pública. Ahora sale en las dos.
