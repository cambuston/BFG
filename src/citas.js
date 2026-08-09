// Clientes y citas: las otras dos patas.
//
//   Citas    → reservar sin empalmes
//   Regreso  → quién ya debería haber vuelto
//   Memoria  → las notas del cliente
//
// ---------------------------------------------------------------------------
// EL CANDADO CONTRA LA DOBLE RESERVA
// ---------------------------------------------------------------------------
//
// Dos clientes pueden pedir las 10:00 del viernes en el mismo segundo. Un
// índice UNIQUE no basta aquí (como sí bastó con los identificadores): una
// cita de 60 min a las 10:00 y otra de 30 a las 10:30 tienen hora distinta y
// aun así se encanan. Hay que comparar rangos, no valores.
//
// Por eso `reservar` corre dentro de db.transaction(): revisa los empalmes e
// inserta sin que nadie se meta en medio. Esto es de verdad hermético aquí y
// vale la pena saber por qué: better-sqlite3 es SÍNCRONO y Node tiene un solo
// hilo, así que mientras corre la transacción no puede ejecutarse ni una línea
// de otra petición. No hay ventana entre el "está libre" y el INSERT.
//
// (Si algún día esto corre en varios procesos contra la misma base, la
// transacción de SQLite sigue protegiendo: el segundo escritor espera.)

const { db } = require('./db');
const negocio = require('./negocio');
const { horasLibres, seEnciman, aMinutos, fechaValida, diaDeSemana, hoy, ahoraHora, diasEntre } = require('./agenda');

const q = {
  porTelefono: db.prepare('SELECT * FROM clientes WHERE handle_id = ? AND telefono = ?'),
  clientePorId: db.prepare('SELECT * FROM clientes WHERE id = ? AND handle_id = ?'),
  crearCliente: db.prepare('INSERT INTO clientes (handle_id, nombre, telefono, creado) VALUES (?, ?, ?, ?)'),
  renombrarCliente: db.prepare('UPDATE clientes SET nombre = ? WHERE id = ?'),
  guardarNotas: db.prepare('UPDATE clientes SET notas = ? WHERE id = ? AND handle_id = ?'),

  crearCita: db.prepare(`
    INSERT INTO citas (handle_id, cliente_id, servicio_id, servicio, precio,
                       fecha, hora, minutos, estado, origen, creado)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'reservada', ?, ?)`),

  delDia: db.prepare(`
    SELECT ci.*, c.nombre AS cliente, c.telefono, c.notas
    FROM citas ci JOIN clientes c ON c.id = ci.cliente_id
    WHERE ci.handle_id = ? AND ci.fecha = ? AND ci.estado != 'cancelada'
    ORDER BY ci.hora`),

  ocupadasDe: db.prepare(`
    SELECT hora, minutos FROM citas
    WHERE handle_id = ? AND fecha = ? AND estado != 'cancelada'`),

  citaPorId: db.prepare('SELECT * FROM citas WHERE id = ? AND handle_id = ?'),
  cambiarEstado: db.prepare('UPDATE citas SET estado = ? WHERE id = ? AND handle_id = ?'),

  historial: db.prepare(`
    SELECT * FROM citas WHERE cliente_id = ? AND estado != 'cancelada'
    ORDER BY fecha DESC, hora DESC LIMIT 50`),

  proxima: db.prepare(`
    SELECT * FROM citas
    WHERE cliente_id = ? AND estado = 'reservada' AND fecha >= ?
    ORDER BY fecha, hora LIMIT 1`),

  // El servicio que más repite: "su corte de siempre".
  habitual: db.prepare(`
    SELECT servicio_id, servicio, COUNT(*) AS veces FROM citas
    WHERE cliente_id = ? AND estado != 'cancelada'
    GROUP BY servicio ORDER BY veces DESC, MAX(fecha) DESC LIMIT 1`),
};

const soloDigitos = negocio.soloDigitos;
const limpiarNombre = (v) => negocio.texto(v, 80);

// ---------------------------------------------------------------------------
// Clientes
// ---------------------------------------------------------------------------

