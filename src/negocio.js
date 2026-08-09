// Mi negocio: nombre, WhatsApp, servicios y horario.
//
// Todo lo que el profesional configura una vez y casi nunca vuelve a tocar,
// pero de lo que cuelga todo lo demás: sin servicios no hay qué reservar, y
// sin horario no hay cuándo.

const { db } = require('./db');
const { aMinutos, fechaValida } = require('./agenda');

// ---------------------------------------------------------------------------
// Con qué empieza un negocio recién dado de alta
// ---------------------------------------------------------------------------
//
// NO se le deja la pantalla en blanco. Un peluquero que acaba de darse de alta
// ya tiene página que funciona y citas que se pueden reservar; si sus precios
// son otros, los cambia. Pedirle que configure nueve cosas antes de ver nada
// es la forma más segura de que no vuelva.
//
// Los precios salen de ideas.txt, que es lo que Luis puso de ejemplo.
const SERVICIOS_INICIALES = [
  { nombre: 'Corte', precio: 250, minutos: 30 },
  { nombre: 'Barba', precio: 150, minutos: 30 },
  { nombre: 'Corte + barba', precio: 350, minutos: 60 },
];

// Lunes a viernes 10–19, sábado 9–15, domingo cerrado.
const HORARIO_INICIAL = [
  { dia: 1, abre: '10:00', cierra: '19:00' },
  { dia: 2, abre: '10:00', cierra: '19:00' },
  { dia: 3, abre: '10:00', cierra: '19:00' },
  { dia: 4, abre: '10:00', cierra: '19:00' },
  { dia: 5, abre: '10:00', cierra: '19:00' },
  { dia: 6, abre: '09:00', cierra: '15:00' },
];

const q = {
  negocio: db.prepare('SELECT * FROM negocio WHERE handle_id = ?'),
  crearNegocio: db.prepare('INSERT OR IGNORE INTO negocio (handle_id, nombre, actualizado) VALUES (?, ?, ?)'),
  guardarNegocio: db.prepare(`
    UPDATE negocio SET nombre = ?, whatsapp = ?, ciudad = ?, regreso_dias = ?, actualizado = ?
    WHERE handle_id = ?`),

  servicios: db.prepare('SELECT * FROM servicios WHERE handle_id = ? AND activo = 1 ORDER BY orden, id'),
  servicio: db.prepare('SELECT * FROM servicios WHERE id = ? AND handle_id = ?'),
  crearServicio: db.prepare(`
    INSERT INTO servicios (handle_id, nombre, precio, minutos, orden, creado)
    VALUES (?, ?, ?, ?, ?, ?)`),
  editarServicio: db.prepare(`
    UPDATE servicios SET nombre = ?, precio = ?, minutos = ? WHERE id = ? AND handle_id = ?`),
  archivarServicio: db.prepare('UPDATE servicios SET activo = 0 WHERE id = ? AND handle_id = ?'),
  maxOrden: db.prepare('SELECT COALESCE(MAX(orden), 0) AS n FROM servicios WHERE handle_id = ?'),

  horario: db.prepare('SELECT dia, abre, cierra FROM horario WHERE handle_id = ? ORDER BY dia'),
  franja: db.prepare('SELECT abre, cierra FROM horario WHERE handle_id = ? AND dia = ?'),
  borrarHorario: db.prepare('DELETE FROM horario WHERE handle_id = ?'),
  ponerDia: db.prepare('INSERT INTO horario (handle_id, dia, abre, cierra) VALUES (?, ?, ?, ?)'),

  cerrados: db.prepare('SELECT fecha, motivo FROM cerrados WHERE handle_id = ? AND fecha >= ? ORDER BY fecha'),
  estaCerrado: db.prepare('SELECT 1 AS si FROM cerrados WHERE handle_id = ? AND fecha = ?'),
  cerrar: db.prepare('INSERT OR REPLACE INTO cerrados (handle_id, fecha, motivo) VALUES (?, ?, ?)'),
  abrir: db.prepare('DELETE FROM cerrados WHERE handle_id = ? AND fecha = ?'),
};

// Se llama justo después del alta. Transacción: o queda todo el negocio
// montado, o no queda nada a medias.
const estrenar = db.transaction((handleId, nombre) => {
  q.crearNegocio.run(handleId, nombre || null, Date.now());
  const ahora = Date.now();
  SERVICIOS_INICIALES.forEach((s, i) => {
    q.crearServicio.run(handleId, s.nombre, s.precio, s.minutos, i + 1, ahora);
  });
  for (const h of HORARIO_INICIAL) q.ponerDia.run(handleId, h.dia, h.abre, h.cierra);
});

// El negocio siempre existe: si falta la fila (base vieja), se estrena al vuelo.
function de(handleId) {
  let n = q.negocio.get(handleId);
  if (!n) {
    estrenar(handleId, null);
    n = q.negocio.get(handleId);
  }
  return n;
}

