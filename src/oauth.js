// Entrar con Google y con Apple, SIN intermediario.
//
// Por qué existe esto habiendo Supabase: con Supabase, la pantalla de Google
// dice «Sign in to radygoariugzfxsmbweo.supabase.co» —el dominio del portero,
// no el nuestro— y esa cara es la MISMA para las tres marcas. Ponerle dominio
// propio a Supabase es de pago y por proyecto, o sea ×3. Hablando con Google
// directamente, cada marca enseña SU dominio y puede tener su nombre y su
// logo, gratis. Y de paso nos quita una pieza del camino crítico del alta.
//
// Aquí solo vive el trato con el proveedor. Quién es esa persona en NUESTRA
// base, la sesión y el identificador son de src/auth.routes.js.
//
// El flujo es el estándar de toda la vida (authorization code):
//
//   1. Mandamos a la persona al proveedor con un `state` nuestro.
//   2. El proveedor la devuelve a /auth/<proveedor>/callback con un `code`.
//   3. Cambiamos ese code por un id_token, servidor contra servidor.
//
// El `client_secret` NUNCA sale de aquí. El navegador solo ve el client_id,
// que es público por diseño.
//
// LAS DOS DIFERENCIAS DE APPLE, que son la razón de que este archivo tenga
// forma de tabla y no de un solo camino:
//
//   · Su `client_secret` no es una cadena que te dan: es un JWT que firmamos
//     nosotros con una llave .p8, y caduca. Se arma en cada viaje.
//   · Devuelve por POST (`response_mode=form_post`), no por GET, en cuanto le
//     pides el nombre o el correo. Eso cambia la ruta de regreso y la cookie
//     del viaje; lo de la cookie está explicado en src/auth.routes.js.

const crypto = require('node:crypto');
const fs = require('node:fs');

// Una variable con apellido de marca le gana a la general:
// GOOGLE_CLIENT_ID_FLECOS antes que GOOGLE_CLIENT_ID.
const porMarca = (nombre, B) =>
  String(process.env[`${nombre}_${B}`] || process.env[nombre] || '').trim();

// --- Google ----------------------------------------------------------------

function credencialesGoogle(B) {
  const id = porMarca('GOOGLE_CLIENT_ID', B);
  const secreto = porMarca('GOOGLE_CLIENT_SECRET', B);
  if (!id || !secreto) return null;
  return { id, secreto };
}

// --- Apple -----------------------------------------------------------------
//
// Apple no da un secreto: da una llave privada (.p8) y con ella se FIRMA uno.
// Hacen falta cuatro cosas, y las cuatro salen del portal de desarrollador:
//
//   APPLE_CLIENT_ID    el Services ID   (mx.flecos.entrar)
//   APPLE_TEAM_ID      el del equipo    (10 caracteres)
//   APPLE_KEY_ID       el de la llave   (10 caracteres)
//   APPLE_PRIVATE_KEY  el contenido del .p8   —o APPLE_PRIVATE_KEY_FILE, la ruta
//
// Un .p8 tiene saltos de línea y un .env es de una línea por variable, así que
// se admite escribir «\n» literal. Para no pegar la llave en el .env está la
// variante _FILE, que además es lo sensato en producción.
function llaveDeApple(B) {
  const archivo = porMarca('APPLE_PRIVATE_KEY_FILE', B);
  if (archivo) {
    try {
      return fs.readFileSync(archivo, 'utf8').trim();
    } catch (e) {
      return '';                         // ruta mal escrita: es como no tenerla
    }
  }
  return porMarca('APPLE_PRIVATE_KEY', B).replace(/\\n/g, '\n').trim();
}

function credencialesApple(B) {
  const id = porMarca('APPLE_CLIENT_ID', B);
  const equipo = porMarca('APPLE_TEAM_ID', B);
  const llaveId = porMarca('APPLE_KEY_ID', B);
  const llave = llaveDeApple(B);
  if (!id || !equipo || !llaveId || !llave) return null;

  // Una llave que no se puede leer es una llave que no hay. Se comprueba aquí
  // —y no al usarla— porque de esto depende si el botón de Apple se pinta, y
  // la regla de la casa es que un botón que se ve, funciona.
  try {
    crypto.createPrivateKey(llave);
  } catch (e) {
    return null;
  }

  return { id, equipo, llaveId, llave };
}