// El teléfono es la identidad del cliente dentro de un negocio: con eso lo
// reconocemos cuando vuelve, sin pedirle cuenta ni contraseña.
//
// Si ya existía y ahora escribe su nombre distinto ("Luis" → "Luis Pérez"),
// se queda el nuevo: casi siempre es una corrección.
function buscarOCrear(handleId, { nombre, telefono }) {
  const tel = soloDigitos(telefono);
  const nom = limpiarNombre(nombre);
  if (!nom) return { ok: false, error: 'nombre' };

  if (tel) {
    const ya = q.porTelefono.get(handleId, tel);
    if (ya) {
      if (nom !== ya.nombre) q.renombrarCliente.run(nom, ya.id);
      return { ok: true, cliente: q.clientePorId.get(ya.id, handleId), nuevo: false };
    }
  }

  const info = q.crearCliente.run(handleId, nom, tel, Date.now());
  return { ok: true, cliente: q.clientePorId.get(info.lastInsertRowid, handleId), nuevo: true };
}

const cliente = (handleId, id) => q.clientePorId.get(id, handleId) || null;

// Busca por nombre o por teléfono. Sin término, los devuelve todos con su
// última visita — que es como se ve la lista de Clientes.
function buscarClientes(handleId, termino = '') {
  const t = String(termino || '').trim();
  const like = `%${t.toLowerCase()}%`;
  const digitos = soloDigitos(t);

  return db.prepare(`
    SELECT c.*,
           (SELECT MAX(fecha) FROM citas WHERE cliente_id = c.id AND estado != 'cancelada' AND fecha <= ?) AS ultima,
           (SELECT COUNT(*)   FROM citas WHERE cliente_id = c.id AND estado != 'cancelada') AS visitas
    FROM clientes c
    WHERE c.handle_id = ?
      AND (? = '' OR LOWER(c.nombre) LIKE ? OR (c.telefono IS NOT NULL AND ? != '' AND c.telefono LIKE ?))
    ORDER BY (ultima IS NULL), ultima DESC, c.nombre
    LIMIT 200
  `).all(hoy(), handleId, t, like, digitos || '', `%${digitos || 'x'}%`);
}

function guardarNotas(handleId, clienteId, notas) {
  const texto = String(notas == null ? '' : notas).trim().slice(0, 2000) || null;
  return Boolean(q.guardarNotas.run(texto, clienteId, handleId).changes);
}

// La ficha completa: quién es, qué se hace siempre, cuándo vuelve, qué le
// gusta. Es la pantalla central del producto.
function ficha(handleId, clienteId) {
  const c = cliente(handleId, clienteId);
  if (!c) return null;
  const hist = q.historial.all(clienteId);
  const hab = q.habitual.get(clienteId);
  const prox = q.proxima.get(clienteId, hoy());
  const ultima = hist.find((x) => x.fecha <= hoy()) || null;

  return {
    ...c,
    habitual: hab ? hab.servicio : null,
    proxima: prox || null,
    ultima: ultima || null,
    dias_sin_venir: ultima ? diasEntre(ultima.fecha, hoy()) : null,
    historial: hist,
  };
}

// ---------------------------------------------------------------------------
// Reservar
// ---------------------------------------------------------------------------

// Los huecos de un día, ya descontando lo reservado, lo cerrado y lo que ya
// pasó si el día es hoy.
function huecos(handleId, fecha, minutos) {
  if (!fechaValida(fecha)) return [];
  if (fecha < hoy()) return [];                       // el pasado no se reserva
  if (negocio.cerrado(handleId, fecha)) return [];    // vacaciones, día suelto

  const franja = negocio.franjaDe(handleId, diaDeSemana(fecha));
  if (!franja) return [];                             // ese día no trabaja

  return horasLibres({
    franja,
    minutos,
    ocupadas: q.ocupadasDe.all(handleId, fecha),
    // Hoy no se ofrecen horas que ya pasaron.
    desde: fecha === hoy() ? ahoraHora() : null,
  });
}

// Los próximos `cuantos` días que tienen al menos un hueco. Es lo que ve el
// cliente al reservar: no un calendario entero, solo los días que sirven.
function diasConHueco(handleId, minutos, cuantos = 14, desde = null) {
  const inicio = desde || hoy();
  const dias = [];
  for (let i = 0; i < 60 && dias.length < cuantos; i++) {
    const fecha = require('./agenda').sumarDias(inicio, i);
    const libres = huecos(handleId, fecha, minutos);
    if (libres.length) dias.push({ fecha, horas: libres });
  }
  return dias;
}

