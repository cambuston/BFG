// Recordatorios — "Flecos hace que regresen", pero sin que se le olvide a nadie.
//
// ---------------------------------------------------------------------------
// POR QUÉ ESTO NO MANDA MENSAJES SOLO
// ---------------------------------------------------------------------------
//
// La tentación era que el servidor mandara los WhatsApp por su cuenta. No se
// hizo, y no es por flojera:
//
//   1. Mandar de verdad exige WhatsApp Business API, plantillas aprobadas por
//      Meta y pagar por mensaje. Fuera de "un solo código, dos apps" y de que
//      Juan pueda usarlo el día que se registra.
//   2. Un mensaje que sale del número personal de Juan lo contesta Juan. Uno
//      que sale de un robot con número desconocido lo ignora el cliente. El
//      canal ES el número de siempre; eso no se puede automatizar sin perderlo.
//
// Así que lo automático es lo que de verdad se olvida: ACORDARSE de a quién
// hay que escribirle y QUÉ decirle. El toque de "enviar" lo da Juan, y le
// cuesta un dedo.
//
// Este módulo, entonces, hace tres cosas:
//
//   - calcula la cola de avisos pendientes (citas de mañana + quién no vuelve),
//   - escribe el mensaje ya listo, con el nombre del cliente y del negocio,
//   - se acuerda de a quién ya se le escribió, para no repetir.
//
// Lo tercero es lo único que se guarda en la base. La cola no: se recalcula
// cada vez desde la agenda, porque la agenda cambia y una cola guardada se
// queda vieja (una cita cancelada anoche no debe recordarse hoy).

const { db } = require('./db');
const negocio = require('./negocio');
const citas = require('./citas');
const { hoy, sumarDias, bonita, fechaBonita } = require('./agenda');

const q = {
  // Las citas de un día que todavía están en pie. Se recuerdan las de mañana:
  // hoy ya es tarde para avisar y pasado mañana todavía se les olvida.
  delDia: db.prepare(`
    SELECT ci.id, ci.cliente_id, ci.fecha, ci.hora, ci.servicio,
           c.nombre, c.telefono,
           r.id AS aviso
    FROM citas ci
    JOIN clientes c ON c.id = ci.cliente_id
    LEFT JOIN recordatorios r ON r.cita_id = ci.id
    WHERE ci.handle_id = ? AND ci.fecha = ? AND ci.estado = 'reservada'
    ORDER BY ci.hora`),

  // El último aviso de regreso que se le mandó a alguien. Se compara contra su
  // última visita: si el aviso es POSTERIOR, ya se le dijo y no ha vuelto.
  ultimoRegreso: db.prepare(`
    SELECT MAX(fecha) AS fecha FROM recordatorios
    WHERE cliente_id = ? AND tipo = 'regreso'`),

  // INSERT OR IGNORE + el índice único de cita_id: tocar el botón dos veces,
  // o tenerlo abierto en dos teléfonos, no manda el aviso dos veces.
  anotar: db.prepare(`
    INSERT OR IGNORE INTO recordatorios (handle_id, cliente_id, tipo, cita_id, fecha, enviado)
    VALUES (?, ?, ?, ?, ?, ?)`),
};

// ---------------------------------------------------------------------------
// Los mensajes
// ---------------------------------------------------------------------------
//
// Cortos y en primera persona, porque salen del teléfono de Juan y tienen que
// sonar a Juan. Nada de "Estimado cliente" ni de "Este es un recordatorio
// automático": en cuanto suena a robot, deja de funcionar.
//
// Van sin emojis a propósito: el mensaje se abre en WhatsApp para que Juan lo
// pueda editar antes de mandarlo, y ahí él pone los que quiera.

function mensajeCita(cita, nombreNegocio) {
  const donde = nombreNegocio ? ` en ${nombreNegocio}` : '';
  return `Hola ${cita.nombre}, te recuerdo tu cita de mañana a las ${bonita(cita.hora)}`
    + `${donde} para ${cita.servicio}. ¿Todo bien o la movemos?`;
}

function mensajeRegreso(cliente) {
  // Si sabemos qué se hace siempre, se lo ofrecemos por su nombre: es la
  // diferencia entre "¿vienes?" y "te conozco".
  const suyo = cliente.habitual ? ` para tu ${cliente.habitual.toLowerCase()}` : '';
  return `Hola ${cliente.nombre}, hace ${cliente.dias} días que no te veo.`
    + ` ¿Te aparto lugar esta semana${suyo}?`;
}

