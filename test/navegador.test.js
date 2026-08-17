// Pruebas de navegador (Playwright) para los dos pasos del alta.
//
// Qué se levanta aquí dentro, y se apaga solo al terminar:
//
//   · Flecos en modo demo      → los pasos 1 y 2, el look, la marca
//   · Barbas en modo demo      → que cada marca se vea la suya
//   · Flecos en modo supabase  → el regreso de la autenticación
//   · Flecos en modo propio    → el viaje a Google sin intermediario
//   · Flecos con Apple         → el mismo viaje, que vuelve por POST
//   · Un Supabase DE MENTIRAS  → hace de portero, en local
//   · Un Google DE MENTIRAS    → hace de Google, en local
//   · Un Apple DE MENTIRAS     → hace de Apple, en local
//
// A Google ni a Apple se les habla de verdad, y aun así se recorre el camino
// COMPLETO de los tres modos —incluida la verificación que hace el servidor—
// sin salir de la máquina. Los tres falsos hablan el protocolo real: el de
// Supabase devuelve un token en el fragmento y luego dice de quién es; el de
// Google devuelve un `code` y lo cambia por un id_token contra el servidor; y
// el de Apple devuelve por POST y **comprueba la firma** del client_secret con
// la llave pública. Cambiar de uno a otro es solo el entorno con el que
// arranca cada servidor, así que si un día el código se desvía del protocolo,
// estas pruebas se caen.

const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const http = require('node:http');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { chromium } = require('playwright');

const RAIZ = path.join(__dirname, '..');
const FOTOS = path.join(__dirname, 'screenshots');

// Los servidores de abajo heredan este entorno, y src/env.js lee un .env al
// arrancar. Apuntarlo a un archivo que no existe deja fuera el .env de quien
// corre las pruebas: aquí la marca y el modo de cuenta los pone cada prueba.
process.env.FYB_ENV_PATH = path.join(os.tmpdir(), 'fyb-sin-env-a-proposito');

// Teléfono: es una app mobile-first, se prueba como se usa.
const TELEFONO = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 };

const dbTemporal = (nombre) =>
  path.join(os.tmpdir(), `fyb-nav-${nombre}-${process.pid}-${Date.now()}.db`);

const DBS = [];
function nuevaDb(nombre) {
  const p = dbTemporal(nombre);
  DBS.push(p);
  return p;
}

// ---------- utilerías ----------

function puertoLibre() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

// Levanta `node server.js` con su propio entorno y espera a que avise que ya
// está escuchando. Cada servidor tiene SU base de datos: no se estorban.
async function arrancaServidor(nombre, extra) {
  const port = await puertoLibre();
  const hijo = spawn(process.execPath, [path.join(RAIZ, 'server.js')], {
    cwd: RAIZ,
    env: { ...process.env, PORT: String(port), FYB_DB_PATH: nuevaDb(nombre), ...extra },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let salida = '';
  hijo.stderr.on('data', (d) => { salida += d; });

  await new Promise((resolve, reject) => {
    const plazo = setTimeout(
      () => reject(new Error(`"${nombre}" no arrancó a tiempo. ${salida}`)), 15000);
    hijo.stdout.on('data', (d) => {
      salida += d;
      if (salida.includes('Flecos y Barbas en')) { clearTimeout(plazo); resolve(); }
    });
    hijo.on('exit', (c) => {
      clearTimeout(plazo);
      reject(new Error(`"${nombre}" se murió (código ${c}). ${salida}`));
    });
  });

  return { nombre, port, url: `http://localhost:${port}`, hijo };
}

// Supabase de mentiras. Dos rutas, las mismas que usa la app de verdad:
//   /auth/v1/authorize  →  hace de Google y rebota al navegador con un token
//   /auth/v1/user       →  dice de quién es ese token (esto lo llama el servidor)
async function arrancaSupabaseFalso() {
  const port = await puertoLibre();
  // Quién va a "iniciar sesión" en el siguiente clic. Lo cambia cada prueba.
  const identidad = { sub: 'persona-1', error: null };

  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, `http://localhost:${port}`);

    if (u.pathname === '/auth/v1/authorize') {
      const volverA = u.searchParams.get('redirect_to');
      // Con `identidad.error`, el falso hace lo que hace el de verdad cuando
      // alguien le da a "Cancelar" en la pantalla de Google, o cuando el
      // proveedor está mal configurado: devuelve a la gente SIN token y con el
      // motivo en el fragmento.
      const cola = identidad.error
        ? `#error=${identidad.error}&error_description=${encodeURIComponent('El usuario no autorizó')}`
        : `#access_token=tok-${identidad.sub}`;
      res.writeHead(302, { Location: `${volverA}${cola}` });
      return res.end();
    }

    if (u.pathname === '/auth/v1/user') {
      const cabecera = req.headers.authorization || '';
      const token = cabecera.startsWith('Bearer ') ? cabecera.slice(7) : '';
      if (!token.startsWith('tok-')) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end('{"error":"bad token"}');
      }
      const sub = token.slice(4);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        id: sub,
        email: `${sub}@ejemplo.mx`,
        app_metadata: { provider: 'google' },
        user_metadata: { full_name: 'Persona de prueba' },
      }));
    }

    res.writeHead(404);
    res.end();
  });

  await new Promise((r) => srv.listen(port, r));
  return { url: `http://localhost:${port}`, srv, identidad };
}

// Google de mentiras, para el modo PROPIO (sin intermediario). Las mismas dos
// rutas que las de verdad:
//
//   /authorize  →  devuelve al navegador a nuestro callback con un `code`
//   /token      →  cambia ese code por un id_token (esto lo llama el servidor,
//                  y con el client_secret, que nunca sale de la máquina)
//
// A Google no se le habla. `OAUTH_GOOGLE_URL` apunta aquí y el camino que se
// recorre es exactamente el de producción.
async function arrancaGoogleFalso() {
  const port = await puertoLibre();
  const identidad = { sub: 'goo-1', nombre: 'Persona de prueba', error: null };
  const codigos = new Map();            // code → a quién pertenece

  const jwt = (cuerpo) => [
    Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url'),
    Buffer.from(JSON.stringify(cuerpo)).toString('base64url'),
    'firma-de-mentiras',
  ].join('.');

  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, `http://localhost:${port}`);

    if (u.pathname === '/authorize') {
      const volverA = u.searchParams.get('redirect_uri');
      const state = u.searchParams.get('state');
      // Sin client_id no hay viaje: es lo primero que revisa el de verdad.
      if (!u.searchParams.get('client_id')) { res.writeHead(400); return res.end(); }

      const cola = identidad.error
        ? `error=${identidad.error}&state=${encodeURIComponent(state || '')}`
        : (() => {
          const code = `code-${Math.random().toString(36).slice(2)}`;
          codigos.set(code, identidad.sub);
          return `code=${code}&state=${encodeURIComponent(state || '')}`;
        })();

      res.writeHead(302, { Location: `${volverA}?${cola}` });
      return res.end();
    }

    if (u.pathname === '/token' && req.method === 'POST') {
      let cuerpo = '';
      req.on('data', (c) => { cuerpo += c; });
      req.on('end', () => {
        const f = new URLSearchParams(cuerpo);
        const sub = codigos.get(f.get('code'));
        // Un code usado ya no vale, igual que en el de verdad.
        codigos.delete(f.get('code'));

        if (!sub || !f.get('client_secret')) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end('{"error":"invalid_grant"}');
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          access_token: 'no-lo-usamos',
          id_token: jwt({
            sub,
            email: `${sub}@ejemplo.mx`,
            email_verified: true,
            name: identidad.nombre,
          }),
        }));
      });
      return;
    }

    res.writeHead(404);
    res.end();
  });

  await new Promise((r) => srv.listen(port, r));
  return { url: `http://localhost:${port}`, srv, identidad };
}

