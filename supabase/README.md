# Supabase de verdad

Cómo pasar de la cuenta de mentiras (`AUTH_MODE=demo`) al login real con
Google y Apple, **usando Supabase de portero**.

> **Hay otro camino, y para las tres marcas es mejor:**
> [`identidad/`](../identidad) — hablar con Google directamente. Con Supabase,
> la pantalla de Google dice «Sign in to `xxxx.supabase.co`» y es la **misma
> cara para Flecos, Barbas y Garras**; que diga lo suyo cada una cuesta un
> dominio propio de pago **por proyecto**, o sea ×3. Sin portero, cada marca
> enseña su dominio, su nombre y su logo, gratis.
>
> Esto de aquí sigue funcionando y sigue probado, pero ya no es más corto:
> sin portero también están los dos, Google y Apple.

El código ya está escrito y probado; lo que falta es **crear el proyecto y
pegar dos valores**. Eso pide tu cuenta y tu tarjeta en el caso de Apple, así
que esta parte la haces tú. Al final hay un comprobador que dice si quedó bien:

```bash
npm run supabase
```

---

## Lo primero: qué usamos de Supabase y qué no

**Solo el login.** Los clientes, las citas y las notas siguen en SQLite, en tu
servidor. Supabase aquí es el portero que dice «este es Juan», nada más. No
hay tablas que crear, ni RLS que configurar, ni migraciones.

Por eso el plan gratis sobra de momento. Ojo con una cosa: **Supabase duerme
los proyectos gratis que pasan una semana sin uso**, y despertar tarda unos
segundos. El comprobador lo detecta.

---

## 1 · El proyecto

