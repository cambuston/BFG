// Entrar con Google y con Apple sin intermediario (src/oauth.js), la parte que
// se puede probar sin levantar nada: de dónde salen las credenciales de cada
// marca, cómo se arma la URL de salida y —en Apple— cómo se firma el
// client_secret, que es lo único de todo esto que no es una cadena copiada.
//
// El viaje entero —ida, vuelta, alta y sesión— se prueba en
// navegador.test.js contra un Google y un Apple de mentiras.

const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const oauth = require('../src/oauth');

// Una llave de las de Apple: curva P-256, formato PKCS#8 — que es exactamente
// lo que hay dentro de un .p8. La pública sirve para comprobar la firma igual
// que la comprueba Apple.
const par = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const LLAVE = par.privateKey.export({ type: 'pkcs8', format: 'pem' }).trim();
const PUBLICA = par.publicKey;

// Cada prueba parte de un entorno limpio: estas variables las lee oauth.js en
// cada llamada (a propósito, para poder probarlo así).
const CLAVES = [
  'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET',
  'GOOGLE_CLIENT_ID_FLECOS', 'GOOGLE_CLIENT_SECRET_FLECOS',
  'GOOGLE_CLIENT_ID_BARBAS', 'GOOGLE_CLIENT_SECRET_BARBAS',
  'OAUTH_GOOGLE_URL',
  'APPLE_CLIENT_ID', 'APPLE_TEAM_ID', 'APPLE_KEY_ID',
  'APPLE_PRIVATE_KEY', 'APPLE_PRIVATE_KEY_FILE',
  'APPLE_CLIENT_ID_FLECOS', 'APPLE_CLIENT_ID_BARBAS',
  'OAUTH_APPLE_URL',
];

beforeEach(() => { for (const k of CLAVES) delete process.env[k]; });

// Deja a Apple listo para una marca. Devuelve nada: se mira process.env.
function apple({ llave = LLAVE, marca = '' } = {}) {
  const suf = marca ? `_${marca.toUpperCase()}` : '';
  process.env[`APPLE_CLIENT_ID${suf}`] = 'mx.flecos.entrar';
  process.env.APPLE_TEAM_ID = 'EQUIPO1234';
  process.env.APPLE_KEY_ID = 'LLAVE56789';
  process.env.APPLE_PRIVATE_KEY = llave;
}

// --- credenciales por marca ------------------------------------------------

test('sin credenciales, una marca no ofrece ningún botón', () => {
  assert.deepEqual(oauth.disponibles('flecos'), []);
  assert.equal(oauth.credenciales('google', 'flecos'), null);
});

test('un solo par sin marca vale para las tres', () => {
  process.env.GOOGLE_CLIENT_ID = 'uno';
  process.env.GOOGLE_CLIENT_SECRET = 'secreto';

  for (const marca of ['flecos', 'barbas', 'garras']) {
    assert.deepEqual(oauth.credenciales('google', marca), { id: 'uno', secreto: 'secreto' });
  }
});

// Esta es LA razón de todo el modo propio: que cada marca enseñe su nombre y
// su logo en la pantalla de Google, en vez de una cara compartida.
test('las credenciales de la marca le ganan a las generales', () => {
  process.env.GOOGLE_CLIENT_ID = 'general';
  process.env.GOOGLE_CLIENT_SECRET = 'secreto-general';
  process.env.GOOGLE_CLIENT_ID_BARBAS = 'de-barbas';
  process.env.GOOGLE_CLIENT_SECRET_BARBAS = 'secreto-de-barbas';

  assert.equal(oauth.credenciales('google', 'barbas').id, 'de-barbas');
  assert.equal(oauth.credenciales('google', 'flecos').id, 'general',
    'Flecos no tiene las suyas: usa las generales');
});

test('media credencial no es credencial', () => {
  process.env.GOOGLE_CLIENT_ID_FLECOS = 'solo-el-id';
  assert.equal(oauth.credenciales('google', 'flecos'), null,
    'sin secreto no se puede cambiar el code: mejor no enseñar el botón');
});