// Apple de mentiras. Se parece al de Google en la forma y NO en las dos cosas
// que importan:
//
//   /authorize  →  NO rebota con un 302: contesta una página que se auto-envía
//                  por POST a nuestro callback. Eso es lo que hace el de
//                  verdad cuando se le pide el nombre (response_mode=form_post),
//                  y es lo que obliga a que la cookie del viaje sea SameSite=None.
//   /token      →  comprueba la FIRMA del client_secret con la llave pública,
//                  igual que Apple. Si firmáramos en DER en vez de en el
//                  formato de JOSE, esto contestaría invalid_client y la
//                  prueba se caería, que es justo lo que tiene que pasar.
//
// La llave la genera la prueba y se la pasa al servidor por el entorno, con
// los saltos de línea escritos como «\n» — como cabe en un .env de verdad.
const parDeLlaves = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const LLAVE_APPLE = parDeLlaves.privateKey.export({ type: 'pkcs8', format: 'pem' }).trim();

async function arrancaAppleFalso() {
  const port = await puertoLibre();
  const identidad = { sub: 'app-1', nombre: 'Ana', apellido: 'Ruiz', error: null };
  const codigos = new Map();

  const firmaBuena = (jwt) => {
    const p = String(jwt || '').split('.');
    if (p.length !== 3) return false;
    try {
      const cab = JSON.parse(Buffer.from(p[0], 'base64url').toString('utf8'));
      const cuerpo = JSON.parse(Buffer.from(p[1], 'base64url').toString('utf8'));
      if (cab.alg !== 'ES256' || !cab.kid) return false;
      if (cuerpo.aud !== 'https://appleid.apple.com' || !cuerpo.sub || !cuerpo.iss) return false;
      if (!(cuerpo.exp > Math.floor(Date.now() / 1000))) return false;
      return crypto.verify(
        'SHA256', Buffer.from(`${p[0]}.${p[1]}`),
        { key: parDeLlaves.publicKey, dsaEncoding: 'ieee-p1363' },
        Buffer.from(p[2], 'base64url')
      );
    } catch (e) {
      return false;
    }
  };

  const jwt = (cuerpo) => [
    Buffer.from(JSON.stringify({ alg: 'ES256' })).toString('base64url'),
    Buffer.from(JSON.stringify(cuerpo)).toString('base64url'),
    'firma-de-mentiras',
  ].join('.');

  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, `http://localhost:${port}`);

    if (u.pathname === '/authorize') {
      const volverA = u.searchParams.get('redirect_uri');
      const state = u.searchParams.get('state') || '';
      if (!u.searchParams.get('client_id')) { res.writeHead(400); return res.end(); }

      let campos;
      if (identidad.error) {
        campos = { error: identidad.error, state };
      } else {
        const code = `code-${Math.random().toString(36).slice(2)}`;
        codigos.set(code, identidad.sub);
        campos = { code, state };
        // El nombre solo va la PRIMERA vez, como en el de verdad.
        if (identidad.nombre) {
          campos.user = JSON.stringify({
            name: { firstName: identidad.nombre, lastName: identidad.apellido },
          });
        }
      }

      const inputs = Object.entries(campos)
        .map(([k, v]) => `<input type="hidden" name="${k}" value='${String(v).replace(/'/g, '&#39;')}'>`)
        .join('');

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(
        `<!doctype html><meta charset="utf-8"><form id="f" method="post" action="${volverA}">`
        + `${inputs}</form><script>document.getElementById('f').submit()</script>`
      );
    }

    if (u.pathname === '/token' && req.method === 'POST') {
      let cuerpo = '';
      req.on('data', (c) => { cuerpo += c; });
      req.on('end', () => {
        const f = new URLSearchParams(cuerpo);
        const sub = codigos.get(f.get('code'));
        codigos.delete(f.get('code'));

        if (!sub || !firmaBuena(f.get('client_secret'))) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end('{"error":"invalid_client"}');
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        // Apple manda `email_verified` como CADENA, no como booleano, y el
        // nombre no lo manda aquí: va en el formulario de la vuelta.
        res.end(JSON.stringify({
          id_token: jwt({
            sub,
            email: `${sub}@privaterelay.appleid.com`,
            email_verified: 'true',
            is_private_email: 'true',
          }),
        }));
      });
      return;
    }

    res.writeHead(404);
    res.end();
  });

  await new Promise((r) => srv.listen(port, r));

  // `127.0.0.1` y no `localhost`, y esto NO es un detalle: para el navegador
  // son dos sitios distintos, así que el POST de vuelta a la app es de verdad
  // entre sitios. Con las dos en `localhost` una cookie `lax` viajaría igual y
  // la prueba diría que todo está bien mientras en producción se pierde
  // siempre el viaje.
  return { url: `http://127.0.0.1:${port}`, srv, identidad };
}

// Petición desde Node (no desde el navegador), para preparar el terreno.
//
// `cookie` y las cabeceras de vuelta hacen falta para probar a mano el viaje
// del modo propio: hay cosas —como llegar al callback con una cookie legítima
// pero un `state` ajeno— que un navegador no deja montar.
function pide(base, method, ruta, { body = null, token = null, cookie = null } = {}) {
  const u = new URL(ruta, base);
  return new Promise((resolve, reject) => {
    const datos = body === null ? null : JSON.stringify(body);
    const headers = {};
    if (datos) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(datos);
    }
    if (token) headers.Authorization = `Bearer ${token}`;
    if (cookie) headers.Cookie = cookie;
    const req = http.request(
      { port: u.port, hostname: u.hostname, path: u.pathname + u.search, method, headers },
      (res) => {
        let txt = '';
        res.on('data', (c) => { txt += c; });
        res.on('end', () => {
          let json = null;
          try { json = JSON.parse(txt); } catch (e) { /* HTML */ }
          resolve({ status: res.statusCode, json, texto: txt, cabeceras: res.headers });
        });
      }
    );
    req.on('error', reject);
    if (datos) req.write(datos);
    req.end();
  });
}