const enBase64url = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

// El client_secret de Apple: un JWT firmado con ES256 (curva P-256).
//
// Apple lo acepta hasta seis meses, pero guardarlo no aporta nada: firmarlo
// cuesta menos de un milisegundo y uno de diez minutos no sirve de nada si se
// filtra. La llave es lo único que hay que cuidar.
//
// `dsaEncoding: 'ieee-p1363'` no es un adorno: sin eso Node firma en DER, que
// es el formato de OpenSSL y NO el que pide JOSE. Apple contestaría
// `invalid_client` sin decir por qué.
function secretoDeApple(cred) {
  const ahora = Math.floor(Date.now() / 1000);
  const cabecera = enBase64url({ alg: 'ES256', kid: cred.llaveId });
  const cuerpo = enBase64url({
    iss: cred.equipo,
    iat: ahora,
    exp: ahora + 10 * 60,
    aud: 'https://appleid.apple.com',
    sub: cred.id,                        // el Services ID, no el App ID
  });

  try {
    const firma = crypto
      .sign('SHA256', Buffer.from(`${cabecera}.${cuerpo}`),
        { key: cred.llave, dsaEncoding: 'ieee-p1363' })
      .toString('base64url');
    return `${cabecera}.${cuerpo}.${firma}`;
  } catch (e) {
    return null;                         // la llave no es una llave
  }
}

// ---------------------------------------------------------------------------

const PROVEEDORES = {
  google: {
    id: 'google',
    nombre: 'Google',
    autorizar: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
    // `openid` es lo que hace que devuelva id_token; los otros dos son el
    // correo y el nombre. Nada más: pedir de más es lo que dispara la
    // verificación de Google y la pantalla de «app no verificada».
    scope: 'openid email profile',
    // Sin esto, quien ya tiene sesión en Google entra sin poder escoger con
    // cuál cuenta. Con varias cuentas abiertas (lo normal), es un problema.
    extra: { prompt: 'select_account' },
    respuesta: 'query',
    credenciales: credencialesGoogle,
    secretoDeCliente: (cred) => cred.secreto,
  },

  apple: {
    id: 'apple',
    nombre: 'Apple',
    autorizar: 'https://appleid.apple.com/auth/authorize',
    token: 'https://appleid.apple.com/auth/token',
    // El nombre solo llega si se pide, y solo la PRIMERA vez que esta persona
    // autoriza la app. Pedirlo cuesta que la vuelta sea por POST; no pedirlo
    // cuesta no saber nunca cómo se llama el peluquero.
    scope: 'name email',
    extra: { response_mode: 'form_post' },
    respuesta: 'form_post',
    credenciales: credencialesApple,
    secretoDeCliente: secretoDeApple,
  },
};

// Los de verdad se pueden pisar por entorno. Es SOLO para las pruebas: así el
// Google (o el Apple) de mentiras vive en localhost y el camino que se prueba
// es el mismo que corre en producción, sin hablar con nadie.
function endpoints(prov) {
  const base = process.env[`OAUTH_${prov.id.toUpperCase()}_URL`];
  if (!base) return { autorizar: prov.autorizar, token: prov.token };
  const limpia = base.replace(/\/+$/, '');
  return { autorizar: `${limpia}/authorize`, token: `${limpia}/token` };
}

// Las credenciales son POR MARCA, que es la razón de ser de todo esto: Flecos,
// Barbas y Garras son tres productos y cada uno enseña su nombre y su logo en
// la pantalla del proveedor.
//
//   GOOGLE_CLIENT_ID_FLECOS / GOOGLE_CLIENT_SECRET_FLECOS
//   APPLE_CLIENT_ID_BARBAS  / ...
//
// Y si solo hay un juego sin marca (GOOGLE_CLIENT_ID), vale para todas: es el
// arranque más simple, con un proyecto y las tres direcciones de regreso.
function credenciales(proveedorId, brandId) {
  const prov = PROVEEDORES[String(proveedorId).toLowerCase()];
  if (!prov) return null;
  return prov.credenciales(String(brandId).toUpperCase());
}

// Qué proveedores puede ofrecer ESTA marca. Un botón sin credenciales es un
// botón que falla al tocarlo, así que la portada solo enseña los que hay.
function disponibles(brandId) {
  return Object.keys(PROVEEDORES).filter((p) => credenciales(p, brandId));
}

