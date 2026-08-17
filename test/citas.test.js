// Flecos 1.0 por HTTP: mi negocio, la página pública, reservar, la ficha del
// cliente y los regresos. Contra una base de usar y tirar.

const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const TMP_DB = path.join(os.tmpdir(), `fyb-citas-${process.pid}-${Date.now()}.db`);
process.env.FYB_DB_PATH = TMP_DB;
process.env.AUTH_MODE = 'demo';
process.env.FYB_SECRET = 'secreto-de-prueba';
delete process.env.BRAND;
// El .env de quien corre las pruebas no se mete: archivo que no existe.
process.env.FYB_ENV_PATH = path.join(os.tmpdir(), 'fyb-sin-env-a-proposito');

const { test, after } = require('node:test');
const assert = require('node:assert');
const app = require('../server');
const { hoy, sumarDias, diaDeSemana } = require('../src/agenda');
const { db } = require('../src/db');

const server = app.listen(0);
const PORT = server.address().port;

after(() => {
  server.close();
  for (const f of [TMP_DB, `${TMP_DB}-wal`, `${TMP_DB}-shm`]) {
    try { fs.unlinkSync(f); } catch (e) { /* puede no existir */ }
  }
});

// Petición cruda: hace falta poner el Host a mano (de ahí sale la marca) y
// llevar la cookie de sesión de un lado a otro.
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
        // La cookie de sesión, lista para la siguiente petición.
        const set = res.headers['set-cookie'] || [];
        const galleta = set.map((c) => c.split(';')[0]).join('; ') || null;
        resolve({ status: res.statusCode, json, texto: txt, cookie: galleta });
      });
    });
    req.on('error', reject);
    if (datos) req.write(datos);
    req.end();
  });
}

// Da de alta a alguien y devuelve su cookie de sesión.
async function alta(handle, sub = `u-${handle}`, host = 'flecos.mx') {
  const r = await pide('POST', '/api/handle/claim', {
    host,
    body: { handle, auth: { provider: 'google', sub, name: 'Juan Pérez' } },
  });
  assert.equal(r.status, 201, `no se pudo dar de alta ${handle}`);
  assert.ok(r.cookie, 'el alta debe dejar sesión iniciada');
  return r.cookie;
}

// Un día que seguro trabaja: el horario de arranque es lunes a sábado, así
// que se busca el primer día de aquí a una semana que no sea domingo.
function proximoDiaHabil(desde = hoy()) {
  for (let i = 1; i < 8; i++) {
    const f = sumarDias(desde, i);
    if (diaDeSemana(f) !== 0) return f;
  }
  throw new Error('imposible');
}

// ---------------------------------------------------------------------------
// La sesión
// ---------------------------------------------------------------------------

test('el alta deja la sesión iniciada y el negocio ya montado', async () => {
  const cookie = await alta('juan');

  const yo = await pide('GET', '/api/mi/yo', { cookie });
  assert.equal(yo.status, 200);
  assert.equal(yo.json.handle, 'juan');
  assert.equal(yo.json.url, 'flecos.mx/juan');

  // Nadie empieza con la pantalla en blanco.
  const neg = await pide('GET', '/api/mi/negocio', { cookie });
  assert.equal(neg.json.servicios.length, 3, 'trae servicios de ejemplo');
  assert.equal(neg.json.horario.length, 6, 'lunes a sábado');
  assert.ok(neg.json.servicios.some((s) => s.nombre === 'Corte + barba'));
});

test('sin cookie no se entra a nada del área del profesional (401)', async () => {
  for (const ruta of ['/api/mi/yo', '/api/mi/agenda', '/api/mi/clientes', '/api/mi/regresos']) {
    const r = await pide('GET', ruta);
    assert.equal(r.status, 401, `${ruta} debió pedir sesión`);
  }
});

test('una cookie manoseada no sirve', async () => {
  const cookie = await alta('firmita');
  const real = await pide('GET', '/api/mi/yo', { cookie });
  assert.equal(real.status, 200);

  // Se cambia el id del profesional dentro de la cookie: la firma ya no cuadra.
  const falsa = cookie.replace(/=(\d+)\./, (m, id) => `=${Number(id) + 1}.`);
  assert.notEqual(falsa, cookie, 'la prueba debe alterar algo de verdad');
  const r = await pide('GET', '/api/mi/yo', { cookie: falsa });
  assert.equal(r.status, 401, 'una cookie con la firma rota no debe valer');
});