// La cookie del viaje que acaba de poner el servidor, lista para devolverla.
const cookieDe = (res, nombre) =>
  (res.cabeceras['set-cookie'] || [])
    .map((c) => c.split(';')[0])
    .find((c) => c.startsWith(`${nombre}=`)) || null;

// ---------- montaje ----------

let navegador;
let flecos;      // demo
let barbas;      // demo
let conCuenta;   // supabase (contra el falso)
let supabase;
let propio;      // sin intermediario (contra el Google falso)
let google;
let conApple;    // sin intermediario, con Apple (contra el Apple falso)
let apple;

before(async () => {
  fs.mkdirSync(FOTOS, { recursive: true });

  [supabase, google, apple] = await Promise.all([
    arrancaSupabaseFalso(), arrancaGoogleFalso(), arrancaAppleFalso(),
  ]);

  [flecos, barbas, conCuenta, propio, conApple] = await Promise.all([
    arrancaServidor('flecos', { BRAND: 'flecos', AUTH_MODE: 'demo' }),
    arrancaServidor('barbas', { BRAND: 'barbas', AUTH_MODE: 'demo' }),
    arrancaServidor('supabase', {
      BRAND: 'flecos',
      AUTH_MODE: 'supabase',
      SUPABASE_URL: supabase.url,
      SUPABASE_ANON_KEY: 'llave-de-mentiras',
    }),
    arrancaServidor('propio', {
      BRAND: 'flecos',
      AUTH_MODE: 'propio',
      OAUTH_GOOGLE_URL: google.url,
      GOOGLE_CLIENT_ID: 'id-de-mentiras.apps.googleusercontent.com',
      GOOGLE_CLIENT_SECRET: 'secreto-de-mentiras',
    }),
    // Este solo tiene Apple: así se ve que una marca puede ofrecer uno y no el
    // otro, y que el viaje de Apple no depende en nada del de Google.
    arrancaServidor('apple', {
      BRAND: 'flecos',
      AUTH_MODE: 'propio',
      OAUTH_APPLE_URL: apple.url,
      APPLE_CLIENT_ID: 'mx.flecos.entrar',
      APPLE_TEAM_ID: 'EQUIPO1234',
      APPLE_KEY_ID: 'LLAVE56789',
      APPLE_PRIVATE_KEY: LLAVE_APPLE.replace(/\n/g, '\\n'),
    }),
  ]);

  navegador = await chromium.launch();
});

after(async () => {
  if (navegador) await navegador.close();
  for (const s of [flecos, barbas, conCuenta, propio, conApple]) if (s) s.hijo.kill();
  if (supabase) supabase.srv.close();
  if (google) google.srv.close();
  if (apple) apple.srv.close();
  for (const f of DBS) {
    for (const suf of ['', '-wal', '-shm']) {
      try { fs.unlinkSync(f + suf); } catch (e) { /* puede no existir */ }
    }
  }
});

// Abre una pestaña nueva y limpia en el servidor que se le diga.
async function abre(servidor) {
  const ctx = await navegador.newContext(TELEFONO);
  const page = await ctx.newPage();
  await page.goto(servidor.url + '/', { waitUntil: 'networkidle' });
  return { ctx, page };
}

const paso = (page, n) => page.locator(`[data-step="${n}"]:not([hidden])`);

// Escribe un identificador y espera el veredicto del servidor.
async function escribe(page, texto) {
  await page.fill('#handle', texto);
  await page.waitForSelector('.handle-status.is-ok, .handle-status.is-error', { timeout: 5000 });
}

// Los pasos 3 y 4 (horario y servicios) afinan lo que el negocio ya trae
// puesto. Cuando lo que se está probando es CÓMO se entró, se saltan: la 18 es
// la que se mete a fondo con ellos.
async function saltaAjustes(page) {
  await paso(page, 3).waitFor({ timeout: 10000 });
  await page.click('#horario-salta');
  await page.click('#servicios-salta');
  await paso(page, 5).waitFor({ timeout: 5000 });
}

// =====================================================================
// 1. El paso 1 abre y conserva el look de Días que Cuentan
// =====================================================================

test('1 · el paso 1 abre y conserva el look de Días que Cuentan', async () => {
  const { ctx, page } = await abre(flecos);

  await assert.doesNotReject(paso(page, 1).waitFor({ timeout: 5000 }));
  assert.equal(await page.locator('[data-step="2"]').isHidden(), true);
  assert.equal(await page.locator('[data-step="3"]').isHidden(), true);

  const look = await page.evaluate(() => {
    const css = (el, prop) => getComputedStyle(el).getPropertyValue(prop);
    const body = document.body;
    const cont = document.querySelector('.container');
    const caja = document.querySelector('.handle-box');
    return {
      fondo: css(body, 'background-color'),
      fuente: css(body, 'font-family'),
      peso: css(body, 'font-weight'),
      tamano: css(body, 'font-size'),
      anchoColumna: css(cont, 'max-width'),
      radioCaja: css(caja, 'border-radius'),
      fondoCaja: css(caja, 'background-color'),
      // El calendario de argollas: las tres piezas del arte de DQC.
      piezas: ['.calendar-top', '.calendar-mid', '.calendar-bottom']
        .map((s) => !!document.querySelector(s)),
      marcoTop: css(document.querySelector('.calendar-top'), '--brand-blue').trim(),
    };
  });

  // Los valores son los de Días que Cuentan, no unos parecidos.
  assert.equal(look.fondo, 'rgb(47, 107, 255)', 'el azul de marca cambió');
  assert.match(look.fuente, /Inter/, 'la tipografía ya no es Inter');
  assert.equal(look.peso, '200', 'el peso ligero de DQC cambió');
  assert.equal(look.tamano, '18px');
  assert.equal(look.anchoColumna, '520px', 'el ancho de la columna cambió');
  assert.equal(look.radioCaja, '16px');
  assert.equal(look.fondoCaja, 'rgb(255, 255, 255)');
  assert.deepEqual(look.piezas, [true, true, true], 'falta una pieza del calendario');
  assert.equal(look.marcoTop, '#2F6BFF');

  // La página NO scrollea: en DQC el alto es el del viewport y el scroll vive
  // dentro de las vistas. Si esto se rompe, la app deja de sentirse app.
  const scrollea = await page.evaluate(
    () => document.documentElement.scrollHeight > window.innerHeight + 1);
  assert.equal(scrollea, false, 'la página empezó a scrollear');

  await page.screenshot({ path: path.join(FOTOS, 'flecos-paso1.png') });
  await ctx.close();
});

