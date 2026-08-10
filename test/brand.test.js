// Un solo código, dos apps: que cada petición reciba la marca correcta.
//
// brand.js lee BRAND al cargarse, así que hay que quitarla ANTES del require.
// (node --test corre cada archivo en su propio proceso: esto no afecta a los demás.)
delete process.env.BRAND;

const { test } = require('node:test');
const assert = require('node:assert');
const { brandFor, BRANDS } = require('../src/brand');

const req = (host) => ({ headers: host ? { host } : {} });

test('las tres marcas existen y no comparten nada que las confunda', () => {
  assert.deepEqual(Object.keys(BRANDS).sort(), ['barbas', 'flecos', 'garras']);
  assert.notEqual(BRANDS.flecos.color, BRANDS.barbas.color);
  assert.notEqual(BRANDS.flecos.domain, BRANDS.barbas.domain);
});

test('cada marca trae todo lo que el HTML necesita', () => {
  for (const b of Object.values(BRANDS)) {
    for (const campo of ['id', 'name', 'domain', 'color', 'tagline']) {
      assert.ok(b[campo], `a ${b.id} le falta "${campo}"`);
    }
    assert.match(b.color, /^#[0-9A-Fa-f]{6}$/, `color de ${b.id} no es un hex`);
  }
});

test('flecos.mx sirve Flecos', () => {
  assert.equal(brandFor(req('flecos.mx')).id, 'flecos');
  assert.equal(brandFor(req('www.flecos.mx')).id, 'flecos');
});

test('barbas.mx sirve Barbas', () => {
  assert.equal(brandFor(req('barbas.mx')).id, 'barbas');
  assert.equal(brandFor(req('www.barbas.mx')).id, 'barbas');
});

test('el puerto en el Host no estorba', () => {
  assert.equal(brandFor(req('barbas.mx:3101')).id, 'barbas');
  assert.equal(brandFor(req('barbas.local:8080')).id, 'barbas');
});

test('mayúsculas en el Host no estorban', () => {
  assert.equal(brandFor(req('BARBAS.MX')).id, 'barbas');
});

test('sin Host reconocible cae en Flecos (nunca truena, nunca queda sin marca)', () => {
  assert.equal(brandFor(req('localhost:3100')).id, 'flecos');
  assert.equal(brandFor(req('')).id, 'flecos');
  assert.equal(brandFor(req(undefined)).id, 'flecos');
  assert.equal(brandFor({}).id, 'flecos');
  assert.equal(brandFor(undefined).id, 'flecos');
});

// ---------------------------------------------------------------------------
// El tema
// ---------------------------------------------------------------------------
//
// La promesa es que aplicar un look nuevo sea SOLO rellenar `tema` en
// src/brand.js. Estas pruebas la amarran.

const { temaDe, variablesCss } = require('../src/brand');

test('sin tema, todo se deduce del color y sale lo de siempre', () => {
  const t = temaDe({ color: '#2F6BFF' });
  assert.equal(t.fondo, '#2F6BFF', 'el fondo es el color de marca');
  assert.equal(t.superficie, '#2F6BFF', 'y la superficie también: hoy son lo mismo');
  assert.equal(t.acento, '#2F6BFF');
  assert.equal(t.papel, '#FAFAFC', 'el hueso del arte del calendario');
  assert.equal(t.logo, '#FFFFFF', 'el logo es blanco PURO, no el hueso');
  assert.equal(t.herraje, 'plata');
});

test('un tema a medias completa el resto, no lo deja vacío', () => {
  const t = temaDe({ color: '#2F6BFF', tema: { fondo: '#EFE9DC', herraje: 'laton' } });
  assert.equal(t.fondo, '#EFE9DC', 'lo que sí dijo');
  assert.equal(t.herraje, 'laton');
  assert.equal(t.superficie, '#2F6BFF', 'lo que no dijo sale del color');
  assert.equal(t.acento, '#2F6BFF');
});

test('un herraje inventado no rompe: cae en plata', () => {
  assert.equal(temaDe({ color: '#000', tema: { herraje: 'oro-rosa' } }).herraje, 'plata');
});

test('las opacidades vienen como terna RGB, no como color', () => {
  // Si trajeran el alfa dentro, todas las sombras y todos los textos a media
  // tinta se aplanarían en una sola opacidad. Ver src/brand.js.
  const t = temaDe({ color: '#2F6BFF' });
  for (const clave of ['tinta', 'tintaFondo', 'sombra', 'sombraAccion']) {
    assert.match(t[clave], /^\d{1,3} \d{1,3} \d{1,3}$/, `${clave} debe ser "R G B"`);
  }
});

test('los nombres viejos siguen apuntando al tema', () => {
  // Las cuatro hojas copiadas de Días que Cuentan hablan en estos y no se
  // tocan: si dejan de salir, la app se queda sin color.
  const v = variablesCss(BRANDS.barbas);
  assert.equal(v['--brand-blue'], BRANDS.barbas.color);
  assert.equal(v['--primary'], BRANDS.barbas.color);
  assert.equal(v['--secondary'], BRANDS.barbas.color);
  assert.equal(v['--text'], '#1B2A4A');
  assert.equal(v['--herraje'], 'var(--herraje-plata)');
});

test('cada marca trae el tema completo, sin huecos', () => {
  const piezas = ['fondo', 'tintaFondo', 'papel', 'superficie', 'tinta',
    'acento', 'logo', 'texto', 'sombra', 'sombraAccion', 'herraje'];
  for (const b of Object.values(BRANDS)) {
    const t = temaDe(b);
    for (const p of piezas) {
      assert.ok(t[p], `a ${b.id} le falta "${p}" en el tema`);
    }
  }
});