test('la sesión de Flecos no vale en Barbas', async () => {
  const cookie = await alta('juan', 'u-juan-b', 'barbas.mx');
  assert.equal((await pide('GET', '/api/mi/yo', { cookie, host: 'barbas.mx' })).status, 200);
  assert.equal((await pide('GET', '/api/mi/yo', { cookie, host: 'flecos.mx' })).status, 401,
    'son dos negocios distintos aunque sea la misma persona');
});

// ---------------------------------------------------------------------------
// Mi negocio
// ---------------------------------------------------------------------------

test('se guardan nombre, WhatsApp y ciudad; el teléfono se queda en dígitos', async () => {
  const cookie = await alta('estilos');
  const r = await pide('PUT', '/api/mi/negocio', {
    cookie,
    body: { nombre: 'Estilos Ana', whatsapp: '+52 (686) 123-4567', ciudad: 'Mexicali', regreso_dias: 30 },
  });
  assert.equal(r.status, 200);
  assert.equal(r.json.negocio.nombre, 'Estilos Ana');
  assert.equal(r.json.negocio.whatsapp, '526861234567', 'se guardan solo los dígitos');
  assert.equal(r.json.negocio.regreso_dias, 30);
});

test('un servicio sin nombre o con minutos absurdos no pasa', async () => {
  const cookie = await alta('reglas');
  const malos = [
    { nombre: '', precio: 100, minutos: 30 },
    { nombre: 'Corte', precio: 100, minutos: 0 },
    { nombre: 'Corte', precio: 100, minutos: 900 },
    { nombre: 'Corte', precio: 'doscientos', minutos: 30 },
  ];
  for (const body of malos) {
    const r = await pide('POST', '/api/mi/servicio', { cookie, body });
    assert.equal(r.status, 400, `debió rechazar ${JSON.stringify(body)}`);
  }
});

test('un servicio se agrega, se edita y se archiva', async () => {
  const cookie = await alta('servicios');
  const nuevo = await pide('POST', '/api/mi/servicio', {
    cookie, body: { nombre: 'Tinte', precio: 800, minutos: 90 },
  });
  assert.equal(nuevo.status, 201);
  const id = nuevo.json.servicio.id;

  const editado = await pide('PUT', `/api/mi/servicio/${id}`, {
    cookie, body: { nombre: 'Tinte completo', precio: 900, minutos: 120 },
  });
  assert.equal(editado.json.servicio.nombre, 'Tinte completo');
  assert.equal(editado.json.servicio.minutos, 120);

  await pide('DELETE', `/api/mi/servicio/${id}`, { cookie });
  const lista = await pide('GET', '/api/mi/negocio', { cookie });
  assert.ok(!lista.json.servicios.some((s) => s.id === id), 'archivado no aparece');
});

test('el horario se guarda entero y un día al revés queda cerrado', async () => {
  const cookie = await alta('horario');
  const r = await pide('PUT', '/api/mi/horario', {
    cookie,
    body: {
      dias: [
        { dia: 1, abre: '09:00', cierra: '14:00' },
        { dia: 2, abre: '18:00', cierra: '09:00' },   // cierra antes de abrir
        { dia: 3, abre: 'nada', cierra: '14:00' },    // basura
      ],
    },
  });
  assert.equal(r.json.horario.length, 1, 'solo el lunes es un horario de verdad');
  assert.equal(r.json.horario[0].dia, 1);
});

// ---------------------------------------------------------------------------
// La página pública
// ---------------------------------------------------------------------------

test('la página pública muestra el negocio y sus servicios', async () => {
  const cookie = await alta('publico');
  await pide('PUT', '/api/mi/negocio', { cookie, body: { nombre: 'Barbería Pública', ciudad: 'Tijuana' } });

  const r = await pide('GET', '/api/p/publico');
  assert.equal(r.status, 200);
  assert.equal(r.json.nombre, 'Barbería Pública');
  assert.equal(r.json.ciudad, 'Tijuana');
  assert.equal(r.json.servicios.length, 3);
  assert.equal(r.json.oficio, 'peluquería', 'Flecos es peluquería; Barbas sería barbería');
});

