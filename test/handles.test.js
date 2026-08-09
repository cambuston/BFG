// Reglas del identificador público. Son funciones puras: no hacen falta ni
// servidor ni base de datos.
const { test } = require('node:test');
const assert = require('node:assert');
const { normalize, validate, MIN, MAX } = require('../src/handles');

// --- normalize: limpiar lo que la persona teclea ---

test('deja en paz un identificador que ya está bien', () => {
  assert.equal(normalize('juan'), 'juan');
  assert.equal(normalize('juan-perez'), 'juan-perez');
  assert.equal(normalize('barberia21'), 'barberia21');
});

test('baja a minúsculas', () => {
  assert.equal(normalize('JUAN'), 'juan');
  assert.equal(normalize('Juan'), 'juan');
});

test('quita acentos (é→e, ü→u) y la ñ pasa a n', () => {
  assert.equal(normalize('José'), 'jose');
  assert.equal(normalize('Pérez'), 'perez');
  assert.equal(normalize('güero'), 'guero');
  assert.equal(normalize('Muñoz'), 'munoz');
  assert.equal(normalize('MUÑOZ'), 'munoz');
});

test('los espacios se vuelven guiones', () => {
  assert.equal(normalize('juan perez'), 'juan-perez');
  assert.equal(normalize('la  barberia'), 'la-barberia');
});

test('tira lo que no sean letras, números o guion', () => {
  assert.equal(normalize('juan!'), 'juan');
  assert.equal(normalize('juan@perez.com'), 'juanperezcom');
  assert.equal(normalize('#juan'), 'juan');
  assert.equal(normalize('emoji✂️aqui'), 'emojiaqui');
});

test('colapsa guiones repetidos', () => {
  assert.equal(normalize('juan--perez'), 'juan-perez');
  assert.equal(normalize('juan - perez'), 'juan-perez');
});

test('nulo, indefinido y vacío no truenan', () => {
  assert.equal(normalize(null), '');
  assert.equal(normalize(undefined), '');
  assert.equal(normalize(''), '');
  assert.equal(normalize('   '), '-');   // solo espacios: queda el guion, y validate lo rechaza
});

test('normalize es idempotente: aplicarlo dos veces da lo mismo', () => {
  for (const raw of ['José Pérez', 'JUAN!!', 'la  Barbería  de  Muñoz', '#$%']) {
    assert.equal(normalize(normalize(raw)), normalize(raw), `falló con "${raw}"`);
  }
});

// --- validate: qué se acepta ---

test('un identificador normal es válido', () => {
  assert.deepEqual(validate('juan'), { valid: true, reason: null });
  assert.deepEqual(validate('juan-perez'), { valid: true, reason: null });
  assert.deepEqual(validate('barberia21'), { valid: true, reason: null });
});

test('vacío es inválido', () => {
  assert.equal(validate('').reason, 'empty');
});

test('muy corto e inválido (menos de 3)', () => {
  assert.equal(validate('ab').reason, 'short');
  assert.equal(validate('a').reason, 'short');
  assert.equal(validate('abc').valid, true, `${MIN} letras sí debe pasar`);
});

test('muy largo es inválido (más de 30)', () => {
  assert.equal(validate('a'.repeat(MAX)).valid, true);
  assert.equal(validate('a'.repeat(MAX + 1)).reason, 'long');
});

test('rechaza lo que normalize habría cambiado (acentos, mayúsculas, espacios)', () => {
  assert.equal(validate('José').reason, 'chars');
  assert.equal(validate('JUAN').reason, 'chars');
  assert.equal(validate('juan perez').reason, 'chars');
  assert.equal(validate('juan!').reason, 'chars');
});

test('no puede empezar ni terminar con guion', () => {
  assert.equal(validate('-juan').reason, 'hyphen');
  assert.equal(validate('juan-').reason, 'hyphen');
  assert.equal(validate('-').reason, 'short');   // gana el largo, pero sigue inválido
});

test('las rutas de la app están apartadas', () => {
  for (const r of ['api', 'registro', 'cita', 'citas', 'hoy', 'clientes', 'regresos', 'flecos', 'barbas']) {
    assert.equal(validate(r).reason, 'reserved', `"${r}" debería estar apartado`);
  }
});

test('"mi" está apartado y además es muy corto: de todos modos se rechaza', () => {
  assert.equal(validate('mi').valid, false);
});

test('todo lo que validate acepta sobrevive a normalize sin cambios', () => {
  for (const h of ['juan', 'juan-perez', 'barberia21', 'a1b2c3']) {
    assert.equal(normalize(h), h);
    assert.equal(validate(h).valid, true);
  }
});