// LA operación delicada. Ver el comentario de arriba del archivo.
const reservarTx = db.transaction((handleId, datos) => {
  const { clienteId, servicio, fecha, hora, minutos, origen } = datos;

  // Se vuelve a comprobar TODO aquí dentro, aunque el navegador ya lo haya
  // visto: entre que se pintó la lista de horas y este momento pudo cambiar
  // el horario, cerrarse el día o llenarse el hueco.
  if (negocio.cerrado(handleId, fecha)) return { ok: false, error: 'cerrado' };

  const franja = negocio.franjaDe(handleId, diaDeSemana(fecha));
  if (!franja) return { ok: false, error: 'cerrado' };

  const inicio = aMinutos(hora);
  const abre = aMinutos(franja.abre);
  const cierra = aMinutos(franja.cierra);
  if (inicio === null || inicio < abre || inicio + minutos > cierra) {
    return { ok: false, error: 'fuera de horario' };
  }

  for (const c of q.ocupadasDe.all(handleId, fecha)) {
    if (seEnciman(inicio, minutos, aMinutos(c.hora), c.minutos)) {
      return { ok: false, error: 'ocupado' };
    }
  }

  const info = q.crearCita.run(
    handleId, clienteId, servicio.id || null, servicio.nombre, servicio.precio,
    fecha, hora, minutos, origen || 'cliente', Date.now()
  );
  return { ok: true, cita: q.citaPorId.get(info.lastInsertRowid, handleId) };
});

// Reservar de verdad, con todo lo que llega del formulario.
function reservar(handleId, datos = {}) {
  if (!fechaValida(datos.fecha)) return { ok: false, error: 'fecha' };
  if (datos.fecha < hoy()) return { ok: false, error: 'pasado' };
  if (aMinutos(datos.hora) === null) return { ok: false, error: 'hora' };

  const serv = negocio.servicio(Number(datos.servicioId), handleId);
  if (!serv) return { ok: false, error: 'servicio' };

  const persona = buscarOCrear(handleId, { nombre: datos.nombre, telefono: datos.telefono });
  if (!persona.ok) return persona;

  const r = reservarTx(handleId, {
    clienteId: persona.cliente.id,
    servicio: { id: serv.id, nombre: serv.nombre, precio: serv.precio },
    fecha: datos.fecha,
    hora: datos.hora,
    minutos: serv.minutos,
    origen: datos.origen === 'profesional' ? 'profesional' : 'cliente',
  });
  if (!r.ok) return r;

  return { ok: true, cita: r.cita, cliente: persona.cliente, nuevo: persona.nuevo };
}

const delDia = (handleId, fecha) => q.delDia.all(handleId, fecha);
const cita = (handleId, id) => q.citaPorId.get(id, handleId) || null;

function cambiarEstado(handleId, id, estado) {
  if (!['reservada', 'cumplida', 'cancelada'].includes(estado)) return false;
  return Boolean(q.cambiarEstado.run(estado, id, handleId).changes);
}

// ---------------------------------------------------------------------------
// Regresos — "Flecos hace que regresen"
// ---------------------------------------------------------------------------
//
// Quién ya pasó de su tiempo típico sin venir Y no tiene cita agendada. Lo
// segundo es lo que evita el error tonto de recordarle a alguien que vuelva
// cuando ya viene el jueves.
function regresos(handleId, dias = null) {
  const n = negocio.de(handleId);
  const limite = Number.isFinite(Number(dias)) && Number(dias) > 0 ? Number(dias) : n.regreso_dias;
  const ahora = hoy();

  const filas = db.prepare(`
    SELECT c.*,
           MAX(ci.fecha) AS ultima,
           COUNT(*) AS visitas
    FROM clientes c
    JOIN citas ci ON ci.cliente_id = c.id AND ci.estado != 'cancelada' AND ci.fecha <= ?
    WHERE c.handle_id = ?
      AND NOT EXISTS (
        SELECT 1 FROM citas f
        WHERE f.cliente_id = c.id AND f.estado = 'reservada' AND f.fecha > ?
      )
    GROUP BY c.id
    ORDER BY ultima
  `).all(ahora, handleId, ahora);

  return filas
    .map((f) => ({ ...f, dias: diasEntre(f.ultima, ahora) }))
    .filter((f) => f.dias >= limite)
    .map((f) => ({ ...f, habitual: (q.habitual.get(f.id) || {}).servicio || null }));
}

module.exports = {
  buscarOCrear, cliente, buscarClientes, guardarNotas, ficha,
  huecos, diasConHueco, reservar, delDia, cita, cambiarEstado,
  regresos,
};
