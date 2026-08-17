// API del alta. Solo dos cosas: ¿está libre este identificador? y quédatelo.
//
// La decisión de quedárselo vive en src/alta.js, porque el modo propio
// (entrar con Google sin intermediario) llega a la misma decisión por otro
// camino: no por este POST, sino de vuelta de /auth/google/callback.

const express = require('express');
const { db } = require('./db');
const { normalize, validate } = require('./handles');
const { brandFor } = require('./brand');
const sesion = require('./sesion');
const { apartar } = require('./alta');

const router = express.Router();

const findHandle = db.prepare(
  'SELECT handle FROM handles WHERE brand = ? AND handle = ?'
);

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
// token de Supabase, o inventa la identidad en modo demo). Aquí ya llega en
// limpio.
router.post('/claim', (req, res) => {
  const body = req.body || {};
  const r = apartar(brandFor(req), body.handle, body.auth);
  if (r.handleId) sesion.crear(res, r.handleId);
  res.status(r.estado).json(r.cuerpo);
});

module.exports = router;