// =====================================================================
// 2. Un identificador válido se muestra disponible
// =====================================================================

test('2 · un identificador válido se muestra disponible', async () => {
  const { ctx, page } = await abre(flecos);

  await escribe(page, 'roberto');

  const estado = page.locator('.handle-status');
  await assert.doesNotReject(estado.and(page.locator('.is-ok')).waitFor({ timeout: 5000 }));
  assert.match(await estado.textContent(), /flecos\.mx\/roberto está disponible/);

  // Y el botón invita a quedársela, con la dirección completa.
  const boton = page.locator('#handle-go');
  assert.equal(await boton.isDisabled(), false);
  assert.equal((await boton.textContent()).trim(), 'Quiero flecos.mx/roberto');

  await page.screenshot({ path: path.join(FOTOS, 'flecos-paso1-disponible.png') });
  await ctx.close();
});

// =====================================================================
// 3. Un identificador ocupado se muestra como no disponible
// =====================================================================

test('3 · un identificador ocupado se muestra como NO disponible', async () => {
  // Alguien ya se lo quedó (por API, como si hubiera sido otra persona).
  const previo = await pide(flecos.url, 'POST', '/api/handle/claim', {
    body: { handle: 'ocupado', auth: { provider: 'google', sub: 'el-primero' } },
  });
  assert.equal(previo.status, 201);

  const { ctx, page } = await abre(flecos);
  await escribe(page, 'ocupado');

  const estado = page.locator('.handle-status');
  assert.equal(await estado.evaluate((el) => el.classList.contains('is-error')), true);
  assert.match(await estado.textContent(), /Ya está ocupada/);
  assert.equal(await page.locator('#handle-go').isDisabled(), true,
    'no debe poder continuar con una dirección ocupada');

  await page.screenshot({ path: path.join(FOTOS, 'flecos-paso1-ocupada.png') });
  await ctx.close();
});

// =====================================================================
// 4. Mayúsculas, acentos y espacios se normalizan al teclear
// =====================================================================

test('4 · mayúsculas, acentos y espacios se corrigen mientras se teclea', async () => {
  const { ctx, page } = await abre(flecos);
  const campo = page.locator('#handle');

  // Tecleado de verdad, letra por letra, como una persona.
  await campo.pressSequentially('José Pérez', { delay: 15 });
  assert.equal(await campo.inputValue(), 'jose-perez');

  await campo.fill('');
  await campo.pressSequentially('BARBERÍA  DEL  CENTRO', { delay: 10 });
  assert.equal(await campo.inputValue(), 'barberia-del-centro');

  await campo.fill('');
  await campo.pressSequentially('Muñoz!!', { delay: 10 });
  assert.equal(await campo.inputValue(), 'munoz');

  // Y lo que quedó escrito es exactamente lo que se ofrece apartar.
  await escribe(page, 'jose-perez');
  assert.match(await page.locator('.handle-status').textContent(),
    /flecos\.mx\/jose-perez está disponible/);

  await ctx.close();
});

// =====================================================================
// 5. No deja continuar con un identificador inválido
// =====================================================================

test('5 · no deja continuar con un identificador inválido', async () => {
  const { ctx, page } = await abre(flecos);
  const boton = page.locator('#handle-go');

  // Vacío: ni siquiera hay qué apartar.
  assert.equal(await boton.isDisabled(), true);
  assert.equal((await boton.textContent()).trim(), 'Escribe tu dirección');

  // Muy corto.
  await escribe(page, 'ab');
  assert.equal(await boton.isDisabled(), true);
  assert.match(await page.locator('.handle-status').textContent(), /Muy corta/);

  // Una ruta de la app.
  await escribe(page, 'registro');
  assert.equal(await boton.isDisabled(), true);
  assert.match(await page.locator('.handle-status').textContent(), /usa la app/);

  // Y darle Enter tampoco lo cuela: seguimos en el paso 1.
  await page.locator('#handle').press('Enter');
  await page.waitForTimeout(300);
  assert.equal(await paso(page, 1).isVisible(), true);
  assert.equal(await page.locator('[data-step="2"]').isHidden(), true);

  await ctx.close();
});

// =====================================================================
// 6. Con un identificador válido se pasa al paso 2
// =====================================================================

test('6 · al elegir un identificador válido pasa al paso 2', async () => {
  const { ctx, page } = await abre(flecos);

  await escribe(page, 'ana-paso2');
  await page.click('#handle-go');

  await assert.doesNotReject(paso(page, 2).waitFor({ timeout: 5000 }));
  assert.equal(await page.locator('[data-step="1"]').isHidden(), true);

  // La dirección elegida sigue a la vista: se ve QUÉ se está guardando.
  assert.equal((await page.locator('#handle-echo').textContent()).trim(),
    'flecos.mx/ana-paso2');

  await ctx.close();
});

// =====================================================================
// 7. El paso 2 ofrece Google y Apple
// =====================================================================

test('7 · el paso 2 ofrece Google y Apple', async () => {
  const { ctx, page } = await abre(flecos);

  await escribe(page, 'ana-proveedores');
  await page.click('#handle-go');
  await paso(page, 2).waitFor();

  const botones = page.locator('[data-step="2"] [data-provider]');
  assert.equal(await botones.count(), 2, 'son dos: Facebook se quitó a propósito');

  // En el orden pedido: Google primero, Apple después.
  assert.deepEqual(
    await botones.evaluateAll((els) => els.map((e) => e.dataset.provider)),
    ['google', 'apple']
  );

  for (const [proveedor, etiqueta] of [
    ['google', 'Continuar con Google'],
    ['apple', 'Continuar con Apple'],
  ]) {
    const b = page.locator(`[data-provider="${proveedor}"]`);
    assert.equal(await b.isVisible(), true, `no se ve el botón de ${proveedor}`);
    assert.match(await b.textContent(), new RegExp(etiqueta));
    // Cada uno con su logo (fa-brands), no un icono genérico.
    assert.equal(await b.locator(`i.fa-${proveedor}`).count(), 1,
      `falta el logo de ${proveedor}`);
  }

  // Y una salida para cambiar de opinión.
  assert.equal(await page.locator('#handle-back').isVisible(), true);

  await page.screenshot({ path: path.join(FOTOS, 'flecos-paso2.png') });
  await ctx.close();
});

