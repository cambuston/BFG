# Entrar con Google y con Apple, sin intermediario

`AUTH_MODE=propio`. Nuestro servidor habla con los proveedores directamente:
sin Supabase, sin mensualidad, y **cada marca con su propia cara**.

```bash
npm run identidad        # ¿está bien configurado?
```

---

## Por qué existe esto

Con un portero de por medio (Supabase), la pantalla de Google dice:

> **Sign in to** `radygoariugzfxsmbweo.supabase.co`

Ese es el dominio del portero, no el nuestro, y es **el mismo para las tres
marcas**. Un peluquero al que le pides tu cuenta de Google para entrar a
«Flecos» ve un nombre aleatorio que no ha visto nunca.

Ponerle dominio propio al portero es de pago **y por proyecto**: para que
Flecos, Barbas y Garras dijeran lo suyo, harían falta tres. Hablando con Google
directamente sale gratis y sale mejor:

| | Con portero | Sin portero |
|---|---|---|
| Lo que dice la pantalla | el dominio del portero | `flecos.mx` |
| Nombre y logo por marca | uno solo para las tres | el de cada una |
| Costo para que diga lo correcto | de pago, ×3 | 0 |
| Piezas en el camino del alta | 3 | 2 |

Lo que cuesta: cada proveedor hay que implementarlo. Están los dos que
importan, **Google** y **Apple**. Facebook se quitó: pedía una revisión de días
para poder usarlo con el público, y no aporta a quien ya tiene los otros dos.

Google es el 90% de los casos y no cuesta nada. Apple es obligatorio el día que
haya app de iPhone —Apple exige ofrecer «Sign in with Apple» si ofreces otros
inicios de sesión de terceros— y viene en la membresía de desarrollador que ya
se paga, así que conviene tenerlo antes de necesitarlo.

## Qué NO cambia

- **La sesión es la misma**: la cookie firmada de [`src/sesion.js`](../src/sesion.js), 90 días.
- **La base es la misma**: una persona es su `sub` del proveedor, como siempre.
- **Las pantallas son las mismas.** El alta se ve igual; lo único que cambia es
  quién confirma la identidad.
- **Los otros modos siguen ahí.** `AUTH_MODE=demo` para probar sin nada, y
  `AUTH_MODE=supabase` sigue funcionando (ver [`supabase/`](../supabase)).

---

## Cómo se configura Google

Es una vez por marca, y son diez minutos si ya lo hiciste antes.

### 1 · Un proyecto de Google Cloud por marca

Gratis, y es **lo que hace que cada marca enseñe su nombre y su logo** — la
identidad visual de la pantalla de consentimiento va por proyecto, no por
cliente. Para arrancar puedes usar uno solo para las tres (ver más abajo).

