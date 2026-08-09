// El alta completa, por HTTP, contra una base de datos de usar y tirar.
//
// El entorno se fija ANTES del require: server.js y db.js lo leen al
// cargarse. node --test corre cada archivo en su propio proceso, así que esto
// no toca ni tu base de desarrollo ni los demás archivos de prueba.
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const TMP_DB = path.join(os.tmpdir(), `fyb-test-${process.pid}-${Date.now()}.db`);
process.env.FYB_DB_PATH = TMP_DB;
process.env.AUTH_MODE = 'demo';
delete process.env.BRAND;               // marca por Host, como en producción

const { test, after } = require('node:test');
const assert = require('node:assert');
const app = require('../server');

const server = app.listen(0);
const PORT = server.address().port;

after(() => {
  server.close();
  for (const f of [TMP_DB, `${TMP_DB}-wal`, `${TMP_DB}-shm`]) {
    try { fs.unlinkSync(f); } catch (e) { /* puede no existir */ }
  }
});

// Petición cruda con node:http, no fetch: necesitamos poner el Host a mano
// (fetch no deja) porque de ahí sale la marca.
function pide(method, ruta, { host = 'flecos.mx', body = null } = {}) {
  return new Promise((resolve, reject) => {
    const datos = body === null ? null : JSON.stringify(body);
    const headers = { Host: host };
    if (datos) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(datos);
    }
    const req = http.request({ port: PORT, path: ruta, method, headers }, (res) => {
      let txt = '';
      res.on('data', (c) => { txt += c; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(txt); } catch (e) { /* HTML */ }
        resolve({ status: res.statusCode, json, texto: txt });
      });
    });
    req.on('error', reject);
    if (datos) req.write(datos);
    req.end();
  });
}

const cuenta = (sub, provider = 'google') => ({ provider, sub });
const claim = (handle, sub, opts = {}) =>
  pide('POST', '/api/handle/claim', { ...opts, body: { handle, auth: cuenta(sub) } });

// --- la marca llega bien por HTTP ---

test('/api/config responde Flecos por default y Barbas por dominio', async () => {
  const f = await pide('GET', '/api/config');
  assert.equal(f.json.brand.id, 'flecos');
  assert.equal(f.json.brand.domain, 'flecos.mx');

  const b = await pide('GET', '/api/config', { host: 'barbas.mx' });
  assert.equal(b.json.brand.id, 'barbas');
  assert.equal(b.json.brand.domain, 'barbas.mx');
});

test('el HTML sale con la marca ya puesta y sin plantillas sin rellenar', async () => {
  const f = await pide('GET', '/');
  assert.equal(f.status, 200);
  assert.ok(f.texto.includes('<title>Flecos</title>'));
  assert.ok(f.texto.includes('--brand-blue: #2F6BFF'));
  assert.ok(f.texto.includes('flecos.mx/'));
  assert.ok(!f.texto.includes('{{'), 'quedó un {{PLACEHOLDER}} sin reemplazar');

  const b = await pide('GET', '/', { host: 'barbas.mx' });
  assert.ok(b.texto.includes('<title>Barbas</title>'));
  assert.ok(b.texto.includes('--brand-blue: #0F766E'));
  assert.ok(!b.texto.includes('{{'));
});

// --- paso 1: ¿está libre? ---

test('un identificador nuevo aparece disponible', async () => {
  const r = await pide('GET', '/api/handle/juan');
  assert.deepEqual(r.json, { handle: 'juan', valid: true, available: true, reason: null });
});

test('la consulta normaliza: José y JUAN preguntan por jose y juan', async () => {
  const a = await pide('GET', '/api/handle/' + encodeURIComponent('José'));
  assert.equal(a.json.handle, 'jose');
  assert.equal(a.json.valid, true);

  const b = await pide('GET', '/api/handle/JUAN');
  assert.equal(b.json.handle, 'juan');
});

test('las rutas de la app no están disponibles', async () => {
  const r = await pide('GET', '/api/handle/registro');
  assert.equal(r.json.valid, false);
  assert.equal(r.json.reason, 'reserved');
});

