// Pruebas de navegador (Playwright) para los dos pasos del alta.
//
// Qué se levanta aquí dentro, y se apaga solo al terminar:
//
//   · Flecos en modo demo      → los pasos 1 y 2, el look, la marca
//   · Barbas en modo demo      → que cada marca se vea la suya
//   · Flecos en modo supabase  → el regreso de la autenticación
//   · Un Supabase DE MENTIRAS  → hace de Google/Apple/Facebook, en local
//
// A Google, Apple y Facebook NO se les habla de verdad. El Supabase falso
// recibe el "authorize", regresa al navegador con un token inventado y luego
// responde quién es ese token. Así se prueba el camino COMPLETO —incluida la
// verificación que hace el servidor— sin salir de la máquina.

const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const http = require('node:http');
const { spawn } = require('node:child_process');

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { chromium } = require('playwright');

const RAIZ = path.join(__dirname, '..');
const FOTOS = path.join(__dirname, 'screenshots');

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
  const identidad = { sub: 'persona-1' };

  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, `http://localhost:${port}`);

    if (u.pathname === '/auth/v1/authorize') {
      const volverA = u.searchParams.get('redirect_to');
      res.writeHead(302, { Location: `${volverA}#access_token=tok-${identidad.sub}` });
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

// Petición desde Node (no desde el navegador), para preparar el terreno.
function pide(base, method, ruta, { body = null, token = null } = {}) {
  const u = new URL(ruta, base);
  return new Promise((resolve, reject) => {
    const datos = body === null ? null : JSON.stringify(body);
    const headers = {};
    if (datos) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(datos);
    }
    if (token) headers.Authorization = `Bearer ${token}`;
    const req = http.request(
      { port: u.port, hostname: u.hostname, path: u.pathname, method, headers },
      (res) => {
        let txt = '';
        res.on('data', (c) => { txt += c; });
        res.on('end', () => {
          let json = null;
          try { json = JSON.parse(txt); } catch (e) { /* HTML */ }
          resolve({ status: res.statusCode, json, texto: txt });
        });
      }
    );
    req.on('error', reject);
    if (datos) req.write(datos);
    req.end();
  });
}

// ---------- montaje ----------

let navegador;
let flecos;      // demo
let barbas;      // demo
let conCuenta;   // supabase (contra el falso)
let supabase;

before(async () => {
  fs.mkdirSync(FOTOS, { recursive: true });

  supabase = await arrancaSupabaseFalso();

  [flecos, barbas, conCuenta] = await Promise.all([
    arrancaServidor('flecos', { BRAND: 'flecos', AUTH_MODE: 'demo' }),
    arrancaServidor('barbas', { BRAND: 'barbas', AUTH_MODE: 'demo' }),
    arrancaServidor('supabase', {
      BRAND: 'flecos',
      AUTH_MODE: 'supabase',
      SUPABASE_URL: supabase.url,
      SUPABASE_ANON_KEY: 'llave-de-mentiras',
    }),
  ]);

  navegador = await chromium.launch();
});

after(async () => {
  if (navegador) await navegador.close();
  for (const s of [flecos, barbas, conCuenta]) if (s) s.hijo.kill();
  if (supabase) supabase.srv.close();
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
// 7. El paso 2 ofrece Google, Apple y Facebook
// =====================================================================

test('7 · el paso 2 ofrece Google, Apple y Facebook', async () => {
  const { ctx, page } = await abre(flecos);

  await escribe(page, 'ana-proveedores');
  await page.click('#handle-go');
  await paso(page, 2).waitFor();

  const botones = page.locator('[data-step="2"] [data-provider]');
  assert.equal(await botones.count(), 3);

  // En el orden pedido: Google primero, Apple después, Facebook al final.
  assert.deepEqual(
    await botones.evaluateAll((els) => els.map((e) => e.dataset.provider)),
    ['google', 'apple', 'facebook']
  );

  for (const [proveedor, etiqueta] of [
    ['google', 'Continuar con Google'],
    ['apple', 'Continuar con Apple'],
    ['facebook', 'Continuar con Facebook'],
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
  await assert.doesNotReject(paso(page, 3).waitFor({ timeout: 10000 }),
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
  const marcas = [
    { srv: flecos, nombre: 'Flecos', dominio: 'flecos.mx', fondo: 'rgb(47, 107, 255)', foto: 'flecos' },
    { srv: barbas, nombre: 'Barbas', dominio: 'barbas.mx', fondo: 'rgb(15, 118, 110)', foto: 'barbas' },
  ];

  for (const m of marcas) {
    const { ctx, page } = await abre(m.srv);

    assert.equal(await page.title(), m.nombre);
    assert.equal((await page.locator('.hero h1').textContent()).trim(), m.nombre);
    assert.equal((await page.locator('.handle-prefix').textContent()).trim(), m.dominio + '/');

    const visual = await page.evaluate(() => ({
      fondo: getComputedStyle(document.body).backgroundColor,
      marca: getComputedStyle(document.documentElement).getPropertyValue('--brand-blue').trim(),
      tema: document.querySelector('meta[name="theme-color"]').content,
    }));
    assert.equal(visual.fondo, m.fondo, `el fondo de ${m.nombre} no es el suyo`);
    assert.equal(visual.tema.toLowerCase(), visual.marca.toLowerCase());

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
});