// =====================================================================
// 8. Al volver de la autenticación se conserva el identificador
// =====================================================================

test('8 · al regresar de la autenticación conserva el identificador elegido', async () => {
  const { ctx, page } = await abre(conCuenta);

  await escribe(page, 'ana-supabase');
  await page.click('#handle-go');
  await paso(page, 2).waitFor();

  // Quién va a "entrar" con Google en el siguiente clic.
  supabase.identidad.sub = 'ana';

  // Clic real: la página se va al Supabase falso y este la rebota de regreso
  // con un token en el fragmento — igual que Google de verdad.
  await Promise.all([
    page.waitForURL((u) => u.origin === conCuenta.url && !u.hash.includes('access_token'),
      { timeout: 10000 }),
    page.click('[data-provider="google"]'),
  ]);

  // Salió de la app y volvió: eso es lo que hay que probar.
  await assert.doesNotReject(saltaAjustes(page),
    'no llegó a la pantalla final después de autenticarse');

  // El identificador sobrevivió el viaje.
  assert.equal((await page.locator('#done-url').textContent()).trim(),
    'flecos.mx/ana-supabase');
  assert.match(await page.locator('#done-title').textContent(), /Ya es tuya/);

  // Y quedó guardado de verdad, a nombre de quien se autenticó.
  const consulta = await pide(conCuenta.url, 'GET', '/api/handle/ana-supabase');
  assert.equal(consulta.json.available, false);

  // El token no se queda en la barra de direcciones.
  assert.equal(page.url().includes('access_token'), false);

  await ctx.close();
});

// =====================================================================
// 9. Si se la ganaron durante la autenticación: de vuelta al paso 1
// =====================================================================

test('9 · si otra persona la tomó mientras se autenticaba, vuelve al paso 1 y lo explica', async () => {
  const { ctx, page } = await abre(conCuenta);
  const disputada = 'peleada-en-el-camino';

  await escribe(page, disputada);
  assert.match(await page.locator('.handle-status').textContent(), /está disponible/);
  await page.click('#handle-go');
  await paso(page, 2).waitFor();

  // AQUÍ, mientras esta persona está decidiendo, otra se la lleva.
  const ladron = await pide(conCuenta.url, 'POST', '/api/handle/claim', {
    body: { handle: disputada },
    token: 'tok-el-que-llego-antes',
  });
  assert.equal(ladron.status, 201, 'el robo de la prueba no funcionó');

  // Ahora sí se autentica, sin saber nada.
  supabase.identidad.sub = 'la-que-perdio';
  await Promise.all([
    page.waitForURL((u) => u.origin === conCuenta.url && !u.hash.includes('access_token'),
      { timeout: 10000 }),
    page.click('[data-provider="google"]'),
  ]);

  // Debe regresar sola al paso 1...
  await assert.doesNotReject(paso(page, 1).waitFor({ timeout: 10000 }),
    'debió regresar al paso 1');
  assert.equal(await page.locator('[data-step="2"]').isHidden(), true);
  assert.equal(await page.locator('[data-step="3"]').isHidden(), true);

  // ...y decirlo claro: qué pasó, con cuál dirección, y qué hacer ahora.
  const aviso = page.locator('.handle-status');
  assert.equal(await aviso.evaluate((el) => el.classList.contains('is-error')), true);
  const texto = await aviso.textContent();
  assert.match(texto, /Alguien tomó/, 'no explica que se la ganaron');
  assert.match(texto, new RegExp(disputada), 'no dice CUÁL dirección se perdió');
  assert.match(texto, /Escoge otra/, 'no dice qué hacer ahora');

  // El campo quedó libre para volver a intentar, sin nada apartado.
  assert.equal(await page.locator('#handle').inputValue(), '');
  assert.equal(await page.locator('#handle-go').isDisabled(), true);

  await page.screenshot({ path: path.join(FOTOS, 'flecos-paso1-ganada-por-otro.png') });

  // Y se puede seguir adelante con otra: la pantalla no quedó atorada.
  await escribe(page, 'la-siguiente');
  assert.equal(await page.locator('#handle-go').isDisabled(), false);

  await ctx.close();
});

// =====================================================================
// 10. Cada marca muestra la suya
// =====================================================================

test('10 · Flecos y Barbas muestran cada una su propia marca', async () => {
  const iconos = new Map();     // marca → tamaño de su favicon
  const marcas = [
    { srv: flecos, nombre: 'Flecos', dominio: 'flecos.mx', fondo: 'rgb(47, 107, 255)', foto: 'flecos' },
    { srv: barbas, nombre: 'Barbas', dominio: 'barbas.mx', fondo: 'rgb(15, 118, 110)', foto: 'barbas' },
  ];

  for (const m of marcas) {
    const { ctx, page } = await abre(m.srv);

    assert.equal(await page.title(), m.nombre);
    assert.equal((await page.locator('.hero h1').textContent()).trim(), m.nombre);
    assert.equal((await page.locator('.handle-prefix').textContent()).trim(), m.dominio + '/');

    const visual = await page.evaluate(() => {
      const logo = document.querySelector('.hero .logo');
      const dibujo = getComputedStyle(logo, '::before');
      return {
        fondo: getComputedStyle(document.body).backgroundColor,
        marca: getComputedStyle(document.documentElement).getPropertyValue('--brand-blue').trim(),
        tema: document.querySelector('meta[name="theme-color"]').content,
        // El dibujo del logo: qué PNG y de qué color se pinta.
        dibujo: dibujo.maskImage || dibujo.webkitMaskImage,
        tinta: dibujo.backgroundColor,
        // Que el cuadro exista de verdad y no sea un span de cero píxeles.
        ancho: logo.getBoundingClientRect().width,
      };
    });
    assert.equal(visual.fondo, m.fondo, `el fondo de ${m.nombre} no es el suyo`);
    assert.equal(visual.tema.toLowerCase(), visual.marca.toLowerCase());

    // El logo es el de SU marca. Las tres se anunciaban con las mismas tijeras
    // de peluquería, así que Barbas salía con el dibujo de Flecos.
    assert.match(visual.dibujo, new RegExp(`/marca/${m.foto}/icono\\.png`),
      `${m.nombre} no está usando su propio dibujo: ${visual.dibujo}`);
    assert.equal(visual.tinta, m.fondo, 'el trazo del logo debe seguir al acento de la marca');
    assert.ok(visual.ancho > 60, `el cuadro del logo mide ${visual.ancho}px`);

    // Y el favicon también es el suyo: es el mismo nombre de archivo para las
    // tres, así que sin el reparto por marca todas enseñarían el de Flecos.
    const ico = await pide(m.srv.url, 'GET', '/favicon.ico');
    assert.equal(ico.status, 200);
    iconos.set(m.nombre, ico.texto.length);

    // El botón principal repite el dominio correcto.
    await escribe(page, 'juan');
    assert.equal((await page.locator('#handle-go').textContent()).trim(),
      `Quiero ${m.dominio}/juan`);

    if (m.foto === 'barbas') {
      await page.screenshot({ path: path.join(FOTOS, 'barbas-paso1.png') });
    }

    // Paso 2, para tener la foto de las dos marcas.
    await page.click('#handle-go');
    await paso(page, 2).waitFor();
    assert.equal((await page.locator('#handle-echo').textContent()).trim(),
      `${m.dominio}/juan`);
    if (m.foto === 'barbas') {
      await page.screenshot({ path: path.join(FOTOS, 'barbas-paso2.png') });
    }

    await ctx.close();
  }

  // Las dos son el mismo programa: `juan` pudo apartarse en las dos a la vez.
  assert.equal((await pide(flecos.url, 'GET', '/api/handle/juan')).json.available, true);
  assert.equal((await pide(barbas.url, 'GET', '/api/handle/juan')).json.available, true);

  // Y los favicons son DISTINTOS. Comparar tamaños basta y no depende del arte.
  assert.notEqual(iconos.get('Flecos'), iconos.get('Barbas'),
    'las dos marcas están sirviendo el mismo favicon');
});