test('una dirección que no existe da 404 en el API y en la página', async () => {
  assert.equal((await pide('GET', '/api/p/nadie-aqui')).status, 404);
  assert.equal((await pide('GET', '/nadie-aqui')).status, 404);
});

test('el HTML de la página pública trae el nombre del negocio, no un {{hueco}}', async () => {
  const r = await pide('GET', '/publico');
  assert.equal(r.status, 200);
  assert.ok(r.texto.includes('Barbería Pública'));
  assert.ok(!r.texto.includes('{{'), 'quedó una plantilla sin rellenar');
});

// ---------------------------------------------------------------------------
// Reservar
// ---------------------------------------------------------------------------

test('un cliente reserva sin cuenta y la cita aparece en la agenda', async () => {
  const cookie = await alta('agenda1');
  const neg = await pide('GET', '/api/mi/negocio', { cookie });
  const corte = neg.json.servicios.find((s) => s.nombre === 'Corte');
  const fecha = proximoDiaHabil();

  const dias = await pide('GET', `/api/p/agenda1/dias?servicio=${corte.id}`);
  assert.ok(dias.json.dias.length > 0, 'debe ofrecer días');

  const dia = dias.json.dias.find((d) => d.fecha === fecha) || dias.json.dias[0];
  const hora = dia.horas[0].hora;

  const r = await pide('POST', '/api/p/agenda1/cita', {
    body: { servicioId: corte.id, fecha: dia.fecha, hora, nombre: 'Luis', telefono: '686 111 2233' },
  });
  assert.equal(r.status, 201);
  assert.equal(r.json.cita.servicio, 'Corte');

  const ag = await pide('GET', `/api/mi/agenda?fecha=${dia.fecha}`, { cookie });
  assert.equal(ag.json.citas.length, 1);
  assert.equal(ag.json.citas[0].cliente, 'Luis');
  assert.equal(ag.json.citas[0].hora, hora);
});

test('la hora que ya se reservó desaparece de las opciones', async () => {
  const cookie = await alta('agenda2');
  const corte = (await pide('GET', '/api/mi/negocio', { cookie })).json.servicios[0];

  const antes = await pide('GET', `/api/p/agenda2/dias?servicio=${corte.id}`);
  const dia = antes.json.dias[0];
  const hora = dia.horas[0].hora;

  await pide('POST', '/api/p/agenda2/cita', {
    body: { servicioId: corte.id, fecha: dia.fecha, hora, nombre: 'Ana', telefono: '6862220000' },
  });

  const despues = await pide('GET', `/api/p/agenda2/dias?servicio=${corte.id}`);
  const mismoDia = despues.json.dias.find((d) => d.fecha === dia.fecha);
  assert.ok(!mismoDia || !mismoDia.horas.some((h) => h.hora === hora),
    'la hora tomada no puede seguir ofreciéndose');
});

test('no se puede reservar en el pasado', async () => {
  const cookie = await alta('pasado');
  const corte = (await pide('GET', '/api/mi/negocio', { cookie })).json.servicios[0];
  const r = await pide('POST', '/api/p/pasado/cita', {
    body: { servicioId: corte.id, fecha: sumarDias(hoy(), -3), hora: '10:00', nombre: 'Tarde', telefono: '6863330000' },
  });
  assert.equal(r.status, 400);
});

test('no se puede reservar fuera del horario', async () => {
  const cookie = await alta('fuera');
  const corte = (await pide('GET', '/api/mi/negocio', { cookie })).json.servicios[0];
  const r = await pide('POST', '/api/p/fuera/cita', {
    body: { servicioId: corte.id, fecha: proximoDiaHabil(), hora: '05:00', nombre: 'Madrugador', telefono: '6864440000' },
  });
  assert.equal(r.status, 400);
  assert.equal(r.json.error, 'fuera de horario');
});

