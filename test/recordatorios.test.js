// Los recordatorios: la cola de a quién hay que escribirle, el mensaje ya
// escrito, y la memoria de a quién ya se le escribió. Contra una base de usar
// y tirar, igual que citas.test.js.

const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const TMP_DB = path.join(os.tmpdir(), `fyb-recordatorios-${process.pid}-${Date.now()}.db`);
process.env.FYB_DB_PATH = TMP_DB;
process.env.AUTH_MODE = 'demo';
process.env.FYB_SECRET = 'secreto-de-prueba';
delete process.env.BRAND;
process.env.FYB_ENV_PATH = path.join(os.tmpdir(), 'fyb-sin-env-a-proposito');

const { test, after } = require('node:test');
const assert = require('node:assert');
const app = require('../server');
const { hoy, sumarDias } = require('../src/agenda');
const { db } = require('../src/db');

const server = app.listen(0);
const PORT = server.address().port;

after(() => {
  server.close();
  for (const f of [TMP_DB, `${TMP_DB}-wal`, `${TMP_DB}-shm`]) {
    try { fs.unlinkSync(f); } catch (e) { /* puede no existir */ }
  }
});

function pide(method, ruta, { host = 'flecos.mx', body = null, cookie = null } = {}) {
  return new Promise((resolve, reject) => {
    const datos = body === null ? null : JSON.stringify(body);
    const headers = { Host: host };
    if (cookie) headers.Cookie = cookie;
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
        const set = res.headers['set-cookie'] || [];
        resolve({
          status: res.statusCode,
          json,
          cookie: set.map((c) => c.split(';')[0]).join('; ') || null,
        });
      });
    });
    req.on('error', reject);
    if (datos) req.write(datos);
    req.end();
  });
}

async function alta(handle) {
  const r = await pide('POST', '/api/handle/claim', {
    body: { handle, auth: { provider: 'google', sub: `u-${handle}`, name: 'Juan Pérez' } },
  });
  assert.equal(r.status, 201, `no se pudo dar de alta ${handle}`);
  return r.cookie;
}

const proDe = (handle) => db
  .prepare("SELECT id FROM handles WHERE brand='flecos' AND handle=?").get(handle);

// Las citas se plantan directo en la base: esperar a mañana no es opción, y
// reservar por el API depende de si mañana es domingo.
const crearCliente = (proId, nombre, tel) => db
  .prepare('INSERT INTO clientes (handle_id, nombre, telefono, creado) VALUES (?,?,?,?)')
  .run(proId, nombre, tel, Date.now()).lastInsertRowid;

const crearCita = (proId, cli, fecha, estado = 'cumplida', hora = '10:00') => db.prepare(`
  INSERT INTO citas (handle_id, cliente_id, servicio_id, servicio, precio, fecha, hora, minutos, estado, origen, creado)
  VALUES (?,?,NULL,'Corte',250,?,?,30,?,'profesional',?)`)
  .run(proId, cli, fecha, hora, estado, Date.now()).lastInsertRowid;

// ---------------------------------------------------------------------------
// Las citas de mañana
// ---------------------------------------------------------------------------

test('la cola trae las citas de mañana con el mensaje ya escrito', async () => {
  const cookie = await alta('manana');
  const pro = proDe('manana');
  await pide('PUT', '/api/mi/negocio', { cookie, body: { nombre: 'Barbería Juan' } });

  const cli = crearCliente(pro.id, 'Carlos', '6867778899');
  crearCita(pro.id, cli, sumarDias(hoy(), 1), 'reservada', '16:30');

  const r = await pide('GET', '/api/mi/recordatorios', { cookie });
  assert.equal(r.status, 200);
  assert.equal(r.json.citas.length, 1);

  const c = r.json.citas[0];
  assert.equal(c.nombre, 'Carlos');
  assert.equal(c.hora_bonita, '4:30 pm', 'la hora va como la dice la gente');
  assert.match(c.mensaje, /Carlos/);
  assert.match(c.mensaje, /mañana a las 4:30 pm/);
  assert.match(c.mensaje, /Barbería Juan/, 'el mensaje dice de qué negocio es');
  assert.match(c.whatsapp, /^https:\/\/wa\.me\/6867778899\?text=/);
  assert.equal(c.avisado, false);
  assert.equal(r.json.pendientes, 1);
});

