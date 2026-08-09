// Cuentas de calendario. TODO en este archivo son funciones puras: reciben
// datos y devuelven datos, sin tocar la base ni el reloj (salvo `hoy()`).
//
// Está aparte justamente para poder probarlo a fondo sin levantar un servidor:
// es donde se esconden los errores de "se me empalmaron dos citas".
//
// Las fechas son 'YYYY-MM-DD' y las horas 'HH:MM', en la hora del local.
// El porqué está explicado arriba de todo en src/db.js.

// Cada cuántos minutos se ofrece un hueco.
//
// El paso es la DURACIÓN DEL SERVICIO, no un número fijo. Un corte de 30 min
// se ofrece a las 10:00, 10:30, 11:00…; uno de 60, cada hora. Dos razones:
//
//   1. Las citas quedan pegadas unas a otras, sin ratos muertos de 15 min
//      entre medias que no le sirven a nadie.
//   2. La lista es corta. Con un paso fijo de 15, un día de 9 horas daba 36
//      opciones — un muro de botones en vez de una elección.
//
// Se acota entre 15 y 60: un servicio de 4 horas no puede ofrecer una sola
// hora al día.
const PASO_MIN = 15;
const PASO_MAX = 60;

function pasoPara(minutos) {
  const m = Number(minutos) > 0 ? Number(minutos) : 30;
  return Math.min(PASO_MAX, Math.max(PASO_MIN, m));
}

// ---------------------------------------------------------------------------
// Horas
// ---------------------------------------------------------------------------

// '09:30' -> 570 minutos desde medianoche. Devuelve null si no es una hora.
function aMinutos(hora) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hora || ''));
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

// 570 -> '09:30'
function aHora(minutos) {
  const m = Math.max(0, Math.round(minutos));
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
}

// '09:30' -> '9:30 am'. Los peluqueros no hablan en 24 horas.
function bonita(hora) {
  const total = aMinutos(hora);
  if (total === null) return String(hora || '');
  const h24 = Math.floor(total / 60);
  const min = total % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(min).padStart(2, '0')} ${h24 < 12 ? 'am' : 'pm'}`;
}

// ---------------------------------------------------------------------------
// Fechas
// ---------------------------------------------------------------------------

const RE_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;

function fechaValida(fecha) {
  const m = RE_FECHA.exec(String(fecha || ''));
  if (!m) return false;
  const [, a, mes, d] = m.map(Number);
  // Se reconstruye y se compara: así 2026-02-31 se cae solo.
  const dt = new Date(Date.UTC(a, mes - 1, d));
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === mes - 1 && dt.getUTCDate() === d;
}

// 0 domingo … 6 sábado, igual que Date.getDay().
//
// Se usa UTC a propósito: 'YYYY-MM-DD' no es un instante, es un día del
// calendario. Con la hora local, un servidor al oeste de Greenwich contestaría
// el día anterior para las fechas de madrugada.
function diaDeSemana(fecha) {
  const m = RE_FECHA.exec(String(fecha || ''));
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay();
}

function sumarDias(fecha, dias) {
  const m = RE_FECHA.exec(String(fecha || ''));
  if (!m) return null;
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  dt.setUTCDate(dt.getUTCDate() + dias);
  return dt.toISOString().slice(0, 10);
}

// Días entre dos fechas (b - a). Negativo si b es anterior.
function diasEntre(a, b) {
  const ma = RE_FECHA.exec(String(a || ''));
  const mb = RE_FECHA.exec(String(b || ''));
  if (!ma || !mb) return null;
  const da = Date.UTC(Number(ma[1]), Number(ma[2]) - 1, Number(ma[3]));
  const dbb = Date.UTC(Number(mb[1]), Number(mb[2]) - 1, Number(mb[3]));
  return Math.round((dbb - da) / 86400000);
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// '2026-08-14' -> 'viernes 14 de agosto'
function fechaBonita(fecha) {
  const m = RE_FECHA.exec(String(fecha || ''));
  if (!m) return String(fecha || '');
  return `${DIAS[diaDeSemana(fecha)]} ${Number(m[3])} de ${MESES[Number(m[2]) - 1]}`;
}

// Hoy, en la hora de ESTA máquina.
//
// Único lugar del código que mira el reloj. Si algún día hay negocios en husos
// distintos al del servidor, se arregla aquí y en ningún otro lado.
function hoy(ahora = new Date()) {
  return [
    ahora.getFullYear(),
    String(ahora.getMonth() + 1).padStart(2, '0'),
    String(ahora.getDate()).padStart(2, '0'),
  ].join('-');
}

function ahoraHora(ahora = new Date()) {
  return aHora(ahora.getHours() * 60 + ahora.getMinutes());
}

// ---------------------------------------------------------------------------
// Huecos libres
// ---------------------------------------------------------------------------

// ¿Se encima [inicioA, +duraA) con [inicioB, +duraB)?
//
// Esta es LA cuenta del producto. Dos citas chocan si una empieza antes de que
// la otra termine, en los dos sentidos. Tocarse de punta no es chocar: una
// cita de 9:00 a 9:30 y otra de 9:30 a 10:00 caben perfecto.
function seEnciman(inicioA, duraA, inicioB, duraB) {
  return inicioA < inicioB + duraB && inicioB < inicioA + duraA;
}

// Las horas a las que sí cabe una cita de `minutos`, ese día.
//
//   franja   { abre: '09:00', cierra: '19:00' }  (null = cerrado)
//   ocupadas [{ hora: '10:00', minutos: 60 }, …] citas que ya existen
//   desde    'HH:MM' opcional: no ofrecer nada antes (hoy no se reserva a las 8
//            si ya son las 11)
//
// Devuelve ['09:00', '09:15', …]. Un hueco entra si cabe completo antes de
// cerrar y no se encima con ninguna cita.
function horasLibres({ franja, ocupadas = [], minutos = 30, desde = null } = {}) {
  if (!franja || !franja.abre || !franja.cierra) return [];

  const abre = aMinutos(franja.abre);
  const cierra = aMinutos(franja.cierra);
  const dura = Number(minutos) > 0 ? Number(minutos) : 30;
  if (abre === null || cierra === null || cierra <= abre) return [];

  const piso = desde === null ? abre : Math.max(abre, aMinutos(desde) ?? abre);

  const tomadas = ocupadas
    .map((c) => ({ inicio: aMinutos(c.hora), dura: Number(c.minutos) || 0 }))
    .filter((c) => c.inicio !== null && c.dura > 0);

  const libres = [];
  const paso = pasoPara(dura);
  // Los huecos se alinean desde la apertura: si abre 9:00, salen 9:00, 9:30…
  // nunca 9:07.
  let t = abre;
  while (t + dura <= cierra) {
    if (t >= piso && !tomadas.some((c) => seEnciman(t, dura, c.inicio, c.dura))) {
      libres.push(aHora(t));
    }
    t += paso;
  }
  return libres;
}

module.exports = {
  PASO_MIN, PASO_MAX, pasoPara, aMinutos, aHora, bonita,
  fechaValida, diaDeSemana, sumarDias, diasEntre, fechaBonita, hoy, ahoraHora,
  seEnciman, horasLibres,
  DIAS, MESES,
};