// ¿Este proveedor devuelve por POST? Lo pregunta src/auth.routes.js para saber
// cómo tiene que ser la cookie del viaje.
const vuelvePorFormulario = (proveedorId) => {
  const prov = PROVEEDORES[String(proveedorId).toLowerCase()];
  return !!prov && prov.respuesta === 'form_post';
};

// A dónde mandamos a la persona.
function urlDeEntrada({ proveedor, brandId, redirectUri, state }) {
  const prov = PROVEEDORES[proveedor];
  const cred = prov && credenciales(proveedor, brandId);
  if (!cred) return null;

  const q = new URLSearchParams({
    client_id: cred.id,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: prov.scope,
    state,
    ...(prov.extra || {}),
  });
  return `${endpoints(prov).autorizar}?${q}`;
}

// El id_token es un JWT: cabecera.cuerpo.firma. Aquí solo se lee el cuerpo.
function cuerpoDelToken(idToken) {
  const partes = String(idToken || '').split('.');
  if (partes.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(partes[1], 'base64url').toString('utf8'));
  } catch (e) {
    return null;
  }
}

// El nombre que Apple manda en el formulario de vuelta, y SOLO la primera vez
// que esta persona autoriza la app. Si se pierde, no hay forma de volver a
// pedirlo: Apple no lo vuelve a mandar nunca.
function nombreDeApple(usuario) {
  let datos = usuario;
  if (typeof datos === 'string') {
    try { datos = JSON.parse(datos); } catch (e) { return null; }
  }
  const n = datos && datos.name;
  if (!n) return null;
  const junto = [n.firstName, n.lastName].filter(Boolean).join(' ').trim();
  return junto || null;
}

// Cambia el `code` por la identidad. Devuelve { provider, sub, email, name }
// o null. Nunca lanza: un proveedor caído no debe tumbar el alta.
//
// `usuario` es el campo `user` del formulario de Apple; en Google no existe.
//
// SOBRE NO VERIFICAR LA FIRMA DEL id_token: no hace falta, y no es un atajo.
// El token no viene del navegador —que sería el caso peligroso— sino de una
// petición HTTPS que hace ESTE servidor al endpoint del proveedor. Si alguien
// pudiera falsificar esa respuesta, tendría el TLS de Google roto y la firma
// tampoco nos salvaría. Es lo que dice la propia documentación de Google para
// el flujo de servidor, y vale igual para Apple.
async function identidad({ proveedor, brandId, code, redirectUri, usuario }) {
  const prov = PROVEEDORES[proveedor];
  const cred = prov && credenciales(proveedor, brandId);
  if (!cred || !code) return null;

  const secreto = prov.secretoDeCliente(cred);
  if (!secreto) return null;             // la llave de Apple no sirve

  let datos;
  try {
    const r = await fetch(endpoints(prov).token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: cred.id,
        client_secret: secreto,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    if (!r.ok) return null;
    datos = await r.json();
  } catch (e) {
    return null;                       // sin red, o el proveedor caído
  }

  const cuerpo = cuerpoDelToken(datos && datos.id_token);
  if (!cuerpo || !cuerpo.sub) return null;

  // Un correo sin verificar no identifica a nadie: cualquiera puede poner el
  // ajeno al registrarse en un proveedor descuidado. El `sub` sí es la
  // persona, así que se guarda igual; lo que se descarta es el correo.
  //
  // Apple manda `email_verified` como la CADENA "true"/"false", no como
  // booleano. Comparar contra `false` a secas dejaría pasar un "false".
  const verificado = cuerpo.email_verified;
  const correoBueno = cuerpo.email && verificado !== false && verificado !== 'false';

  // Google manda el nombre en el id_token; Apple, en el formulario.
  const nombre = cuerpo.name || nombreDeApple(usuario);

  return {
    provider: prov.id,
    sub: String(cuerpo.sub),
    email: correoBueno ? String(cuerpo.email) : null,
    name: nombre ? String(nombre).slice(0, 120) : null,
  };
}

module.exports = {
  PROVEEDORES,
  credenciales,
  disponibles,
  vuelvePorFormulario,
  urlDeEntrada,
  identidad,
  cuerpoDelToken,
  secretoDeApple,
  nombreDeApple,
};