test('una cita cancelada deja de pedir recordatorio', async () => {
  const cookie = await alta('cancelada');
  const pro = proDe('cancelada');
  const cli = crearCliente(pro.id, 'Ana', '6860000001');
  const cita = crearCita(pro.id, cli, sumarDias(hoy(), 1), 'reservada');

  assert.equal((await pide('GET', '/api/mi/recordatorios', { cookie })).json.citas.length, 1);

  await pide('POST', `/api/mi/cita/${cita}/cancelada`, { cookie });

  const r = await pide('GET', '/api/mi/recordatorios', { cookie });
  assert.equal(r.json.citas.length, 0, 'la cola se recalcula desde la agenda de hoy');
  assert.equal(r.json.pendientes, 0);
});

test('sin teléfono la cita se ve, pero no cuenta como pendiente', async () => {
  const cookie = await alta('sin-tel');
  const pro = proDe('sin-tel');
  const cli = crearCliente(pro.id, 'Pedro', null);
  crearCita(pro.id, cli, sumarDias(hoy(), 1), 'reservada');

  const r = await pide('GET', '/api/mi/recordatorios', { cookie });
  assert.equal(r.json.citas.length, 1, 'sigue en la lista: Juan ya sabrá cómo localizarlo');
  assert.equal(r.json.citas[0].whatsapp, null);
  assert.equal(r.json.pendientes, 0, 'no hay nada que tocar, no pide atención');
});

// ---------------------------------------------------------------------------
// Acordarse de a quién ya se le escribió
// ---------------------------------------------------------------------------

test('marcar un aviso lo saca de los pendientes, y marcarlo dos veces no lo duplica', async () => {
  const cookie = await alta('marcar');
  const pro = proDe('marcar');
  const cli = crearCliente(pro.id, 'Carlos', '6860000002');
  const cita = crearCita(pro.id, cli, sumarDias(hoy(), 1), 'reservada');

  const m = await pide('POST', '/api/mi/recordatorios/marcar', {
    cookie, body: { tipo: 'cita', cita_id: cita },
  });
  assert.equal(m.status, 200);

  const r = await pide('GET', '/api/mi/recordatorios', { cookie });
  assert.equal(r.json.citas[0].avisado, true, 'la fila sigue ahí, pero ya no pide nada');
  assert.equal(r.json.pendientes, 0);

  // Tocar el botón otra vez (o tenerlo abierto en dos teléfonos) no anota otro.
  await pide('POST', '/api/mi/recordatorios/marcar', { cookie, body: { tipo: 'cita', cita_id: cita } });
  const cuantos = db.prepare('SELECT COUNT(*) AS n FROM recordatorios WHERE cita_id = ?').get(cita);
  assert.equal(cuantos.n, 1, 'el índice único de cita_id es el candado');
});

test('a quien ya se le dijo que vuelva no se le vuelve a decir', async () => {
  const cookie = await alta('regreso-avisado');
  const pro = proDe('regreso-avisado');
  const cli = crearCliente(pro.id, 'Roberto', '6860000003');
  crearCita(pro.id, cli, sumarDias(hoy(), -30));

  const antes = await pide('GET', '/api/mi/recordatorios', { cookie });
  assert.equal(antes.json.regresos.length, 1);
  assert.equal(antes.json.regresos[0].avisado, false);
  assert.match(antes.json.regresos[0].mensaje, /hace 30 días/);
  assert.equal(antes.json.pendientes, 1);

  await pide('POST', '/api/mi/recordatorios/marcar', {
    cookie, body: { tipo: 'regreso', cliente_id: cli },
  });

  const despues = await pide('GET', '/api/mi/recordatorios', { cookie });
  assert.equal(despues.json.regresos[0].avisado, true);
  assert.equal(despues.json.pendientes, 0, 'ya se le escribió: no hay nada que hacer hoy');
});