// El mensaje viaja dentro de la liga: WhatsApp lo abre ya escrito y Juan solo
// le da enviar (o lo corrige antes, que también vale).
function enlaceWhatsApp(telefono, mensaje) {
  if (!telefono) return null;
  return `https://wa.me/${telefono}?text=${encodeURIComponent(mensaje)}`;
}

// ---------------------------------------------------------------------------
// La cola
// ---------------------------------------------------------------------------

// ¿Ya se le dijo que vuelva, y sigue sin volver?
function avisadoDeRegreso(clienteId, ultimaVisita) {
  const r = q.ultimoRegreso.get(clienteId);
  if (!r || !r.fecha) return false;
  // Estricto: un aviso del mismo día que la visita es de antes de que viniera.
  return r.fecha > ultimaVisita;
}

// Las citas de mañana que hay que recordar hoy.
function citasDeManana(handleId, fecha = null) {
  const manana = sumarDias(fecha || hoy(), 1);
  const nombre = negocio.de(handleId).nombre;

  return q.delDia.all(handleId, manana).map((c) => {
    const mensaje = mensajeCita(c, nombre);
    return {
      tipo: 'cita',
      cita_id: c.id,
      cliente_id: c.cliente_id,
      nombre: c.nombre,
      telefono: c.telefono || null,
      fecha: c.fecha,
      hora: c.hora,
      hora_bonita: bonita(c.hora),
      servicio: c.servicio,
      mensaje,
      whatsapp: enlaceWhatsApp(c.telefono, mensaje),
      avisado: Boolean(c.aviso),
    };
  });
}

// Quién ya se pasó de su tiempo sin venir. Sale de citas.regresos(), que es
// donde vive esa cuenta desde antes: aquí solo se le suma el mensaje y la
// memoria de a quién ya se le escribió.
function regresosPendientes(handleId) {
  return citas.regresos(handleId).map((c) => {
    const mensaje = mensajeRegreso(c);
    return {
      tipo: 'regreso',
      cliente_id: c.id,
      nombre: c.nombre,
      telefono: c.telefono || null,
      dias: c.dias,
      ultima: c.ultima,
      habitual: c.habitual || null,
      mensaje,
      whatsapp: enlaceWhatsApp(c.telefono, mensaje),
      avisado: avisadoDeRegreso(c.id, c.ultima),
    };
  });
}

// Todo lo que la pantalla necesita, de un viaje.
function pendientes(handleId, fecha = null) {
  const dia = fecha || hoy();
  const manana = sumarDias(dia, 1);
  const listaCitas = citasDeManana(handleId, dia);
  const listaRegresos = regresosPendientes(handleId);
  const faltan = (l) => l.filter((x) => !x.avisado && x.telefono).length;

  return {
    fecha: dia,
    manana,
    manana_bonita: fechaBonita(manana),
    regreso_dias: negocio.de(handleId).regreso_dias,
    citas: listaCitas,
    regresos: listaRegresos,
    // Lo que va en la pastilla de la pestaña: solo lo que de verdad falta por
    // hacer. Sin teléfono no hay nada que Juan pueda tocar.
    pendientes: faltan(listaCitas) + faltan(listaRegresos),
  };
}

// ---------------------------------------------------------------------------
// Anotar que ya se avisó
// ---------------------------------------------------------------------------
//
// El handle_id NUNCA viene del navegador: llega de la sesión y se usa para
// comprobar que la cita o el cliente son de este negocio. Sin esto, cambiar un
// número en la petición dejaría marcar avisos ajenos.
function marcar(handleId, { tipo, citaId, clienteId } = {}, ahora = Date.now()) {
  const cuando = hoy(new Date(ahora));

  if (tipo === 'cita') {
    const cita = citas.cita(handleId, Number(citaId));
    if (!cita) return { ok: false, error: 'no existe' };
    q.anotar.run(handleId, cita.cliente_id, 'cita', cita.id, cuando, ahora);
    return { ok: true };
  }

  if (tipo === 'regreso') {
    const cliente = citas.cliente(handleId, Number(clienteId));
    if (!cliente) return { ok: false, error: 'no existe' };
    q.anotar.run(handleId, cliente.id, 'regreso', null, cuando, ahora);
    return { ok: true };
  }

  return { ok: false, error: 'tipo' };
}

module.exports = {
  mensajeCita, mensajeRegreso, enlaceWhatsApp,
  citasDeManana, regresosPendientes, pendientes, marcar,
};