// =====================================================================
// 11. Vuelve del acceso SIN token: cancelado, o proveedor mal puesto
// =====================================================================
//
// Es el camino más transitado de todos —quien le da a "Cancelar" en la
// pantalla de Google pasa por aquí— y hasta ahora se ignoraba: la persona
// aterrizaba en el paso 1 con el campo vacío y sin una palabra de qué pasó.
// Con un Supabase real es, además, por donde asoma un proveedor mal
// configurado.

test('11 · si vuelve sin token, conserva el identificador y explica qué pasó', async () => {
  const { ctx, page } = await abre(conCuenta);
  const suya = 'ana-se-arrepintio';

  await escribe(page, suya);
  await page.click('#handle-go');
  await paso(page, 2).waitFor();

  // El siguiente clic vuelve con "no autorizado" en vez de con un token.
  supabase.identidad.error = 'access_denied';
  try {
    await page.click('[data-provider="google"]');

    // Se espera al mensaje, no a la URL: la vuelta es una recarga entera.
    await page.waitForFunction(
      () => {
        const e = document.getElementById('error');
        return e && e.textContent.trim().length > 0;
      },
      { timeout: 10000 }
    );

    // Sigue en el paso 2 —a un clic de reintentar—, no de vuelta al principio.
    assert.equal(await page.locator('[data-step="2"]').isVisible(), true,
      'debió quedarse en el paso 2');
    assert.equal((await page.locator('#handle-echo').textContent()).trim(),
      `flecos.mx/${suya}`, 'perdió el identificador que ya había escrito');

    const aviso = (await page.locator('#error').textContent()).trim();
    assert.match(aviso, /intentarlo otra vez/, `no explica qué hacer: "${aviso}"`);

    // No se apartó nada, claro.
    assert.equal((await pide(conCuenta.url, 'GET', `/api/handle/${suya}`)).json.available, true);

    // Y el error no se queda en la barra de direcciones.
    assert.equal(page.url().includes('error'), false);

    await page.screenshot({ path: path.join(FOTOS, 'flecos-paso2-sin-token.png') });

    // Reintentar es un clic: ahora sí, con token. Persona nueva a propósito:
    // una que ya tuviera dirección volvería a la SUYA, no a esta.
    supabase.identidad.error = null;
    supabase.identidad.sub = 'ana-que-vuelve';
    await page.click('[data-provider="google"]');
    await assert.doesNotReject(saltaAjustes(page),
      'el segundo intento debió completar el alta');
    assert.equal((await page.locator('#done-url').textContent()).trim(), `flecos.mx/${suya}`);
  } finally {
    supabase.identidad.error = null;
  }

  await ctx.close();
});

// =====================================================================
// 12. SIN INTERMEDIARIO: el viaje entero contra Google
// =====================================================================
//
// Es el modo que existe para que la pantalla del proveedor diga flecos.mx y
// no el dominio de un portero ajeno. Aquí el viaje vuelve al SERVIDOR (no al
// navegador con un token), así que lo que se prueba es distinto: que el
// identificador sobreviva en la cookie firmada, que el alta se haga del lado
// del servidor y que la sesión quede abierta al aterrizar.

test('12 · sin intermediario: se va a Google, vuelve, y el alta queda hecha', async () => {
  const { ctx, page } = await abre(propio);
  const suya = 'ana-sin-portero';

  await escribe(page, suya);
  await page.click('#handle-go');
  await paso(page, 2).waitFor();

  google.identidad.sub = 'ana-google';

  await Promise.all([
    page.waitForURL((u) => u.pathname === '/' && !u.search, { timeout: 10000 }),
    page.click('[data-provider="google"]'),
  ]);

  await assert.doesNotReject(saltaAjustes(page), 'no llegó a la pantalla final');
  assert.equal((await page.locator('#done-url').textContent()).trim(), `flecos.mx/${suya}`);
  assert.match(await page.locator('#done-title').textContent(), /Ya es tuya/);

  // Quedó guardada de verdad.
  assert.equal((await pide(propio.url, 'GET', `/api/handle/${suya}`)).json.available, false);

  // Y la sesión quedó abierta: /mi contesta en vez de rebotar al alta. Esto es
  // lo que hace que el alta termine DENTRO de la app y no en una pantalla
  // muerta.
  await page.goto(`${propio.url}/mi`);
  assert.equal(new URL(page.url()).pathname, '/mi', 'la sesión no quedó abierta');

  // El code y el state no se quedan en la barra de direcciones.
  assert.equal(/code=|state=/.test(page.url()), false);

  await page.screenshot({ path: path.join(FOTOS, 'flecos-propio-listo.png') });
  await ctx.close();
});

// =====================================================================
// 13. Sin intermediario, y le da a Cancelar
// =====================================================================

test('13 · sin intermediario: si cancela, conserva el identificador y lo explica', async () => {
  const { ctx, page } = await abre(propio);
  const suya = 'ana-lo-piensa';

  await escribe(page, suya);
  await page.click('#handle-go');
  await paso(page, 2).waitFor();

  google.identidad.error = 'access_denied';
  try {
    await page.click('[data-provider="google"]');
    await page.waitForFunction(
      () => {
        const e = document.getElementById('error');
        return e && e.textContent.trim().length > 0;
      },
      { timeout: 10000 }
    );

    assert.equal(await page.locator('[data-step="2"]').isVisible(), true,
      'debió quedarse en el paso 2');
    assert.equal((await page.locator('#handle-echo').textContent()).trim(),
      `flecos.mx/${suya}`, 'perdió el identificador');
    assert.match((await page.locator('#error').textContent()).trim(), /intentarlo otra vez/);

    // No se apartó nada.
    assert.equal((await pide(propio.url, 'GET', `/api/handle/${suya}`)).json.available, true);
  } finally {
    google.identidad.error = null;
  }

  await ctx.close();
});