test('un día cerrado no ofrece horas ni acepta citas', async () => {
  const cookie = await alta('cerrado');
  const corte = (await pide('GET', '/api/mi/negocio', { cookie })).json.servicios[0];
  const fecha = proximoDiaHabil();

  await pide('POST', '/api/mi/cerrar', { cookie, body: { fecha, motivo: 'Boda' } });

  const dias = await pide('GET', `/api/p/cerrado/dias?servicio=${corte.id}`);
  assert.ok(!dias.json.dias.some((d) => d.fecha === fecha), 'un día cerrado no se ofrece');

  const r = await pide('POST', '/api/p/cerrado/cita', {
    body: { servicioId: corte.id, fecha, hora: '11:00', nombre: 'Nadie', telefono: '6865550000' },
  });
  assert.equal(r.status, 400);
  assert.equal(r.json.error, 'cerrado');
});

// --- LA CARRERA: dos clientes pidiendo la misma hora ---

test('cinco clientes peleando la misma hora: gana exactamente uno', async () => {
  const cookie = await alta('peleada');
  const corte = (await pide('GET', '/api/mi/negocio', { cookie })).json.servicios[0];
  const dia = (await pide('GET', `/api/p/peleada/dias?servicio=${corte.id}`)).json.dias[0];
  const hora = dia.horas[0].hora;

  const todos = await Promise.all([1, 2, 3, 4, 5].map((n) =>
    pide('POST', '/api/p/peleada/cita', {
      body: { servicioId: corte.id, fecha: dia.fecha, hora, nombre: `Cliente ${n}`, telefono: `68677700${n}0` },
    })));

  assert.equal(todos.filter((r) => r.status === 201).length, 1, 'solo una cita');
  assert.equal(todos.filter((r) => r.status === 409).length, 4, 'las otras cuatro rebotan');
});

test('una cita larga bloquea la hora de en medio, aunque no empiece ahí', async () => {
  const cookie = await alta('encima');
  const servicios = (await pide('GET', '/api/mi/negocio', { cookie })).json.servicios;
  const largo = servicios.find((s) => s.minutos === 60);
  const corto = servicios.find((s) => s.minutos === 30);
  const fecha = proximoDiaHabil();

  // Se fija el horario para no depender de los valores de arranque.
  await pide('PUT', '/api/mi/horario', {
    cookie, body: { dias: [{ dia: diaDeSemana(fecha), abre: '10:00', cierra: '14:00' }] },
  });

  const a = await pide('POST', '/api/p/encima/cita', {
    body: { servicioId: largo.id, fecha, hora: '10:00', nombre: 'Largo', telefono: '6868880000' },
  });
  assert.equal(a.status, 201);

  // 10:30 tiene hora distinta a 10:00, así que un índice UNIQUE no lo
  // atraparía: hay que comparar rangos.
  const b = await pide('POST', '/api/p/encima/cita', {
    body: { servicioId: corto.id, fecha, hora: '10:30', nombre: 'Encimado', telefono: '6868880001' },
  });
  assert.equal(b.status, 409, '10:30 cae dentro de la cita de 10:00 a 11:00');

  const c = await pide('POST', '/api/p/encima/cita', {
    body: { servicioId: corto.id, fecha, hora: '11:00', nombre: 'Justo', telefono: '6868880002' },
  });
  assert.equal(c.status, 201, '11:00 empieza justo cuando termina la otra');
});

// ---------------------------------------------------------------------------
// El cliente que vuelve  ·  MEMORIA
// ---------------------------------------------------------------------------

test('al cliente que vuelve se le reconoce por su teléfono', async () => {
  const cookie = await alta('memoria');
  const corte = (await pide('GET', '/api/mi/negocio', { cookie })).json.servicios[0];
  const dia = (await pide('GET', `/api/p/memoria/dias?servicio=${corte.id}`)).json.dias[0];

  await pide('POST', '/api/p/memoria/cita', {
    body: { servicioId: corte.id, fecha: dia.fecha, hora: dia.horas[0].hora, nombre: 'Luis', telefono: '686 999 0000' },
  });

  // Escrito distinto, mismo número: es la misma persona.
  const soy = await pide('GET', '/api/p/memoria/soy?telefono=' + encodeURIComponent('(686) 999-0000'));
  assert.equal(soy.json.conocido, true);
  assert.equal(soy.json.nombre, 'Luis');
  assert.equal(soy.json.habitual, 'Corte');
  assert.ok(soy.json.proxima, 'ya tiene cita');

  const desconocido = await pide('GET', '/api/p/memoria/soy?telefono=6860000001');
  assert.equal(desconocido.json.conocido, false);
});

