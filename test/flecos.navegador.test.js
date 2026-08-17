// Flecos 1.0 en un navegador de verdad: el círculo completo.
//
//   Juan se da de alta  →  configura su negocio  →  Luis reserva desde la
//   página pública  →  la cita aparece en la agenda de Juan  →  Juan le
//   escribe una nota  →  Luis vuelve y lo reconocemos.
//
// Es la prueba que contesta "¿esto de verdad sirve?". Las de HTTP
// (citas.test.js) cubren los casos raros; esta cubre el camino que va a
// recorrer una persona.

const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { chromium } = require('playwright');
// Las mismas cuentas de fecha que usa la app. Ver abajo por qué importa.
const { hoy, sumarDias } = require('../src/agenda');

const RAIZ = path.join(__dirname, '..');
const FOTOS = path.join(__dirname, 'screenshots');
const TELEFONO = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 };

// La MISMA fila (.member-row, .mr-name, .mr-sub) se usa en tres pestañas: la
// agenda de Hoy, Clientes y Regresos. Las tres viven en el HTML a la vez —las
// que no tocan van `hidden`—, así que un `.member-row` a secas puede resolver
// a la de otra pestaña, y Playwright se queda esperando algo invisible.
//
// Esto no era teórico: la prueba de la MEMORIA pasaba en domingo (cerrado: la
// cita caía otro día y Hoy quedaba vacío) y fallaba en lunes (la cita caía
// hoy, y Hoy estrenaba una fila oculta). Una prueba que depende del día de la
// semana está rota la mitad del tiempo.
const EN = {
  hoy: '[data-vista="hoy"]',
  clientes: '[data-vista="clientes"]',
  regresos: '[data-vista="regresos"]',
};

// El servidor hereda este entorno y src/env.js lee un .env al arrancar: se
// apunta a un archivo que no existe para que el .env de casa no se meta.
process.env.FYB_ENV_PATH = path.join(os.tmpdir(), 'fyb-sin-env-a-proposito');

const DBS = [];

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