1. Entra a [supabase.com](https://supabase.com) y crea un proyecto.
2. Región: la más cercana a México (`us-east-1` o `us-west-1`).
3. Guarda la contraseña de la base aunque no la vayamos a usar.

Cuando termine de crearse: **Project Settings → API**. Ahí hay dos cosas que
copiar:

| En el panel | En `.env` |
|---|---|
| Project URL | `SUPABASE_URL=https://xxxxxxxx.supabase.co` |
| Project API keys → la **pública** | `SUPABASE_ANON_KEY=sb_publishable_...` |

Hay **dos formatos de llave** rondando, y los dos sirven. El nombre de la
variable se quedó en `SUPABASE_ANON_KEY` por el viejo:

| | Pública (esta) | Secreta (esta NO) |
|---|---|---|
| Formato nuevo | `sb_publishable_…` | `sb_secret_…` |
| Formato viejo | `anon` (`eyJ…`) | `service_role` (`eyJ…`) |

> **La secreta no.** Es la de administrador, y esta llave va al navegador. La
> pública lo es por diseño. El comprobador te avisa si las confundes, en
> cualquiera de los dos formatos.

---

## 2 · Las direcciones de regreso

**Authentication → URL Configuration**:

- **Site URL**: `https://flecos.mx/`
- **Redirect URLs**, una por línea:

```
http://localhost:3100/
http://localhost:3101/
http://localhost:3102/
https://flecos.mx/
https://barbas.mx/
https://garras.mx/
```

Los tres `localhost` son los puertos de `npm run flecos`, `npm run barbas` y
`npm run garras`.

**La barra final importa.** Si falta, Supabase rechaza la vuelta y la persona
aterriza en el alta sin explicación. Es el error más común de todos y el
comprobador lo caza.

---

## 3 · Los proveedores

**Authentication → Providers**. Con **Google basta para arrancar**: es el que
tiene casi todo el mundo y el único gratis y sin trámite. Apple se puede dejar
para después.

> Mientras un proveedor esté apagado, la app **sigue enseñando su botón** y ese
> botón falla al tocarlo. Si vas a tardar en prender Apple, quítalo de
> `public/index.html` (los `.welcome-option` del paso 2).

### Google — gratis, media hora

1. [console.cloud.google.com](https://console.cloud.google.com) → crea un
   proyecto.
2. **APIs y servicios → Pantalla de consentimiento de OAuth**: tipo *Externo*,
   nombre de la app, correo de contacto. Publícala (en modo *Prueba* solo
   entran los correos que listes a mano).
3. **Credenciales → Crear credenciales → ID de cliente de OAuth → Aplicación
   web**.
4. En **URI de redireccionamiento autorizados**, pega la de Supabase —está en
   la pantalla del proveedor en Supabase, y es esta:

   ```
   https://xxxxxxxx.supabase.co/auth/v1/callback
   ```

5. Copia *Client ID* y *Client Secret* a la pantalla de Google en Supabase, y
   dale a **Save**.

### Apple — 99 USD al año

Necesita cuenta de Apple Developer de pago. Se crea un **Services ID** (no un
App ID), se le pone el mismo `/auth/v1/callback` como Return URL, y se genera
una **llave privada** que Supabase pide entera.

> Los mismos trámites sirven para el modo `propio`, y ahí el Return URL es
> `https://flecos.mx/auth/apple/callback`. Si vas a hacerlos una vez, hazlos
> para [`identidad/`](../identidad/README.md): la pantalla de Apple dirá
> entonces el nombre de la marca y no el del portero.

---

## 4 · Prende el interruptor

En `.env`:

```bash
AUTH_MODE=supabase
SUPABASE_URL=https://xxxxxxxx.supabase.co
SUPABASE_ANON_KEY=sb_publishable_...
```

Y comprueba:

```bash
npm run supabase
```

Sale algo así:

```
Supabase — comprobación

  ok    SUPABASE_URL https://xxxxxxxx.supabase.co
  ok    SUPABASE_ANON_KEY es la llave publicable (el formato nuevo)
  ok    AUTH_MODE=supabase
  ok    la URL y la llave sirven: Supabase contesta
  ok    proveedores prendidos: google
  ojo   apple apagado
        → la app enseña su botón igual, y ese botón fallará
  ok    el regreso a http://localhost:3100/ está autorizado (rebota a accounts.google.com)

  Sirve, con avisos. Arranca con: npm start
```

Lo único que el comprobador **no** puede ver es el último tramo: que el cliente
de OAuth de Google tenga bien puesta la URL de callback. Eso se ve entrando de
verdad — `npm start`, abre `http://localhost:3100/`, escribe una dirección y
dale a *Continuar con Google*.

Para volver a la cuenta de mentiras, `AUTH_MODE=demo` y ya. No hay nada más que
deshacer.

---

## Qué hace el código con todo esto

Está en [`src/auth.js`](../src/auth.js), y son treinta líneas:

1. `/api/config` le pasa al navegador la URL y la anon key.
2. El navegador se va solo a `SUPABASE_URL/auth/v1/authorize?provider=google`
   (sin SDK: es una URL) y vuelve con `#access_token=...` en el fragmento.
3. El servidor **no se cree ese token**: se lo lleva a
   `SUPABASE_URL/auth/v1/user` y le pregunta a Supabase de quién es. Solo lo
   que conteste Supabase llega a la base.
4. De ahí en adelante manda la cookie firmada de
   [`src/sesion.js`](../src/sesion.js), 90 días. El token de Supabase se usa una
   vez y se tira.

El identificador que la persona escribió sobrevive el viaje en `sessionStorage`,
y la vuelta con error (le dio a *Cancelar*, el proveedor está mal configurado)
la deja en el paso 2 con un mensaje, no en blanco.

## Antes de producción

- **`FYB_SECRET`**: sin ella, el secreto de las cookies se genera solo y se
  guarda en la base. Sirve, pero si la base se rehace, todo el mundo pierde la
  sesión. Ponla en `.env`: `openssl rand -hex 32`.
- **`NODE_ENV=production`**: es lo que pone la cookie en `secure` (solo HTTPS).
- **`.env` no va a git** (ya está en `.gitignore`). La anon key es pública,
  pero `FYB_SECRET` no.