test('las notas del cliente NUNCA salen por la parte pública', async () => {
  const cookie = await alta('privado');
  const corte = (await pide('GET', '/api/mi/negocio', { cookie })).json.servicios[0];
  const dia = (await pide('GET', `/api/p/privado/dias?servicio=${corte.id}`)).json.dias[0];
  await pide('POST', '/api/p/privado/cita', {
    body: { servicioId: corte.id, fecha: dia.fecha, hora: dia.horas[0].hora, nombre: 'Luis', telefono: '6861234567' },
  });

  const lista = await pide('GET', '/api/mi/clientes', { cookie });
  const id = lista.json.clientes[0].id;
  const secreto = 'No le gusta que le hablen';
  await pide('PUT', `/api/mi/cliente/${id}/notas`, { cookie, body: { notas: secreto } });

  // El profesional sí las ve.
  const ficha = await pide('GET', `/api/mi/cliente/${id}`, { cookie });
  assert.equal(ficha.json.notas, secreto);

  // Nadie más. Ni en la portada, ni reconociéndose, ni en el HTML.
  for (const ruta of ['/api/p/privado', '/api/p/privado/soy?telefono=6861234567', '/privado']) {
    const r = await pide('GET', ruta);
    assert.ok(!r.texto.includes(secreto), `las notas se filtraron en ${ruta}`);
  }
});

test('la ficha junta historial, servicio habitual y días sin venir', async () => {
  const cookie = await alta('ficha');
  const servicios = (await pide('GET', '/api/mi/negocio', { cookie })).json.servicios;
  const corte = servicios.find((s) => s.nombre === 'Corte');

  // Dos visitas viejas y una futura, metidas a mano: hacer pasar el tiempo
  // de verdad no es opción en una prueba.
  const pro = db.prepare("SELECT id FROM handles WHERE brand='flecos' AND handle='ficha'").get();
  const cli = db.prepare('INSERT INTO clientes (handle_id, nombre, telefono, creado) VALUES (?,?,?,?)')
    .run(pro.id, 'Carlos', '6867777777', Date.now()).lastInsertRowid;
  const meter = (fecha, servicio) => db.prepare(`
    INSERT INTO citas (handle_id, cliente_id, servicio_id, servicio, precio, fecha, hora, minutos, estado, origen, creado)
    VALUES (?,?,?,?,?,?,'10:00',30,'cumplida','profesional',?)`)
    .run(pro.id, cli, corte.id, servicio, 250, fecha, Date.now());

  meter(sumarDias(hoy(), -60), 'Corte');
  meter(sumarDias(hoy(), -24), 'Corte');
  meter(sumarDias(hoy(), -40), 'Barba');

  const f = await pide('GET', `/api/mi/cliente/${cli}`, { cookie });
  assert.equal(f.json.nombre, 'Carlos');
  assert.equal(f.json.habitual, 'Corte', 'se hace corte dos de cada tres veces');
  assert.equal(f.json.dias_sin_venir, 24);
  assert.equal(f.json.historial.length, 3);
  assert.equal(f.json.historial[0].fecha, sumarDias(hoy(), -24), 'el historial va del más reciente al más viejo');
});

// ---------------------------------------------------------------------------
// Regresos  ·  "Flecos hace que regresen"
// ---------------------------------------------------------------------------