async function arrancaServidor(nombre, extra) {
  const port = await puertoLibre();
  const db = path.join(os.tmpdir(), `fyb-f1-${nombre}-${process.pid}-${Date.now()}.db`);
  DBS.push(db);

  const hijo = spawn(process.execPath, [path.join(RAIZ, 'server.js')], {
    cwd: RAIZ,
    env: { ...process.env, PORT: String(port), FYB_DB_PATH: db, ...extra },
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

  return { port, url: `http://localhost:${port}`, hijo };
}

let navegador;
let app;

before(async () => {
  fs.mkdirSync(FOTOS, { recursive: true });
  app = await arrancaServidor('flecos1', { BRAND: 'flecos', AUTH_MODE: 'demo' });
  navegador = await chromium.launch();
});

after(async () => {
  if (navegador) await navegador.close();
  if (app) app.hijo.kill();
  for (const db of DBS) {
    for (const f of [db, `${db}-wal`, `${db}-shm`]) {
      try { fs.unlinkSync(f); } catch (e) { /* puede no existir */ }
    }
  }
});

// Una pestaña limpia, que avisa si el JavaScript de la página truena.
async function pestana() {
  const ctx = await navegador.newContext(TELEFONO);
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push(String(e.message)));
  return { ctx, page, errores };
}

// Da de alta a un profesional y deja la pestaña con su sesión abierta.
//
// Los pasos 3 y 4 son ajustes sobre lo que el negocio YA trae puesto, así que
// aquí se saltan: estas pruebas son de lo que pasa después, y quieren
// justamente el horario y los servicios de ejemplo.
async function daDeAlta(page, handle) {
  await page.goto(app.url);
  await page.fill('#handle', handle);
  await page.waitForFunction(() => !document.getElementById('handle-go').disabled);
  await page.click('#handle-go');
  await page.click('[data-provider="google"]');
  await page.waitForSelector('[data-step="3"]:not([hidden])');
  await page.click('#horario-salta');
  await page.click('#servicios-salta');
  await page.waitForSelector('[data-step="5"]:not([hidden])');
}

// El primer día con horas libres para ese servicio, ya en la pantalla del
// cliente. Devuelve el texto de la hora que se eligió.
async function reserva(page, handle, { servicio, nombre, telefono }) {
  await page.goto(`${app.url}/${handle}`);
  await page.waitForSelector('.precio-row');     // la portada ya cargó
  await page.click('#ir-cita');
  await page.waitForSelector('.servicio-btn');
  await page.click(`.servicio-btn:has-text("${servicio}")`);
  await page.waitForSelector('.hora-btn');
  const hora = await page.textContent('.hora-btn');
  await page.click('.hora-btn');
  await page.fill('#nombre', nombre);
  await page.fill('#telefono', telefono);
  await page.click('#confirmar');
  await page.waitForSelector('[data-step="4"]:not([hidden])');
  return hora.trim();
}

// ---------------------------------------------------------------------------

test('1 · el alta deja a Juan dentro de su agenda, no en una pantalla vacía', async () => {
  const { ctx, page, errores } = await pestana();
  await daDeAlta(page, 'juan');

  await page.goto(`${app.url}/mi`);
  await page.waitForSelector('.mi-tabs');

  // Las cuatro patas de ideas.txt, y en ese orden.
  const pestanas = await page.$$eval('.tab span:first-of-type', (n) => n.map((x) => x.textContent));
  assert.deepEqual(pestanas, ['Hoy', 'Clientes', 'Recordar', 'Mi negocio']);

  await page.click('[data-ir="negocio"]');
  await page.waitForSelector('.servicio-fila');
  const servicios = await page.$$eval('.servicio-n', (n) => n.map((x) => x.textContent));
  assert.ok(servicios.includes('Corte + barba'),
    'un negocio recién dado de alta ya trae servicios: nadie empieza en blanco');

  await page.screenshot({ path: path.join(FOTOS, 'f1-mi-negocio.png') });
  assert.deepEqual(errores, []);
  await ctx.close();
});

test('2 · sin sesión, /mi no enseña nada: manda al alta', async () => {
  const { ctx, page } = await pestana();
  await page.goto(`${app.url}/mi`);
  await page.waitForSelector('#handle');
  assert.equal(new URL(page.url()).pathname, '/', 'debió rebotar al alta');
  await ctx.close();
});

test('3 · lo que Juan configura es lo que ve su cliente', async () => {
  const { ctx, page, errores } = await pestana();
  await daDeAlta(page, 'ana');

  await page.goto(`${app.url}/mi`);
  await page.click('[data-ir="negocio"]');
  // Se espera a que los datos hayan llegado: #n-nombre existe en el HTML
  // desde el principio, y llenarlo antes de tiempo lo pisa la respuesta.
  await page.waitForSelector('.servicio-fila');
  await page.fill('#n-nombre', 'Estilos Ana');
  await page.fill('#n-ciudad', 'Mexicali');
  await page.click('#guardar-negocio');
  await page.waitForSelector('.error.flotante.visible');

  const cliente = await pestana();
  await cliente.page.goto(`${app.url}/ana`);
  await cliente.page.waitForSelector('.precio-row');
  assert.equal(await cliente.page.textContent('h1'), 'Estilos Ana');
  assert.equal(await cliente.page.textContent('#sub'), 'Mexicali');

  await cliente.page.screenshot({ path: path.join(FOTOS, 'f1-pagina-publica.png') });
  assert.deepEqual(errores, []);
  assert.deepEqual(cliente.errores, []);
  await cliente.ctx.close();
  await ctx.close();
});

test('4 · el círculo completo: Luis reserva y la cita aparece en la agenda de Juan', async () => {
  const juan = await pestana();
  await daDeAlta(juan.page, 'pepe');

  const luis = await pestana();
  const hora = await reserva(luis.page, 'pepe', {
    servicio: 'Corte + barba', nombre: 'Luis', telefono: '686 999 1122',
  });
  assert.ok(hora, 'debió poder escoger una hora');
  await luis.page.screenshot({ path: path.join(FOTOS, 'f1-cita-hecha.png') });

  // Del lado de Juan: la cita quedó para el próximo día que trabaja, así que
  // se avanza hasta encontrarla.
  await juan.page.goto(`${app.url}/mi`);
  await juan.page.waitForSelector('.mi-tabs');

  let encontrada = false;
  for (let i = 0; i < 8 && !encontrada; i++) {
    encontrada = await juan.page.$(`${EN.hoy} .member-row`) !== null;
    if (!encontrada) {
      await juan.page.click('#dia-manana');
      await juan.page.waitForTimeout(250);
    }
  }
  assert.ok(encontrada, 'la cita de Luis debe aparecer en la agenda de Juan');

  assert.match(await juan.page.textContent(`${EN.hoy} .mr-name`), /Luis/);
  assert.match(await juan.page.textContent(`${EN.hoy} .mr-sub`), /Corte \+ barba/);
  await juan.page.screenshot({ path: path.join(FOTOS, 'f1-agenda.png') });

  assert.deepEqual(luis.errores, []);
  assert.deepEqual(juan.errores, []);
  await luis.ctx.close();
  await juan.ctx.close();
});

test('5 · la MEMORIA: Juan escribe una nota y el cliente nunca la ve', async () => {
  const juan = await pestana();
  await daDeAlta(juan.page, 'memo');

  const luis = await pestana();
  await reserva(luis.page, 'memo', {
    servicio: 'Corte', nombre: 'Luis', telefono: '6861112233',
  });

  await juan.page.goto(`${app.url}/mi`);
  await juan.page.click('[data-ir="clientes"]');
  await juan.page.waitForSelector(`${EN.clientes} .member-row`);
  await juan.page.click(`${EN.clientes} .member-row`);
  await juan.page.waitForSelector('.hoja-panel textarea');

  const SECRETO = 'Maquina 1 lados. No le gusta que le hablen.';
  await juan.page.fill('.hoja-panel textarea', SECRETO);
  await juan.page.click('.hoja-panel .btn-soft');
  await juan.page.waitForSelector('.error.flotante.visible');
  await juan.page.screenshot({ path: path.join(FOTOS, 'f1-ficha-cliente.png') });

  // Se relee desde cero: que de verdad se haya guardado, no solo pintado.
  await juan.page.reload();
  await juan.page.click('[data-ir="clientes"]');
  await juan.page.waitForSelector(`${EN.clientes} .member-row`);
  await juan.page.click(`${EN.clientes} .member-row`);
  await juan.page.waitForSelector('.hoja-panel textarea');
  assert.equal(await juan.page.inputValue('.hoja-panel textarea'), SECRETO);

  // Y del lado del cliente NO aparece por ningún lado.
  await luis.page.goto(`${app.url}/memo`);
  await luis.page.waitForSelector('.precio-row');
  await luis.page.click('#ir-soy');
  await luis.page.fill('#soy-telefono', '6861112233');
  await luis.page.click('#soy-buscar');
  await luis.page.waitForSelector('#soy-saludo');

  assert.match(await luis.page.textContent('#soy-saludo'), /Luis/, 'sí lo reconoce');
  const todo = await luis.page.content();
  assert.ok(!todo.includes('No le gusta'), 'la nota de Juan se filtró a la página pública');

  await luis.ctx.close();
  await juan.ctx.close();
});

test('6 · "lo de siempre": al que vuelve no se le pregunta todo otra vez', async () => {
  const juan = await pestana();
  await daDeAlta(juan.page, 'vuelve');

  const luis = await pestana();
  await reserva(luis.page, 'vuelve', {
    servicio: 'Corte + barba', nombre: 'Luis Pérez', telefono: '6865554433',
  });

  // Vuelve más tarde, desde cero.
  const otra = await pestana();
  await otra.page.goto(`${app.url}/vuelve`);
  await otra.page.waitForSelector('.precio-row');
  await otra.page.click('#ir-soy');
  await otra.page.fill('#soy-telefono', '(686) 555-4433');   // escrito distinto: mismo número
  await otra.page.click('#soy-buscar');
  await otra.page.waitForSelector('#soy-siempre:not([hidden])');

  assert.match(await otra.page.textContent('#soy-siempre-texto'), /Corte \+ barba/);
  await otra.page.screenshot({ path: path.join(FOTOS, 'f1-ya-soy-cliente.png') });

  // Y al tocarlo entra directo a escoger hora, sin volver a elegir servicio.
  await otra.page.click('#soy-siempre');
  await otra.page.waitForSelector('[data-step="2"]:not([hidden])');
  assert.match(await otra.page.textContent('#elegido-servicio'), /Corte \+ barba/);

  assert.deepEqual(otra.errores, []);
  await otra.ctx.close();
  await luis.ctx.close();
  await juan.ctx.close();
});

test('7 · si le ganan la hora mientras llena sus datos, se le explica y sigue', async () => {
  const juan = await pestana();
  await daDeAlta(juan.page, 'carrera');

  // Los dos llegan a la MISMA hora y se quedan en "¿quién eres?".
  const uno = await pestana();
  const dos = await pestana();

  for (const p of [uno.page, dos.page]) {
    await p.goto(`${app.url}/carrera`);
    await p.waitForSelector('.precio-row');
    await p.click('#ir-cita');
    await p.waitForSelector('.servicio-btn');
    await p.click('.servicio-btn:has-text("Corte + barba")');
    await p.waitForSelector('.hora-btn');
    await p.click('.hora-btn');
    await p.waitForSelector('[data-step="3"]:not([hidden])');
  }

  await uno.page.fill('#nombre', 'Primero');
  await uno.page.fill('#telefono', '6860000001');
  await uno.page.click('#confirmar');
  await uno.page.waitForSelector('[data-step="4"]:not([hidden])');

  // El segundo confirma la hora que ya no existe.
  await dos.page.fill('#nombre', 'Segundo');
  await dos.page.fill('#telefono', '6860000002');
  await dos.page.click('#confirmar');

  // No se queda colgado ni truena: regresa a escoger hora y lo explica.
  await dos.page.waitForSelector('[data-step="2"]:not([hidden])');
  assert.match(await dos.page.textContent('#error'), /acaba de tomar esa hora/i);
  await dos.page.screenshot({ path: path.join(FOTOS, 'f1-hora-ganada.png') });

  assert.deepEqual(dos.errores, []);
  await dos.ctx.close();
  await uno.ctx.close();
  await juan.ctx.close();
});

test('8 · Recordar avisa de quien ya debería haber vuelto, y no lo repite', async () => {
  const juan = await pestana();
  await daDeAlta(juan.page, 'regreso');

  // Se planta una visita vieja directamente en la base del servidor de
  // prueba: esperar 30 días no es opción.
  const db = require('better-sqlite3')(DBS[DBS.length - 1]);
  const pro = db.prepare("SELECT id FROM handles WHERE handle = 'regreso'").get();
  const cli = db.prepare('INSERT INTO clientes (handle_id, nombre, telefono, creado) VALUES (?,?,?,?)')
    .run(pro.id, 'Carlos', '6867778899', Date.now()).lastInsertRowid;

  // OJO: con `new Date().toISOString()` esta prueba fallaba por las tardes.
  // toISOString() da la fecha en UTC, y la app trabaja en la hora del local
  // (src/agenda.js). Pasadas las 5pm en México, UTC ya va un día adelante y
  // los 40 días salían 39. Se usan las mismas cuentas que el código de verdad.
  const fecha = sumarDias(hoy(), -40);
  db.prepare(`INSERT INTO citas (handle_id, cliente_id, servicio_id, servicio, precio,
              fecha, hora, minutos, estado, origen, creado)
              VALUES (?,?,NULL,'Corte',250,?, '10:00', 30, 'cumplida', 'profesional', ?)`)
    .run(pro.id, cli, fecha, Date.now());
  db.close();

  await juan.page.goto(`${app.url}/mi`);
  await juan.page.waitForSelector('.mi-tabs');

  // El aviso sale sin tener que entrar a la pestaña.
  await juan.page.waitForSelector('#badge-regresos:not([hidden])');
  assert.equal(await juan.page.textContent('#badge-regresos'), '1');

  await juan.page.click('[data-ir="regresos"]');
  await juan.page.waitForSelector(`${EN.regresos} .member-row`);
  assert.match(await juan.page.textContent(`${EN.regresos} .mr-name`), /Carlos/);
  assert.match(await juan.page.textContent(`${EN.regresos} .mr-sub`), /Hace 40 días/);

  // Y el botón que hace el trabajo: escribirle, con el mensaje ya puesto.
  const wa = await juan.page.getAttribute(`${EN.regresos} .wa-btn`, 'href');
  assert.match(wa, /^https:\/\/wa\.me\/6867778899\?text=/);
  assert.match(decodeURIComponent(wa), /Carlos/);
  assert.match(decodeURIComponent(wa), /30 días|40 días/);

  await juan.page.screenshot({ path: path.join(FOTOS, 'f1-regresos.png') });

  // Al tocarlo se anota el aviso. La fila se queda (por si hay que insistir),
  // pero apagada, y la pastilla baja: eso es lo que hace que no se repita.
  await juan.page.click(`${EN.regresos} .wa-btn`);
  await juan.page.waitForSelector(`${EN.regresos} .member-row.avisado`);
  await juan.page.waitForSelector('#badge-regresos', { state: 'hidden' });

  // Y sigue apagado después de recargar: quedó en la base, no en la pantalla.
  await juan.page.goto(`${app.url}/mi`);
  await juan.page.click('[data-ir="regresos"]');
  await juan.page.waitForSelector(`${EN.regresos} .member-row.avisado`);
  assert.equal(await juan.page.isVisible('#badge-regresos'), false,
    'nada pendiente: ya se le escribió');

  await juan.page.screenshot({ path: path.join(FOTOS, 'f1-recordatorio-avisado.png') });
  assert.deepEqual(juan.errores, []);
  await juan.ctx.close();
});

test('9 · la otra mitad de Recordar: las citas de mañana', async () => {
  const juan = await pestana();
  await daDeAlta(juan.page, 'manana');

  const db = require('better-sqlite3')(DBS[DBS.length - 1]);
  const pro = db.prepare("SELECT id FROM handles WHERE handle = 'manana'").get();
  const cli = db.prepare('INSERT INTO clientes (handle_id, nombre, telefono, creado) VALUES (?,?,?,?)')
    .run(pro.id, 'Lupita', '6861112233', Date.now()).lastInsertRowid;
  // Directo a la base: mañana puede ser domingo y entonces no se puede reservar.
  db.prepare(`INSERT INTO citas (handle_id, cliente_id, servicio_id, servicio, precio,
              fecha, hora, minutos, estado, origen, creado)
              VALUES (?,?,NULL,'Corte + barba',350,?, '16:30', 45, 'reservada', 'cliente', ?)`)
    .run(pro.id, cli, sumarDias(hoy(), 1), Date.now());
  db.close();

  await juan.page.goto(`${app.url}/mi`);
  await juan.page.click('[data-ir="regresos"]');
  await juan.page.waitForSelector('#lista-manana .member-row');

  assert.match(await juan.page.textContent('#lista-manana .mr-name'), /Lupita/);
  assert.equal(await juan.page.textContent('#lista-manana .mr-date'), '4:30 pm',
    'la hora como la dice la gente, no 16:30');

  // El mensaje va escrito dentro de la liga: Juan solo le da enviar.
  const wa = decodeURIComponent(await juan.page.getAttribute('#lista-manana .wa-btn', 'href'));
  assert.match(wa, /Lupita/);
  assert.match(wa, /mañana a las 4:30 pm/);
  assert.match(wa, /Corte \+ barba/);

  await juan.page.screenshot({ path: path.join(FOTOS, 'f1-recordatorio-manana.png') });
  assert.deepEqual(juan.errores, []);
  await juan.ctx.close();
});