En [console.cloud.google.com](https://console.cloud.google.com), con el
proyecto de la marca seleccionado, busca **Google Auth Platform**:

1. **Get started**: nombre de la app (`Flecos`), tu correo de contacto.
2. **Audience**: **External**. Con *Internal* solo entran los correos de tu
   propia organización — o sea tú, y ningún peluquero. Y **Publish app**: en
   *Testing* solo entran los correos que listes a mano y las sesiones caducan
   a los siete días, así que ningún profesional puede darse de alta.
3. **Branding**: el nombre y el logo que quieres que vea la gente. El logo va
   a **120×120**, y los tres están hechos en
   [`icons/google/`](../icons/google) (`flecos-120.png`, `barbas-120.png`,
   `garras-120.png`).

Publicar no dispara revisión de Google: esta app pide `openid email profile` y
nada más, que son permisos no sensibles. Subir un logo propio sí puede dejar la
marca «en revisión» unos días, pero eso no impide entrar.

### 2 · El cliente

**Clients → Create client → Web application**. En **Authorized redirect
URIs**, la dirección de regreso de esa marca:

| Marca | En local | En producción |
|---|---|---|
| Flecos | `http://localhost:3100/auth/google/callback` | `https://flecos.mx/auth/google/callback` |
| Barbas | `http://localhost:3101/auth/google/callback` | `https://barbas.mx/auth/google/callback` |
| Garras | `http://localhost:3102/auth/google/callback` | `https://garras.mx/auth/google/callback` |

Se pueden poner las dos (local y producción) en el mismo cliente. **Tal cual,
sin barra al final**: si no coincide letra por letra, Google contesta
`redirect_uri_mismatch` y no deja entrar. Es el tropiezo más común de todos y
el comprobador lo caza.

**Y el `www.` también**, si el servidor sirve los dos nombres —hoy nginx sirve
`flecos.mx` y `www.flecos.mx` sin mandar uno al otro—. La dirección de regreso
se arma con el `Host` de cada petición, así que quien entre por `www.` vuelve a
`www.`. Son seis direcciones en producción:

```
https://flecos.mx/auth/google/callback      https://www.flecos.mx/auth/google/callback
https://barbas.mx/auth/google/callback      https://www.barbas.mx/auth/google/callback
https://garras.mx/auth/google/callback      https://www.garras.mx/auth/google/callback
```

La otra salida es que nginx mande `www` al dominio pelado; entonces bastan
tres.

Los puertos son los de `npm start`, `npm run barbas` y `npm run garras`.

### 3 · El `.env`

Copia el *Client ID* y el *Client secret* de cada marca:

```bash
AUTH_MODE=propio

GOOGLE_CLIENT_ID_FLECOS=572796717952-xxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET_FLECOS=GOCSPX-xxxx

GOOGLE_CLIENT_ID_BARBAS=...
GOOGLE_CLIENT_SECRET_BARBAS=...

GOOGLE_CLIENT_ID_GARRAS=...
GOOGLE_CLIENT_SECRET_GARRAS=...
```

**Para arrancar con un solo proyecto** —una marca, o las tres compartiendo
cara— basta un par sin apellido, que vale para todas:

```bash
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

En ese caso hay que registrar las tres direcciones de regreso en ese único
cliente. El comprobador te avisa de que estás compartiendo identidad visual.

**Al pasar de uno a tres**, quita —o comenta— el par general del `.env`. Si se
queda, un apellido mal escrito no se nota: esa marca se cae calladita al
proyecto compartido y sigue funcionando, solo que con la cara de otro. Sin él,
el comprobador dice «no tiene credenciales» y se ve al instante.

---

## Cómo se configura Apple

Necesita la **membresía de Apple Developer** (99 USD al año). Es más latoso que
Google porque Apple no da un secreto: da una llave con la que el servidor firma
uno cada vez.

> **Apple no admite `localhost`.** Ni http, ni direcciones IP, ni puertos
> raros: solo dominios de verdad por https, y hay que demostrar que son tuyos.
> Esto **no se prueba en local**; se prueba en `flecos.mx` (o con un túnel
> https). Lo que sí corre en local es la prueba de navegador, contra un Apple
> de mentiras.

### 1 · Un Services ID por marca

En [developer.apple.com](https://developer.apple.com) → **Certificates,
Identifiers & Profiles → Identifiers**:

1. Primero un **App ID** con la capacidad *Sign in with Apple* prendida. Es el
   que agrupa; no es el que va en el `.env`.
2. Luego un **Services ID** —ese sí es el `client_id`—. Ponle un identificador
   con forma de dominio al revés: `mx.flecos.entrar`.
3. Con el Services ID: *Sign in with Apple* → **Configure**:

| | Domains and Subdomains | Return URLs |
|---|---|---|
| Flecos | `flecos.mx` · `www.flecos.mx` | `https://flecos.mx/auth/apple/callback` · `https://www.flecos.mx/auth/apple/callback` |
| Barbas | `barbas.mx` · `www.barbas.mx` | `https://barbas.mx/auth/apple/callback` · `https://www.barbas.mx/auth/apple/callback` |
| Garras | `garras.mx` · `www.garras.mx` | `https://garras.mx/auth/apple/callback` · `https://www.garras.mx/auth/apple/callback` |

El dominio va **sin** `https://` y la Return URL **con**, tal cual y sin barra
al final. Es el mismo tropiezo que el `redirect_uri_mismatch` de Google. Y el
`www.` va porque nginx sirve los dos nombres: quien entre por ahí vuelve por
ahí.

El nombre y el logo que ve la gente en la pantalla de Apple salen del **App
Name** del App ID, así que **una marca por App ID** es lo que hace que cada una
enseñe lo suyo. Tres Services ID colgados de un solo App ID entran bien, pero
los tres dicen el mismo nombre — que es justo lo que se quería evitar.

**Sobre el archivo de verificación**: hoy esta pantalla **no lo pide**. Se
escriben los dominios y las Return URLs y ya; no hay *Download* ni *Verify*
(comprobado en el portal, en los tres Services ID, el 2026-08-11). Apple sí
tuvo ese paso en su día —el `apple-developer-domain-association.txt` que
había que dejar en `/.well-known/`— y lo sigue pidiendo en otros trámites
suyos, así que si algún día reaparece, el servidor ya sabe servirlo por marca:
ver [`identidad/dominios/`](dominios/). Mientras no haya archivo, esa ruta
contesta 404 y no pasa nada.

### 2 · La llave

**Keys → +**, prende *Sign in with Apple*, escoge el App ID, y descarga el
archivo `AuthKey_XXXXXXXXXX.p8`. **Se descarga UNA vez**; si se pierde, se
revoca y se hace otra.

Apuntas tres cosas: el **Key ID** (el del nombre del archivo), el **Team ID**
(arriba a la derecha en el portal) y el **Services ID** del paso anterior.

### 3 · El `.env`

```bash
APPLE_CLIENT_ID_FLECOS=mx.flecos.entrar
APPLE_CLIENT_ID_BARBAS=mx.barbas.entrar
APPLE_TEAM_ID=ABCDE12345
APPLE_KEY_ID=FGHIJ67890

# La llave, de una de estas dos formas:
APPLE_PRIVATE_KEY_FILE=/opt/flecosybarbas/AuthKey_FGHIJ67890.p8
APPLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIGT...\n-----END PRIVATE KEY-----"
```

El Team ID y el Key ID suelen ser los mismos para las tres marcas (es el mismo
equipo y la misma llave); el Services ID no. Todas admiten apellido de marca
igual que las de Google.

Si la llave va **dentro** del `.env`, sus saltos de línea se escriben como
`\n` literal: un `.env` es de una línea por variable. En producción es mejor la
variante `_FILE`, y que el `.p8` no viva en el árbol del código.

Faltando **cualquiera** de las cuatro, la marca simplemente no enseña el botón
de Apple. Google sigue funcionando solo.

---

## Comprueba

```bash
npm run identidad
```

```
Entrar con Google y con Apple, sin intermediario — comprobación

  ok    configuración: /Users/luis/code/FlecosyBarbas/.env
  ok    AUTH_MODE=propio

  ── Flecos (flecos.mx) ──
  ok    Google · credenciales propias: 572796717952-cesqorbs1g1…
  ok    Google · acepta el regreso a http://localhost:3100/auth/google/callback
  ok    Apple · credenciales propias: mx.flecos.entrar
  ok    Apple · la llave FGHIJ67890 firma (equipo ABCDE12345)
  ojo   Apple · no admite localhost ni http: esto no se prueba en local
        → en el portal va el dominio flecos.mx y la Return URL
          https://flecos.mx/auth/apple/callback
```

La primera línea dice **qué `.env` leyó**, y conviene mirarla: en el servidor
la configuración vive fuera del árbol del código
(`/opt/flecosybarbas/.env`, con la app en `/opt/flecosybarbas/app`) y este
programa la busca ahí sola —primero `<proyecto>/.env`, luego el de encima—.
Cuando no dice ninguna, todo lo demás sale en rojo por una razón tonta.

Por default comprueba **local**. Para comprobar producción, donde son **tres
dominios**:

```bash
FYB_ORIGEN=produccion npm run identidad
```

Cada marca se comprueba entonces en el suyo (`flecos.mx`, `barbas.mx`,
`garras.mx`) y de paso se le pregunta a Google por el `www.` de cada una, que
también sirve la app. Pasar una dirección concreta —`FYB_ORIGEN=https://…`—
sigue valiendo para un túnel https, pero se usa **para las tres marcas**: no
sirve para revisar el servidor.

**A Google se le pregunta; a Apple no**, y conviene saber por qué. A la
pantalla de entrada de Apple se le puede pedir con un Services ID inventado y
contesta un 200 tan contento; a su endpoint de token, con un equipo y una llave
inventados, contesta `invalid_grant` —mira el `code` antes que al cliente—. O
sea que preguntarle daría un **ok falso**, que es peor que no comprobar. De
Google sí se saca el motivo exacto, y por eso ahí sí se pregunta.

De Apple se comprueba entonces lo que sí se puede saber con certeza, que
además es donde está el error caro: que estén las cuatro piezas y que **la
llave de verdad firme**. Una `.p8` pegada a medias o sin sus saltos de línea da
un `invalid_client` que no menciona la llave por ningún lado. Que la Return URL
esté bien registrada solo se ve entrando de verdad.

Luego `npm start` y a entrar. Un botón cuya marca no tenga credenciales **no
se pinta**: mejor eso que uno que falla al tocarlo.

---

## Cómo funciona por dentro

Tres archivos, y ninguno sabe del otro más de lo necesario:

```
src/oauth.js        el trato con el proveedor: URLs, credenciales por marca,
                    el client_secret firmado de Apple, y cambiar el `code`
                    por una identidad
src/auth.routes.js  el viaje: /auth/<proveedor> y su callback
src/alta.js         quedarse el identificador  ← lo comparte con el POST del
                    modo demo/supabase, para que la decisión sea UNA
```

El camino completo:

1. La persona escribe su dirección y toca *Continuar con Google*.
2. El navegador va a **nuestro** `/auth/google?handle=juan`.
3. El servidor guarda `juan` y un `state` aleatorio en una **cookie firmada de
   diez minutos**, y manda a Google.
4. Google devuelve a `/auth/google/callback?code=…&state=…`.
5. El servidor compara el `state` con el de la cookie —esto es lo que impide
   que alguien cuele una vuelta ajena—, cambia el `code` por un `id_token`
   **servidor contra servidor**, y de ahí saca quién es.
6. Aparta el identificador, abre la sesión, y devuelve al alta con el
   resultado.

Dos detalles que no son evidentes:

- **El identificador no puede viajar en la URL de regreso**: esa la fija el
  proveedor y no admite adornos. Por eso va en la cookie.
- **El `id_token` no se verifica con la firma, y está bien.** No viene del
  navegador —ese sería el caso peligroso— sino de una petición HTTPS que hace
  nuestro servidor al endpoint del proveedor. Es lo que dice la documentación
  de Google para el flujo de servidor, y vale igual para Apple.

### Lo que Apple hace distinto

Son tres cosas, y las tres muerden:

1. **El `client_secret` se firma.** Es un JWT `ES256` con la llave `.p8`: el
   equipo como emisor, el Services ID como sujeto, `appleid.apple.com` como
   destinatario, y caducidad. Se arma en cada viaje porque cuesta menos que
   guardarlo. El detalle que cuesta una tarde: Node firma en **DER** por
   default y JOSE pide **`ieee-p1363`**; con el formato equivocado Apple
   contesta `invalid_client` y no dice por qué.
2. **La vuelta es un POST**, no un GET, en cuanto se le pide el nombre o el
   correo (`response_mode=form_post`). Por eso hay
   `POST /auth/apple/callback`, y por eso **la cookie del viaje es
   `SameSite=None`**: a una `lax` el navegador no la manda en un POST venido
   de otro sitio, y el identificador se perdería siempre.
3. **El nombre llega una sola vez en la vida.** No va en el `id_token` sino en
   un campo `user` del formulario, y solo la primera vez que esa persona
   autoriza la app. Si se ignora, no hay forma de volver a pedirlo. El correo
   suele ser uno de relevo (`…@privaterelay.appleid.com`) si la persona escoge
   esconder el suyo: sirve igual, porque a quien identificamos es al `sub`.

### Qué se prueba, y contra qué

En [`test/navegador.test.js`](../test/navegador.test.js) hay un **Google de
mentiras** y un **Apple de mentiras** que hablan el protocolo real. El de
Google recibe el `authorize`, devuelve un `code` y lo cambia por un `id_token`.
El de Apple contesta con la página que se auto-envía por POST, y **comprueba la
firma del `client_secret`** con la llave pública, igual que el de verdad: si
firmáramos mal, la prueba se cae. Vive en `127.0.0.1` y la app en `localhost`
a propósito —para el navegador son dos sitios distintos, así que el POST de
vuelta es de verdad entre sitios y la cookie `SameSite` importa.

Los servidores los apuntan `OAUTH_GOOGLE_URL` y `OAUTH_APPLE_URL`, así que el
camino que se recorre es el mismo que corre en producción. Se cubren los dos
viajes completos, la cancelación en los dos, la vuelta con `state` ajeno y los
botones sin credenciales.

Lo de puertas adentro (credenciales por marca, la URL de salida, el JWT de
Apple, el `id_token`) está en [`test/oauth.test.js`](../test/oauth.test.js).

## Antes de producción

- **`FYB_SECRET`** en el `.env`: firma las sesiones **y la cookie del viaje**.
  `openssl rand -hex 32`.
- **`NODE_ENV=production`**: pone las dos cookies en `secure` (solo HTTPS). La
  del viaje de Apple ya va `secure` siempre, porque tiene que ser `SameSite=None`.
- **Detrás de un proxy** (nginx, Cloudflare), que reenvíe `X-Forwarded-Proto`.
  Sin eso armaríamos una dirección de regreso `http://` y los dos la
  rechazarían.
- **Publica la app** en Google (*Audience → Publish app*). En *Testing* solo
  entran los correos que listes a mano.
- **HTTPS de verdad para Apple**, que no acepta otra cosa, y el dominio
  verificado en su portal.
- **Guarda el `.p8` fuera del árbol del código** y usa `APPLE_PRIVATE_KEY_FILE`.
  Con esa llave cualquiera puede hacerse pasar por la app ante Apple.
- **El `.env` también vive fuera**, encima de la carpeta de la app
  (`/opt/flecosybarbas/.env` con la app en `/opt/flecosybarbas/app`), para que
  un despliegue nuevo no se lleve por delante el secreto ni las credenciales.
  El servidor lo busca ahí solo; `FYB_ENV_PATH` sigue sirviendo para ponerlo en
  cualquier otro sitio.
- **Comprueba en el servidor** con `FYB_ORIGEN=produccion npm run identidad`,
  que mira cada marca en su dominio.