test('aparece quien ya pasó de su tiempo, y no quien ya tiene cita', async () => {
  const cookie = await alta('don-regreso');
  const pro = db.prepare("SELECT id FROM handles WHERE brand='flecos' AND handle='don-regreso'").get();

  const crear = (nombre, tel) => db
    .prepare('INSERT INTO clientes (handle_id, nombre, telefono, creado) VALUES (?,?,?,?)')
    .run(pro.id, nombre, tel, Date.now()).lastInsertRowid;
  const visita = (cli, fecha, estado = 'cumplida') => db.prepare(`
    INSERT INTO citas (handle_id, cliente_id, servicio_id, servicio, precio, fecha, hora, minutos, estado, origen, creado)
    VALUES (?,?,NULL,'Corte',250,?,'10:00',30,?,'profesional',?)`)
    .run(pro.id, cli, fecha, estado, Date.now());

  const carlos = crear('Carlos', '6860000011');   // hace 30 días: le toca
  const luis = crear('Luis', '6860000022');       // hace 40 días PERO ya viene
  const ana = crear('Ana', '6860000033');         // hace 5 días: todavía no

  visita(carlos, sumarDias(hoy(), -30));
  visita(luis, sumarDias(hoy(), -40));
  visita(luis, sumarDias(hoy(), 3), 'reservada');
  visita(ana, sumarDias(hoy(), -5));

  const r = await pide('GET', '/api/mi/regresos', { cookie });
  assert.equal(r.json.regreso_dias, 21, 'el default son 3 semanas');

  const nombres = r.json.clientes.map((c) => c.nombre);
  assert.deepEqual(nombres, ['Carlos'], 'solo Carlos: Luis ya tiene cita y Ana acaba de venir');
  assert.equal(r.json.clientes[0].dias, 30);
});

test('cambiar el tiempo típico cambia a quién hay que llamar', async () => {
  const cookie = await alta('regresos2');
  const pro = db.prepare("SELECT id FROM handles WHERE brand='flecos' AND handle='regresos2'").get();
  const cli = db.prepare('INSERT INTO clientes (handle_id, nombre, telefono, creado) VALUES (?,?,?,?)')
    .run(pro.id, 'Roberto', '6860000044', Date.now()).lastInsertRowid;
  db.prepare(`INSERT INTO citas (handle_id, cliente_id, servicio_id, servicio, precio, fecha, hora, minutos, estado, origen, creado)
    VALUES (?,?,NULL,'Corte',250,?,'10:00',30,'cumplida','profesional',?)`)
    .run(pro.id, cli, sumarDias(hoy(), -25), Date.now());

  assert.equal((await pide('GET', '/api/mi/regresos', { cookie })).json.clientes.length, 1,
    'con 21 días de default, 25 ya es tarde');

  await pide('PUT', '/api/mi/negocio', { cookie, body: { regreso_dias: 45 } });
  assert.equal((await pide('GET', '/api/mi/regresos', { cookie })).json.clientes.length, 0,
    'con 45 días todavía no le toca');
});

// ---------------------------------------------------------------------------
// Que un negocio no vea el de otro
// ---------------------------------------------------------------------------

test('cada quien ve solo a sus clientes y sus citas', async () => {
  const unoCookie = await alta('vecino-uno');
  const dosCookie = await alta('vecino-dos');

  const corte = (await pide('GET', '/api/mi/negocio', { cookie: unoCookie })).json.servicios[0];
  const dia = (await pide('GET', `/api/p/vecino-uno/dias?servicio=${corte.id}`)).json.dias[0];
  await pide('POST', '/api/p/vecino-uno/cita', {
    body: { servicioId: corte.id, fecha: dia.fecha, hora: dia.horas[0].hora, nombre: 'Cliente de Uno', telefono: '6869990001' },
  });

  const mios = await pide('GET', '/api/mi/clientes', { cookie: unoCookie });
  assert.equal(mios.json.clientes.length, 1);
  const ajenos = await pide('GET', '/api/mi/clientes', { cookie: dosCookie });
  assert.equal(ajenos.json.clientes.length, 0, 'el vecino no ve a mis clientes');

  // Ni pidiendo la ficha por su número directo.
  const id = mios.json.clientes[0].id;
  assert.equal((await pide('GET', `/api/mi/cliente/${id}`, { cookie: dosCookie })).status, 404,
    'no debe poder leer la ficha de un cliente ajeno cambiando el número de la URL');
});