// --- paso 2: quedarse el identificador ---

test('sin cuenta no se puede apartar nada (401)', async () => {
  const r = await pide('POST', '/api/handle/claim', { body: { handle: 'nadie' } });
  assert.equal(r.status, 401);
  assert.equal((await pide('GET', '/api/handle/nadie')).json.available, true,
    'un intento sin cuenta no debe dejar el identificador tocado');
});

test('un identificador apartado se guarda y deja de estar disponible', async () => {
  const r = await claim('juan', 'u-juan');
  assert.equal(r.status, 201);
  assert.equal(r.json.ok, true);
  assert.equal(r.json.already, false);
  assert.equal(r.json.handle, 'juan');
  assert.equal(r.json.url, 'https://flecos.mx/juan');

  const libre = await pide('GET', '/api/handle/juan');
  assert.equal(libre.json.available, false);
  assert.equal(libre.json.reason, 'taken');
});

test('otra persona ya no puede tomar el mismo identificador (409)', async () => {
  const r = await claim('juan', 'otra-persona');
  assert.equal(r.status, 409);
  assert.equal(r.json.error, 'taken');
});

test('la misma cuenta entrando otra vez no duplica: la regresa a la suya', async () => {
  const r = await claim('un-nombre-distinto', 'u-juan');
  assert.equal(r.status, 200);
  assert.equal(r.json.already, true);
  assert.equal(r.json.handle, 'juan', 'debe devolver la que YA tenía');

  const otra = await pide('GET', '/api/handle/un-nombre-distinto');
  assert.equal(otra.json.available, true, 'no debe haberse apartado la nueva');
});

test('no se puede apartar una ruta de la app (400)', async () => {
  const r = await claim('registro', 'u-listo');
  assert.equal(r.status, 400);
  assert.equal(r.json.reason, 'reserved');
});

// --- las dos marcas no se estorban ---

test('el mismo identificador puede existir en Flecos y en Barbas a la vez', async () => {
  assert.equal((await pide('GET', '/api/handle/juan', { host: 'barbas.mx' })).json.available, true);

  const r = await claim('juan', 'u-juan-barbas', { host: 'barbas.mx' });
  assert.equal(r.status, 201);
  assert.equal(r.json.url, 'https://barbas.mx/juan');

  assert.equal((await pide('GET', '/api/handle/juan', { host: 'barbas.mx' })).json.available, false);
});

// --- LA CARRERA: esto es lo que de verdad hay que cuidar ---

test('cinco personas peleando el mismo identificador: gana exactamente una', async () => {
  const handle = 'peleado';

  // Todas ven "disponible" antes de empezar: así es como pasa en la vida real.
  assert.equal((await pide('GET', `/api/handle/${handle}`)).json.available, true);

  const resultados = await Promise.all(
    [1, 2, 3, 4, 5].map((n) => claim(handle, `carrera-${n}`))
  );

  const ganaron = resultados.filter((r) => r.status === 201);
  const perdieron = resultados.filter((r) => r.status === 409);

  assert.equal(ganaron.length, 1, 'debe quedarse UNA sola persona');
  assert.equal(perdieron.length, 4, 'las otras cuatro deben recibir 409');
  assert.equal(ganaron[0].json.handle, handle);
  for (const p of perdieron) assert.equal(p.json.error, 'taken');
});

test('“disponible” es solo informativo: no aparta nada', async () => {
  // Consultar mil veces no reserva; el que llega al claim se lo lleva.
  await pide('GET', '/api/handle/pasajero');
  await pide('GET', '/api/handle/pasajero');
  const r = await claim('pasajero', 'alguien-mas');
  assert.equal(r.status, 201);
});

// --- la página pública ---

test('la dirección apartada responde; una libre no', async () => {
  const tomada = await pide('GET', '/juan');
  assert.equal(tomada.status, 200);
  assert.ok(tomada.texto.includes('flecos.mx/juan'));

  const libre = await pide('GET', '/todavia-de-nadie');
  assert.equal(libre.status, 404);
});