test('un aviso anterior a su última visita no cuenta: ese ya funcionó', async () => {
  const cookie = await alta('aviso-viejo');
  const pro = proDe('aviso-viejo');
  const cli = crearCliente(pro.id, 'Lupita', '6860000004');
  crearCita(pro.id, cli, sumarDias(hoy(), -30));

  // Se le avisó hace 60 días; volvió hace 30. El aviso ya cumplió su trabajo y
  // no debe callar al de ahora: si no, un cliente fiel se avisaría una sola vez
  // en la vida.
  db.prepare(`INSERT INTO recordatorios (handle_id, cliente_id, tipo, cita_id, fecha, enviado)
              VALUES (?,?,'regreso',NULL,?,?)`)
    .run(pro.id, cli, sumarDias(hoy(), -60), Date.now());

  const r = await pide('GET', '/api/mi/recordatorios', { cookie });
  assert.equal(r.json.regresos[0].avisado, false, 'le toca otra vez');
  assert.equal(r.json.pendientes, 1);
});

// ---------------------------------------------------------------------------
// Que un negocio no marque lo del otro
// ---------------------------------------------------------------------------

test('no se puede marcar el aviso de otro negocio', async () => {
  const unoCookie = await alta('vecino-a');
  const dosCookie = await alta('vecino-b');
  const uno = proDe('vecino-a');

  const cli = crearCliente(uno.id, 'Cliente de Uno', '6860000005');
  const cita = crearCita(uno.id, cli, sumarDias(hoy(), 1), 'reservada');

  // El de al lado adivina el número de la cita.
  const robo = await pide('POST', '/api/mi/recordatorios/marcar', {
    cookie: dosCookie, body: { tipo: 'cita', cita_id: cita },
  });
  assert.equal(robo.status, 404, 'el handle_id sale de la cookie, no del cuerpo');

  const igual = await pide('POST', '/api/mi/recordatorios/marcar', {
    cookie: dosCookie, body: { tipo: 'regreso', cliente_id: cli },
  });
  assert.equal(igual.status, 404);

  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM recordatorios WHERE cliente_id = ?')
    .get(cli).n, 0, 'no se anotó nada');

  // Y el dueño de verdad sí puede.
  const suyo = await pide('POST', '/api/mi/recordatorios/marcar', {
    cookie: unoCookie, body: { tipo: 'cita', cita_id: cita },
  });
  assert.equal(suyo.status, 200);
});

test('la cola de cada quien es la suya', async () => {
  const unoCookie = await alta('cola-uno');
  const dosCookie = await alta('cola-dos');
  const uno = proDe('cola-uno');

  const cli = crearCliente(uno.id, 'Solo de Uno', '6860000006');
  crearCita(uno.id, cli, sumarDias(hoy(), 1), 'reservada');
  crearCita(uno.id, crearCliente(uno.id, 'Viejo de Uno', '6860000007'), sumarDias(hoy(), -40));

  const mia = await pide('GET', '/api/mi/recordatorios', { cookie: unoCookie });
  assert.equal(mia.json.citas.length, 1);
  assert.equal(mia.json.regresos.length, 1);

  const ajena = await pide('GET', '/api/mi/recordatorios', { cookie: dosCookie });
  assert.equal(ajena.json.citas.length, 0, 'ni un teléfono del vecino');
  assert.equal(ajena.json.regresos.length, 0);
  assert.equal(ajena.json.pendientes, 0);
});

test('un tipo que no existe se rechaza', async () => {
  const cookie = await alta('tipo-raro');
  const r = await pide('POST', '/api/mi/recordatorios/marcar', {
    cookie, body: { tipo: 'palomas', cliente_id: 1 },
  });
  assert.equal(r.status, 400);
});