test('un proveedor que no conocemos no existe', () => {
  process.env.GOOGLE_CLIENT_ID = 'uno';
  process.env.GOOGLE_CLIENT_SECRET = 'secreto';
  assert.equal(oauth.urlDeEntrada({
    proveedor: 'linkedin', brandId: 'flecos', redirectUri: 'http://x/cb', state: 's',
  }), null);
});

// --- la URL de salida ------------------------------------------------------

test('la URL de salida lleva lo que Google necesita, y el state', () => {
  process.env.GOOGLE_CLIENT_ID_FLECOS = 'id-de-flecos';
  process.env.GOOGLE_CLIENT_SECRET_FLECOS = 'secreto';

  const u = new URL(oauth.urlDeEntrada({
    proveedor: 'google',
    brandId: 'flecos',
    redirectUri: 'https://flecos.mx/auth/google/callback',
    state: 'el-nonce',
  }));

  assert.equal(u.origin + u.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(u.searchParams.get('client_id'), 'id-de-flecos');
  assert.equal(u.searchParams.get('redirect_uri'), 'https://flecos.mx/auth/google/callback');
  assert.equal(u.searchParams.get('response_type'), 'code');
  assert.equal(u.searchParams.get('state'), 'el-nonce');
  // Que se pueda escoger cuenta: con varias sesiones de Google abiertas (lo
  // normal), sin esto entra con la primera sin preguntar.
  assert.equal(u.searchParams.get('prompt'), 'select_account');
  // Y nada de pedir permisos de más: eso es lo que dispara la verificación de
  // Google y la pantalla de "app no verificada".
  assert.equal(u.searchParams.get('scope'), 'openid email profile');
});

test('el secreto NUNCA va en la URL que ve el navegador', () => {
  process.env.GOOGLE_CLIENT_ID = 'uno';
  process.env.GOOGLE_CLIENT_SECRET = 'esto-no-debe-salir';

  const url = oauth.urlDeEntrada({
    proveedor: 'google', brandId: 'flecos', redirectUri: 'http://x/cb', state: 's',
  });

  assert.equal(url.includes('esto-no-debe-salir'), false);
});

test('se puede apuntar a otro servidor, que es como se prueba sin Google', () => {
  process.env.GOOGLE_CLIENT_ID = 'uno';
  process.env.GOOGLE_CLIENT_SECRET = 'secreto';
  process.env.OAUTH_GOOGLE_URL = 'http://localhost:9999/';

  const url = oauth.urlDeEntrada({
    proveedor: 'google', brandId: 'flecos', redirectUri: 'http://x/cb', state: 's',
  });

  assert.ok(url.startsWith('http://localhost:9999/authorize?'), url);
});

// --- Apple: las credenciales -----------------------------------------------
//
// Apple no da un secreto: da cuatro piezas, y con la última se firma. Con tres
// no se puede entrar, así que con tres no se enseña el botón.

test('Apple necesita sus cuatro cosas: con tres no hay botón', () => {
  apple();
  assert.ok(oauth.credenciales('apple', 'flecos'), 'con las cuatro sí');

  for (const falta of ['APPLE_CLIENT_ID', 'APPLE_TEAM_ID', 'APPLE_KEY_ID', 'APPLE_PRIVATE_KEY']) {
    apple();
    delete process.env[falta];
    assert.equal(oauth.credenciales('apple', 'flecos'), null, `sin ${falta} no debería valer`);
    assert.deepEqual(oauth.disponibles('flecos'), [], `sin ${falta} no debería pintarse el botón`);
  }
});

// El error más caro de todos: la llave pegada a medias o sin los saltos de
// línea. Antes se veía como un `invalid_client` de Apple que no dice nada.
test('una llave que no es una llave cuenta como no tenerla', () => {
  apple({ llave: '-----BEGIN PRIVATE KEY-----\nesto-no-es-una-llave\n-----END PRIVATE KEY-----' });
  assert.equal(oauth.credenciales('apple', 'flecos'), null);
  assert.deepEqual(oauth.disponibles('flecos'), [],
    'mejor no enseñar el botón que enseñar uno que falla al tocarlo');
});

test('la llave se puede escribir con los saltos de línea como \\n, que es lo que cabe en un .env', () => {
  apple({ llave: LLAVE.replace(/\n/g, '\\n') });
  assert.ok(oauth.credenciales('apple', 'flecos'), 'un .env es de una línea por variable');
});

test('la llave se puede dejar en un archivo, que es lo sensato en producción', () => {
  const p8 = path.join(os.tmpdir(), `fyb-llave-${process.pid}.p8`);
  fs.writeFileSync(p8, `${LLAVE}\n`);
  try {
    apple();
    delete process.env.APPLE_PRIVATE_KEY;
    process.env.APPLE_PRIVATE_KEY_FILE = p8;
    assert.ok(oauth.credenciales('apple', 'flecos'));

    // Y una ruta mal escrita no revienta: es como no tener llave.
    process.env.APPLE_PRIVATE_KEY_FILE = `${p8}-que-no-existe`;
    assert.equal(oauth.credenciales('apple', 'flecos'), null);
  } finally {
    fs.unlinkSync(p8);
  }
});

test('cada marca puede tener su Services ID', () => {
  apple({ marca: 'barbas' });
  process.env.APPLE_CLIENT_ID = 'mx.general.entrar';

  assert.equal(oauth.credenciales('apple', 'barbas').id, 'mx.flecos.entrar');
  assert.equal(oauth.credenciales('apple', 'flecos').id, 'mx.general.entrar',
    'sin el suyo, usa el general');
});

// --- Apple: el client_secret que firmamos ----------------------------------

test('el client_secret de Apple es un JWT que Apple puede verificar', () => {
  apple();
  const jwt = oauth.secretoDeApple(oauth.credenciales('apple', 'flecos'));
  const [cab, cuerpo, firma] = jwt.split('.');

  const cabecera = JSON.parse(Buffer.from(cab, 'base64url').toString('utf8'));
  assert.equal(cabecera.alg, 'ES256');
  assert.equal(cabecera.kid, 'LLAVE56789', 'sin el kid, Apple no sabe con cuál llave comprobar');

  const datos = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8'));
  assert.equal(datos.iss, 'EQUIPO1234', 'el emisor es el equipo');
  assert.equal(datos.sub, 'mx.flecos.entrar', 'el sujeto es el Services ID');
  assert.equal(datos.aud, 'https://appleid.apple.com');
  assert.ok(datos.exp > datos.iat, 'tiene que caducar');
  assert.ok(datos.exp - datos.iat <= 15777000, 'Apple no acepta más de seis meses');

  // Esto es lo que hace Apple del otro lado. Y `ieee-p1363` no es un detalle:
  // en DER (lo que Node hace por default) la firma es válida para OpenSSL y
  // basura para JOSE, y Apple contesta `invalid_client` sin explicar nada.
  assert.equal(
    crypto.verify('SHA256', Buffer.from(`${cab}.${cuerpo}`),
      { key: PUBLICA, dsaEncoding: 'ieee-p1363' }, Buffer.from(firma, 'base64url')),
    true,
    'la firma no es la que Apple espera'
  );
});

// --- Apple: la URL de salida y la vuelta -----------------------------------

test('la URL de salida de Apple pide el nombre, y por eso vuelve por POST', () => {
  apple();
  const u = new URL(oauth.urlDeEntrada({
    proveedor: 'apple',
    brandId: 'flecos',
    redirectUri: 'https://flecos.mx/auth/apple/callback',
    state: 'el-nonce',
  }));

  assert.equal(u.origin + u.pathname, 'https://appleid.apple.com/auth/authorize');
  assert.equal(u.searchParams.get('client_id'), 'mx.flecos.entrar');
  assert.equal(u.searchParams.get('state'), 'el-nonce');
  assert.equal(u.searchParams.get('scope'), 'name email');
  // Las dos van juntas: en cuanto se pide scope, Apple exige form_post.
  assert.equal(u.searchParams.get('response_mode'), 'form_post');
  assert.equal(oauth.vuelvePorFormulario('apple'), true);
  assert.equal(oauth.vuelvePorFormulario('google'), false,
    'Google vuelve por GET, y de eso depende cómo es la cookie del viaje');
});

test('el nombre de Apple sale del formulario, y una basura no rompe nada', () => {
  assert.equal(
    oauth.nombreDeApple('{"name":{"firstName":"Ana","lastName":"Ruiz"}}'), 'Ana Ruiz');
  assert.equal(oauth.nombreDeApple({ name: { firstName: 'Ana' } }), 'Ana');

  for (const nada of [undefined, '', 'no-es-json', '{}', '{"name":{}}']) {
    assert.equal(oauth.nombreDeApple(nada), null, `debió no encontrar nombre en: ${nada}`);
  }
});

// El viaje de vuelta completo contra un Apple de mentiras, que es donde se ve
// lo que Apple hace distinto: el nombre no viene en el id_token sino en el
// formulario, y `email_verified` viene como CADENA, no como booleano.
test('la identidad de Apple junta el id_token y el nombre del formulario', async () => {
  const falso = http.createServer((req, res) => {
    let cuerpo = '';
    req.on('data', (c) => { cuerpo += c; });
    req.on('end', () => {
      const f = new URLSearchParams(cuerpo);
      const jwt = (o) => [
        Buffer.from(JSON.stringify({ alg: 'ES256' })).toString('base64url'),
        Buffer.from(JSON.stringify(o)).toString('base64url'),
        'firma',
      ].join('.');

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        id_token: jwt({
          sub: '001234.abcd',
          email: f.get('code') === 'sin-verificar' ? 'dudoso@ejemplo.mx' : 'ana@privaterelay.appleid.com',
          email_verified: f.get('code') === 'sin-verificar' ? 'false' : 'true',
        }),
      }));
    });
  });
  await new Promise((r) => falso.listen(0, '127.0.0.1', r));

  try {
    apple();
    process.env.OAUTH_APPLE_URL = `http://127.0.0.1:${falso.address().port}`;

    const quien = await oauth.identidad({
      proveedor: 'apple',
      brandId: 'flecos',
      code: 'un-code',
      redirectUri: 'https://flecos.mx/auth/apple/callback',
      usuario: '{"name":{"firstName":"Ana","lastName":"Ruiz"}}',
    });

    assert.deepEqual(quien, {
      provider: 'apple',
      sub: '001234.abcd',
      email: 'ana@privaterelay.appleid.com',
      name: 'Ana Ruiz',
    });

    // Y con "false" en cadena: el correo se tira, la persona no.
    const dudoso = await oauth.identidad({
      proveedor: 'apple',
      brandId: 'flecos',
      code: 'sin-verificar',
      redirectUri: 'https://flecos.mx/auth/apple/callback',
    });
    assert.equal(dudoso.sub, '001234.abcd');
    assert.equal(dudoso.email, null,
      'Apple manda email_verified como cadena: un "false" NO puede colarse');
    assert.equal(dudoso.name, null);
  } finally {
    falso.close();
  }
});

// --- el id_token -----------------------------------------------------------

test('del id_token se lee el cuerpo, y una basura no rompe nada', () => {
  const cuerpo = Buffer.from(JSON.stringify({ sub: '123', email: 'a@b.mx' })).toString('base64url');
  assert.deepEqual(oauth.cuerpoDelToken(`cabecera.${cuerpo}.firma`), { sub: '123', email: 'a@b.mx' });

  for (const basura of ['', null, 'sin-puntos', 'a.b', 'a.no-es-base64-json.c']) {
    assert.equal(oauth.cuerpoDelToken(basura), null, `debió rechazar: ${basura}`);
  }
});