// =====================================================================
// 14. Sin intermediario: una vuelta que no es nuestra, no pasa
// =====================================================================
//
// El `state` es lo único que separa un regreso legítimo de uno preparado por
// alguien más (CSRF). Sin cookie del viaje o con un state que no cuadra, el
// servidor no puede apartar nada.

test('14 · sin intermediario: una vuelta con state ajeno no aparta nada', async () => {
  // a) Sin haber empezado ningún viaje: llega de la nada.
  const suelta = await pide(propio.url, 'GET',
    '/auth/google/callback?code=code-inventado&state=state-inventado');
  assert.equal(suelta.status, 302, 'debe rebotar al alta, no completar nada');
  assert.match(String(suelta.cabeceras.location), /viaje_perdido/);

  // b) El caso de verdad: un viaje LEGÍTIMO empezado por esta persona, y una
  // vuelta con otro `state`. Es lo que montaría quien quiera colar su propio
  // regreso. La cookie es buena, así que lo único que lo para es el state.
  const salida = await pide(propio.url, 'GET', '/auth/google?handle=ana-csrf');
  const galleta = cookieDe(salida, 'fyb_viaje');
  assert.ok(galleta, 'el viaje debió dejar su cookie');

  const colada = await pide(propio.url, 'GET',
    '/auth/google/callback?code=code-inventado&state=el-de-otro', { cookie: galleta });

  assert.equal(colada.status, 302);
  assert.match(String(colada.cabeceras.location), /viaje_perdido/,
    'con un state que no es el nuestro NO se sigue adelante');

  // Y lo que de verdad importa: no se apartó nada a nombre de nadie.
  assert.equal((await pide(propio.url, 'GET', '/api/handle/ana-csrf')).json.available, true);
});

// =====================================================================
// 15. Solo se enseñan los botones que de verdad funcionan
// =====================================================================
//
// En modo propio, un botón sin credenciales es un botón que falla al tocarlo.
// El servidor solo tiene Google configurado en esta prueba.

test('15 · sin intermediario: solo aparece el botón que tiene credenciales', async () => {
  const { ctx, page } = await abre(propio);

  await escribe(page, 'ana-botones');
  await page.click('#handle-go');
  await paso(page, 2).waitFor();

  assert.equal(await page.locator('[data-provider="google"]').isVisible(), true);
  assert.equal(await page.locator('[data-provider="apple"]').isHidden(), true,
    'Apple no está configurado: su botón no debe aparecer');

  await page.screenshot({ path: path.join(FOTOS, 'flecos-propio-paso2.png') });
  await ctx.close();
});

// =====================================================================
// 16. APPLE: el mismo viaje, pero la vuelta es un POST
// =====================================================================
//
// Apple es el único que vuelve por POST (form_post), y eso toca dos cosas que
// no se ven: la ruta del callback y —la que muerde— la cookie del viaje, que
// con `lax` NO viajaría en un POST venido de otro sitio y el identificador se
// perdería SIEMPRE. Además, el nombre solo llega aquí y solo esta vez.
//
// El Apple falso comprueba la firma del client_secret, así que esto prueba de
// paso que el JWT que firmamos es el que Apple espera.

test('16 · Apple: vuelve por POST, el alta queda hecha y el nombre se guarda', async () => {
  const { ctx, page } = await abre(conApple);
  const suya = 'ana-con-apple';

  // Este servidor solo tiene Apple: el botón de Google ni se pinta.
  await escribe(page, suya);
  await page.click('#handle-go');
  await paso(page, 2).waitFor();
  assert.equal(await page.locator('[data-provider="apple"]').isVisible(), true);
  assert.equal(await page.locator('[data-provider="google"]').isHidden(), true);

  apple.identidad.sub = 'apple-ana';
  apple.identidad.nombre = 'Ana';
  apple.identidad.apellido = 'Ruiz';

  await Promise.all([
    page.waitForURL((u) => u.pathname === '/' && !u.search, { timeout: 10000 }),
    page.click('[data-provider="apple"]'),
  ]);

  await assert.doesNotReject(saltaAjustes(page),
    'no llegó a la pantalla final: ¿se perdió la cookie en el POST?');
  assert.equal((await page.locator('#done-url').textContent()).trim(), `flecos.mx/${suya}`);

  // Quedó guardada, y la sesión abierta.
  assert.equal((await pide(conApple.url, 'GET', `/api/handle/${suya}`)).json.available, false);
  await page.goto(`${conApple.url}/mi`);
  assert.equal(new URL(page.url()).pathname, '/mi', 'la sesión no quedó abierta');

  // Y el nombre —que Apple manda UNA sola vez en la vida, en el formulario y
  // no en el id_token— quedó guardado. Si se ignorara, no habría segunda
  // oportunidad de preguntarlo.
  const yo = await page.evaluate(() => fetch('/api/mi/yo').then((r) => r.json()));
  assert.equal(yo.nombre, 'Ana Ruiz', 'se perdió el nombre que Apple solo manda una vez');

  await page.screenshot({ path: path.join(FOTOS, 'flecos-apple-listo.png') });
  await ctx.close();
});

// =====================================================================
// 17. Apple, y le da a Cancelar
// =====================================================================
//
// El motivo también llega en el POST, no en la URL. Si solo se mirara
// `req.query`, la persona volvería al paso 1 sin una palabra de qué pasó.

test('17 · Apple: si cancela, conserva el identificador y lo explica', async () => {
  const { ctx, page } = await abre(conApple);
  const suya = 'ana-lo-piensa-apple';

  await escribe(page, suya);
  await page.click('#handle-go');
  await paso(page, 2).waitFor();

  apple.identidad.error = 'user_cancelled_authorize';
  try {
    await page.click('[data-provider="apple"]');
    await page.waitForFunction(
      () => {
        const e = document.getElementById('error');
        return e && e.textContent.trim().length > 0;
      },
      { timeout: 10000 }
    );

    assert.equal(await page.locator('[data-step="2"]').isVisible(), true,
      'debió quedarse en el paso 2');
    assert.equal((await page.locator('#handle-echo').textContent()).trim(),
      `flecos.mx/${suya}`, 'perdió el identificador');
    assert.match((await page.locator('#error').textContent()).trim(), /intentarlo otra vez/);

    assert.equal((await pide(conApple.url, 'GET', `/api/handle/${suya}`)).json.available, true);
  } finally {
    apple.identidad.error = null;
  }

  await ctx.close();
});