const servicios = (handleId) => q.servicios.all(handleId);
const servicio = (id, handleId) => q.servicio.get(id, handleId);
const horario = (handleId) => q.horario.all(handleId);
const franjaDe = (handleId, dia) => q.franja.get(handleId, dia) || null;
const cerradosDesde = (handleId, fecha) => q.cerrados.all(handleId, fecha);
const cerrado = (handleId, fecha) => Boolean(q.estaCerrado.get(handleId, fecha));

// --- escrituras, todas con lo que llega del formulario ya limpio ---

const texto = (v, max) => {
  const s = String(v == null ? '' : v).trim().replace(/\s+/g, ' ');
  return s ? s.slice(0, max) : null;
};

// WhatsApp: se guardan solo los dígitos. La gente escribe "686 123 4567",
// "+52 686-1234567" o "(686) 1234567" y todas son el mismo número.
const soloDigitos = (v) => {
  const d = String(v == null ? '' : v).replace(/\D/g, '');
  return d ? d.slice(0, 15) : null;
};

function guardar(handleId, datos) {
  const n = de(handleId);
  const dias = Number(datos.regreso_dias);
  q.guardarNegocio.run(
    texto(datos.nombre, 80),
    soloDigitos(datos.whatsapp),
    texto(datos.ciudad, 60),
    Number.isFinite(dias) && dias >= 1 && dias <= 365 ? Math.round(dias) : n.regreso_dias,
    Date.now(),
    handleId
  );
  return de(handleId);
}

// Devuelve { ok, error } — el mensaje para la persona se arma en el navegador.
function revisarServicio(datos) {
  const nombre = texto(datos.nombre, 60);
  if (!nombre) return { ok: false, error: 'nombre' };

  const minutos = Number(datos.minutos);
  if (!Number.isFinite(minutos) || minutos < 5 || minutos > 480) return { ok: false, error: 'minutos' };

  // El precio puede faltar ("sobre pedido"), pero si viene tiene que ser un
  // número: un servicio con precio "doscientos" rompería la página pública.
  let precio = null;
  if (datos.precio !== '' && datos.precio != null) {
    const p = Number(datos.precio);
    if (!Number.isFinite(p) || p < 0 || p > 1000000) return { ok: false, error: 'precio' };
    precio = Math.round(p);
  }

  return { ok: true, nombre, minutos: Math.round(minutos), precio };
}

function agregarServicio(handleId, datos) {
  const r = revisarServicio(datos);
  if (!r.ok) return r;
  const orden = q.maxOrden.get(handleId).n + 1;
  const info = q.crearServicio.run(handleId, r.nombre, r.precio, r.minutos, orden, Date.now());
  return { ok: true, servicio: q.servicio.get(info.lastInsertRowid, handleId) };
}

function editarServicio(handleId, id, datos) {
  const r = revisarServicio(datos);
  if (!r.ok) return r;
  const info = q.editarServicio.run(r.nombre, r.precio, r.minutos, id, handleId);
  if (!info.changes) return { ok: false, error: 'no existe' };
  return { ok: true, servicio: q.servicio.get(id, handleId) };
}

// Archivar, no borrar: las citas viejas tienen que poder seguir diciendo qué
// servicio fueron.
function archivarServicio(handleId, id) {
  return Boolean(q.archivarServicio.run(id, handleId).changes);
}

// El horario se guarda entero de una vez: es más simple de razonar que ir
// día por día, y son siete filas.
const guardarHorario = db.transaction((handleId, dias) => {
  q.borrarHorario.run(handleId);
  for (const d of Array.isArray(dias) ? dias : []) {
    const dia = Number(d.dia);
    if (!Number.isInteger(dia) || dia < 0 || dia > 6) continue;
    const abre = aMinutos(d.abre);
    const cierra = aMinutos(d.cierra);
    // Un día sin horas, o que cierra antes de abrir, es un día cerrado.
    if (abre === null || cierra === null || cierra <= abre) continue;
    q.ponerDia.run(handleId, dia, d.abre, d.cierra);
  }
});

function cerrarDia(handleId, fecha, motivo) {
  if (!fechaValida(fecha)) return false;
  q.cerrar.run(handleId, fecha, texto(motivo, 60));
  return true;
}

function abrirDia(handleId, fecha) {
  return Boolean(q.abrir.run(handleId, fecha).changes);
}

module.exports = {
  SERVICIOS_INICIALES, HORARIO_INICIAL,
  estrenar, de, guardar,
  servicios, servicio, agregarServicio, editarServicio, archivarServicio,
  horario, franjaDe, guardarHorario,
  cerradosDesde, cerrado, cerrarDia, abrirDia,
  soloDigitos, texto,
};
