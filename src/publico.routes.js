// La parte que ve el CLIENTE. flecos.mx/juan
//
// Sin cuenta, sin contraseña, sin sesión. Es a propósito: pedirle registrarse
// a alguien que solo quiere cortarse el pelo es la forma más segura de que no
// reserve.
//
// LO QUE NUNCA SALE DE AQUÍ: las notas del cliente. Son la memoria privada del
// peluquero ("prefiere después de las 4", "no le gusta que le hablen") y no
// tienen por qué verse desde fuera. Cada respuesta de este archivo arma su
// objeto a mano, campo por campo, justo para que no se escape nada por
// descuido al hacer un `...cliente`.

const express = require('express');
const { db } = require('./db');
const negocio = require('./negocio');
const citas = require('./citas');
const { normalize } = require('./handles');
const { brandFor } = require('./brand');
const { fechaBonita, bonita, hoy } = require('./agenda');

const router = express.Router();

const buscarHandle = db.prepare('SELECT * FROM handles WHERE brand = ? AND handle = ?');

// Todas las rutas cuelgan de un identificador: si no existe, 404 y ya.
router.use('/:handle', (req, res, next) => {
  const brand = brandFor(req);
  const pro = buscarHandle.get(brand.id, normalize(req.params.handle));
  if (!pro) return res.status(404).json({ error: 'no existe' });
  req.duenio = pro;   // el DUEÑO de la página, no la sesión (esa es req.pro)
  next();
});

// La portada: quién es y qué hace.
router.get('/:handle', (req, res) => {
  const brand = brandFor(req);
  const n = negocio.de(req.duenio.id);
  res.json({
    handle: req.duenio.handle,
    nombre: n.nombre || req.duenio.display_name || req.duenio.handle,
    ciudad: n.ciudad || null,
    whatsapp: n.whatsapp || null,
    oficio: brand.who,
    servicios: negocio.servicios(req.duenio.id).map((s) => ({
      id: s.id, nombre: s.nombre, precio: s.precio, minutos: s.minutos,
    })),
    horario: negocio.horario(req.duenio.id),
  });
});

// ¿Cuándo puede? Los próximos días con hueco para ese servicio.
router.get('/:handle/dias', (req, res) => {
  const serv = negocio.servicio(Number(req.query.servicio), req.duenio.id);
  if (!serv) return res.status(400).json({ error: 'servicio' });

  res.json({
    servicio: { id: serv.id, nombre: serv.nombre, precio: serv.precio, minutos: serv.minutos },
    dias: citas.diasConHueco(req.duenio.id, serv.minutos, 10).map((d) => ({
      fecha: d.fecha,
      titulo: fechaBonita(d.fecha),
      es_hoy: d.fecha === hoy(),
      horas: d.horas.map((h) => ({ hora: h, bonita: bonita(h) })),
    })),
  });
});

// "Ya soy cliente": reconocerlo por su teléfono para no volver a preguntarle
// todo. Devuelve lo justo: cómo se llama, qué se hace siempre y si ya tiene
// cita. Nunca las notas.
router.get('/:handle/soy', (req, res) => {
  const tel = negocio.soloDigitos(req.query.telefono);
  if (!tel || tel.length < 7) return res.json({ conocido: false });

  const encontrado = db
    .prepare('SELECT id, nombre FROM clientes WHERE handle_id = ? AND telefono = ?')
    .get(req.duenio.id, tel);
  if (!encontrado) return res.json({ conocido: false });

  const f = citas.ficha(req.duenio.id, encontrado.id);
  res.json({
    conocido: true,
    nombre: f.nombre,
    habitual: f.habitual,
    proxima: f.proxima
      ? {
        fecha: f.proxima.fecha,
        titulo: fechaBonita(f.proxima.fecha),
        hora: bonita(f.proxima.hora),
        servicio: f.proxima.servicio,
      }
      : null,
  });
});

// Reservar. El último paso.
router.post('/:handle/cita', (req, res) => {
  const r = citas.reservar(req.duenio.id, { ...(req.body || {}), origen: 'cliente' });
  if (!r.ok) return res.status(r.error === 'ocupado' ? 409 : 400).json(r);

  res.status(201).json({
    ok: true,
    cita: {
      fecha: r.cita.fecha,
      titulo: fechaBonita(r.cita.fecha),
      hora: bonita(r.cita.hora),
      servicio: r.cita.servicio,
      precio: r.cita.precio,
    },
    nombre: r.cliente.nombre,
  });
});

module.exports = router;
