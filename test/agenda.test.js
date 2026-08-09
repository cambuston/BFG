// Las cuentas de calendario. Sin servidor y sin base: funciones puras.
//
// Aquí es donde se esconden los errores de "se me empalmaron dos citas", así
// que es la parte más probada del proyecto.

const { test } = require('node:test');
const assert = require('node:assert');

const {
  aMinutos, aHora, bonita, fechaValida, diaDeSemana, sumarDias, diasEntre,
  fechaBonita, hoy, seEnciman, horasLibres,
} = require('../src/agenda');

// --- horas ---

test('las horas van y vienen de minutos', () => {
  assert.equal(aMinutos('09:30'), 570);
  assert.equal(aMinutos('00:00'), 0);
  assert.equal(aMinutos('23:59'), 1439);
  assert.equal(aHora(570), '09:30');
  assert.equal(aHora(0), '00:00');
});

test('una hora imposible no se acepta', () => {
  for (const mala of ['25:00', '10:60', 'diez', '', null, '9:5', '09:30:00']) {
    assert.equal(aMinutos(mala), null, `debió rechazar ${JSON.stringify(mala)}`);
  }
});

test('las horas se muestran como habla la gente, no en 24h', () => {
  assert.equal(bonita('09:00'), '9:00 am');
  assert.equal(bonita('13:30'), '1:30 pm');
  assert.equal(bonita('00:15'), '12:15 am');   // medianoche es 12, no 0
  assert.equal(bonita('12:00'), '12:00 pm');   // mediodía es 12 pm, no 0 pm
});

// --- fechas ---

test('el 31 de febrero no existe', () => {
  assert.equal(fechaValida('2026-08-14'), true);
  assert.equal(fechaValida('2026-02-31'), false);
  assert.equal(fechaValida('2026-13-01'), false);
  assert.equal(fechaValida('14/08/2026'), false);
  assert.equal(fechaValida(''), false);
});

test('el año bisiesto se respeta', () => {
  assert.equal(fechaValida('2028-02-29'), true, '2028 sí es bisiesto');
  assert.equal(fechaValida('2027-02-29'), false, '2027 no lo es');
});

test('el día de la semana no depende de la zona horaria de la máquina', () => {
  // 2026-08-14 fue viernes. Si esto se calculara con la hora local, un
  // servidor al oeste de Greenwich contestaría jueves.
  assert.equal(diaDeSemana('2026-08-14'), 5);
  assert.equal(diaDeSemana('2026-08-16'), 0, 'domingo');
});

test('sumar días cruza meses y años', () => {
  assert.equal(sumarDias('2026-08-30', 3), '2026-09-02');
  assert.equal(sumarDias('2026-12-31', 1), '2027-01-01');
  assert.equal(sumarDias('2026-03-01', -1), '2026-02-28');
});

test('contar días entre fechas', () => {
  assert.equal(diasEntre('2026-08-01', '2026-08-25'), 24);
  assert.equal(diasEntre('2026-08-25', '2026-08-01'), -24);
  assert.equal(diasEntre('2026-08-01', '2026-08-01'), 0);
});

test('la fecha se lee en español', () => {
  assert.equal(fechaBonita('2026-08-14'), 'viernes 14 de agosto');
  assert.equal(fechaBonita('2026-01-01'), 'jueves 1 de enero');
});

test('hoy sale en formato de la base', () => {
  assert.match(hoy(), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(hoy(new Date(2026, 7, 9)), '2026-08-09');
});

// --- encimarse ---

test('dos citas pegadas no se enciman: 9:00-9:30 y 9:30-10:00 caben', () => {
  assert.equal(seEnciman(540, 30, 570, 30), false);
});

test('una cita larga sí tapa a la siguiente', () => {
  // 9:00 durante 60 min choca con 9:30
  assert.equal(seEnciman(540, 60, 570, 30), true);
  // y al revés, da igual el orden
  assert.equal(seEnciman(570, 30, 540, 60), true);
});

test('una cita dentro de otra se encima', () => {
  assert.equal(seEnciman(540, 120, 570, 15), true);
});

// --- huecos libres ---

const franja = { abre: '09:00', cierra: '12:00' };

test('sin horario ese día no hay huecos', () => {
  assert.deepEqual(horasLibres({ franja: null, minutos: 30 }), []);
});

test('un día vacío se ofrece completo, al paso del servicio', () => {
  const libres = horasLibres({ franja, minutos: 30 });
  assert.deepEqual(libres, ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30']);
});

test('un servicio largo ofrece menos horas, no más', () => {
  // La lista tiene que ser corta y las citas quedar pegadas: un servicio de
  // una hora se ofrece cada hora, no cada cuarto.
  assert.deepEqual(horasLibres({ franja, minutos: 60 }), ['09:00', '10:00', '11:00']);
  // Y uno cortito sí baja al mínimo de 15.
  const cortos = horasLibres({ franja, minutos: 15 });
  assert.equal(cortos[1], '09:15');
});

test('un servicio larguísimo no se queda con una sola opción al día', () => {
  // El paso se topa en 60: uno de 2 horas se ofrece a las 9 y a las 10,
  // no solo a las 9.
  assert.deepEqual(horasLibres({ franja, minutos: 120 }), ['09:00', '10:00']);
});

test('nunca se ofrece un hueco que se pasa de la hora de cierre', () => {
  const libres = horasLibres({ franja, minutos: 90 });
  assert.equal(libres[libres.length - 1], '10:00');
  for (const h of libres) {
    assert.ok(aMinutos(h) + 90 <= aMinutos('12:00'), `${h} + 90 se pasa de las 12:00`);
  }
});

test('un servicio que no cabe en todo el día no ofrece nada', () => {
  assert.deepEqual(horasLibres({ franja, minutos: 240 }), []);
});

test('una cita existente tapa su hora y las que se le encimarían', () => {
  const libres = horasLibres({
    franja,
    minutos: 30,
    ocupadas: [{ hora: '10:00', minutos: 60 }],   // 10:00 a 11:00
  });
  assert.ok(!libres.includes('10:00'), 'la hora de la cita');
  assert.ok(!libres.includes('10:30'), 'cae dentro de la cita de 10:00 a 11:00');
  assert.ok(libres.includes('09:30'), '09:30 + 30 termina justo a las 10:00');
  assert.ok(libres.includes('11:00'), '11:00 empieza justo cuando acaba');
  assert.deepEqual(libres, ['09:00', '09:30', '11:00', '11:30']);
});

test('`desde` esconde las horas que ya pasaron', () => {
  const libres = horasLibres({ franja, minutos: 30, desde: '10:20' });
  assert.equal(libres[0], '10:30', 'no se puede reservar a las 10:15 si ya son 10:20');
  assert.ok(!libres.includes('09:00'));
});

test('con la agenda llena no queda ni un hueco', () => {
  const libres = horasLibres({
    franja,
    minutos: 60,
    ocupadas: [
      { hora: '09:00', minutos: 60 },
      { hora: '10:00', minutos: 60 },
      { hora: '11:00', minutos: 60 },
    ],
  });
  assert.deepEqual(libres, []);
});
