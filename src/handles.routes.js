// API del alta. Solo dos cosas: ¿está libre este identificador? y quédatelo.
//
// El resto de Flecos (servicios, horarios, clientes, citas) todavía no existe
// y a propósito no se toca aquí.

const express = require('express');
const { db } = require('./db');
const { normalize, validate } = require('./handles');
const { brandFor } = require('./brand');
const sesion = require('./sesion');
const negocio = require('./negocio');

const router = express.Router();

const findHandle = db.prepare(
  'SELECT handle FROM handles WHERE brand = ? AND handle = ?'
);
const findAccount = db.prepare(
  'SELECT id, handle FROM handles WHERE brand = ? AND auth_provider = ? AND auth_sub = ?'
);
const insertHandle = db.prepare(`
  INSERT INTO handles (brand, handle, auth_provider, auth_sub, email, display_name, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

// GET /api/handle/:handle — ¿está libre?
//
// Esto es SOLO informativo, para pintar la palomita mientras la persona
// escribe. No aparta nada: quien manda es el INSERT del claim.
router.get('/:handle', (req, res) => {
  const brand = brandFor(req);
  const handle = normalize(req.params.handle);
  const { valid, reason } = validate(handle);

  if (!valid) return res.json({ handle, valid: false, available: false, reason });

  const taken = findHandle.get(brand.id, handle);
  res.json({ handle, valid: true, available: !taken, reason: taken ? 'taken' : null });
});

// POST /api/handle/claim — quédate el identificador para esta cuenta.
//
// Body: { handle, auth: { provider, sub, email, name } }
//
// El `auth` de verdad lo valida server.js ANTES de llegar aquí (verifica el
// token de Supabase). Aquí ya llega en limpio.
//
// La carrera se resuelve con el índice UNIQUE, no con un chequeo previo:
// entre "está libre" y el INSERT pueden pasar milisegundos y otra persona
// puede ganar. Por eso intentamos insertar y, si SQLite se queja, devolvemos
// 409 y el navegador regresa al paso 1.
router.post('/claim', (req, res) => {
  const brand = brandFor(req);
  const body = req.body || {};
  const auth = body.auth || {};

  const handle = normalize(body.handle);
  const { valid, reason } = validate(handle);
  if (!valid) return res.status(400).json({ error: 'invalid handle', reason });

  const provider = String(auth.provider || '');
  const sub = String(auth.sub || '');
  if (!provider || !sub) return res.status(401).json({ error: 'not authenticated' });

  // ¿Esta misma cuenta ya tiene página en esta marca? No creamos otra: lo
  // mandamos a la suya. (Volver a entrar con el mismo Google no debe fallar.)
  const existing = findAccount.get(brand.id, provider, sub);
  if (existing) {
    // Volver a entrar con el mismo Google es, de hecho, iniciar sesión.
    sesion.crear(res, existing.id);
    return res.json({
      ok: true,
      already: true,
      handle: existing.handle,
      url: `https://${brand.domain}/${existing.handle}`,
    });
  }

  const opt = (v, max) => (typeof v === 'string' && v.trim()) ? v.trim().slice(0, max) : null;

  const nombre = opt(auth.name, 120);
  let nuevoId;
  try {
    nuevoId = insertHandle.run(
      brand.id,
      handle,
      provider,
      sub,
      opt(auth.email, 200),
      nombre,
      Date.now()
    ).lastInsertRowid;
  } catch (err) {
    // SQLITE_CONSTRAINT_UNIQUE: alguien lo tomó mientras se autenticaba.
    if (err && String(err.code || '').startsWith('SQLITE_CONSTRAINT')) {
      return res.status(409).json({ error: 'taken', handle });
    }
    throw err;
  }

  // El negocio nace con servicios y horario de ejemplo: quien acaba de darse
  // de alta ya tiene página que funciona, en vez de una pantalla vacía.
  negocio.estrenar(nuevoId, nombre);
  sesion.crear(res, nuevoId);

  res.status(201).json({
    ok: true,
    already: false,
    handle,
    url: `https://${brand.domain}/${handle}`,
  });
});

module.exports = router;
