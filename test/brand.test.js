// Un solo código, dos apps: que cada petición reciba la marca correcta.
//
// brand.js lee BRAND al cargarse, así que hay que quitarla ANTES del require.
// (node --test corre cada archivo en su propio proceso: esto no afecta a los demás.)
delete process.env.BRAND;

const { test } = require('node:test');
const assert = require('node:assert');
const { brandFor, BRANDS } = require('../src/brand');

const req = (host) => ({ headers: host ? { host } : {} });

test('las dos marcas existen y no comparten nada que las confunda', () => {
  assert.deepEqual(Object.keys(BRANDS).sort(), ['barbas', 'flecos']);
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