// =====================================================================
// 18. El alta no se acaba en la cuenta: sigue el horario y los servicios
// =====================================================================
//
// Es la parte que faltaba. Antes el alta terminaba en «Ya es tuya» y ahí se
// moría: ni se preguntaba nada más ni había a dónde ir. Ahora los pasos 3 y 4
// afinan lo que el negocio ya trae puesto —no una pantalla en blanco— y el 5
// entra a la app.

test('18 · el alta sigue con el horario y los servicios, y lo que se cambia queda guardado', async () => {
  const { ctx, page } = await abre(flecos);
  const suya = 'ana-se-configura';

  await escribe(page, suya);
  await page.click('#handle-go');
  await paso(page, 2).waitFor();
  await page.click('[data-provider="google"]');

  // --- Paso 3: el horario, con lo de ejemplo ya puesto ---
  await assert.doesNotReject(paso(page, 3).waitFor({ timeout: 10000 }),
    'tras guardar la cuenta debe preguntar el horario');

  assert.equal(await page.locator('.dia-chip').count(), 7,
    'los siete días van siempre a la vista: los cerrados se ven cerrados');

  // Lunes a sábado abiertos, domingo cerrado — lo que estrena src/negocio.js.
  assert.deepEqual(
    await page.locator('.dia-chip').evaluateAll(
      (els) => els.map((e) => e.getAttribute('aria-pressed') === 'true')),
    [false, true, true, true, true, true, true],
    'no llegó el horario que el negocio ya tenía');

  // La franja que se ofrece es la que MÁS días comparten (lunes a viernes,
  // 10–19), no la del primer día que venga en la lista.
  assert.equal(await page.locator('#alta-abre').inputValue(), '10:00');
  assert.equal(await page.locator('#alta-cierra').inputValue(), '19:00');

  await page.screenshot({ path: path.join(FOTOS, 'flecos-paso3-horario.png') });

  // Ana cierra los sábados y abre más tarde.
  await page.locator('.dia-chip[data-dia="6"]').click();
  await page.locator('#alta-abre').fill('11:30');
  await page.click('#horario-sigue');

  // --- Paso 4: los servicios ---
  await assert.doesNotReject(paso(page, 4).waitFor({ timeout: 5000 }),
    'después del horario van los servicios');

  const filas = page.locator('.alta-servicio');
  assert.equal(await filas.count(), 3, 'los tres servicios de ejemplo');
  assert.equal(await filas.nth(0).locator('.s-nombre').inputValue(), 'Corte');
  assert.equal(await filas.nth(0).locator('.s-precio').inputValue(), '250');

  // Le sube el corte, quita la barba sola y agrega uno suyo.
  await filas.nth(0).locator('.s-precio').fill('300');
  await filas.nth(1).locator('.s-quitar').click();
  await page.click('#alta-agregar');
  const nueva = page.locator('.alta-servicio').last();
  await nueva.locator('.s-nombre').fill('Tinte');
  await nueva.locator('.s-precio').fill('600');
  await nueva.locator('.s-minutos').fill('90');

  await page.screenshot({ path: path.join(FOTOS, 'flecos-paso4-servicios.png') });
  await page.click('#servicios-sigue');

  // --- Paso 5: listo, y con salida ---
  await assert.doesNotReject(paso(page, 5).waitFor({ timeout: 5000 }));
  assert.equal((await page.locator('#done-url').textContent()).trim(), `flecos.mx/${suya}`);
  await page.screenshot({ path: path.join(FOTOS, 'flecos-paso5-listo.png') });

  // Y quedó guardado DE VERDAD, no solo pintado.
  const guardado = await page.evaluate(() => fetch('/api/mi/negocio').then((r) => r.json()));

  const dias = guardado.horario.map((h) => h.dia);
  assert.equal(dias.includes(6), false, 'el sábado que cerró sigue abierto');
  assert.deepEqual(dias, [1, 2, 3, 4, 5]);
  assert.deepEqual(
    [...new Set(guardado.horario.map((h) => `${h.abre}-${h.cierra}`))], ['11:30-19:00'],
    'la franja que escogió no quedó en todos los días que dejó abiertos');

  const servicios = guardado.servicios.map((s) => `${s.nombre} ${s.precio} ${s.minutos}`);
  assert.deepEqual(servicios, ['Corte 300 30', 'Corte + barba 350 60', 'Tinte 600 90'],
    `los servicios no quedaron como Ana los dejó: ${servicios.join(' · ')}`);

  // El alta termina DENTRO de la app: el botón entra a la agenda. Sin él, la
  // dirección era suya y no había a dónde ir.
  await Promise.all([
    page.waitForURL((u) => u.pathname === '/mi', { timeout: 5000 }),
    page.click('#done-ir'),
  ]);

  await ctx.close();
});

// =====================================================================
// 19. Quien ya tenía dirección no vuelve a configurar: entra
// =====================================================================
//
// Volver a darle a «Continuar con Google» es, de hecho, iniciar sesión. A esa
// persona su horario y sus servicios ya se los preguntamos una vez, y hacerla
// pasar otra vez por ellos sería pedirle que confirme lo que ya cambió.

test('19 · quien ya tenía dirección entra directo, sin volver a configurar', async () => {
  const { ctx, page } = await abre(flecos);
  const suya = 'ana-que-ya-estaba';

  await escribe(page, suya);
  await page.click('#handle-go');
  await paso(page, 2).waitFor();
  await page.click('[data-provider="google"]');
  await paso(page, 3).waitFor({ timeout: 10000 });

  // Vuelve al alta con la MISMA cuenta (el mismo navegador) y otra dirección.
  await page.goto(flecos.url + '/', { waitUntil: 'networkidle' });
  await escribe(page, 'una-direccion-nueva');
  await page.click('#handle-go');
  await paso(page, 2).waitFor();
  await page.click('[data-provider="google"]');

  await assert.doesNotReject(paso(page, 5).waitFor({ timeout: 10000 }),
    'quien ya está dado de alta no debe volver a pasar por los ajustes');
  assert.match(await page.locator('#done-title').textContent(), /Ya la tenías/);

  // Y aterriza en la SUYA, no en la que acababa de escribir.
  assert.equal((await page.locator('#done-url').textContent()).trim(), `flecos.mx/${suya}`);
  assert.equal((await pide(flecos.url, 'GET', '/api/handle/una-direccion-nueva')).json.available,
    true, 'no debió apartar la segunda dirección');

  await ctx.close();
});
