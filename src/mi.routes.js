// API del área del profesional. Todo lo de aquí exige sesión.
//
// El middleware `sesion.exigir` ya corrió antes de llegar (ver server.js), así
// que req.pro siempre existe y siempre es de esta marca. Ninguna ruta recibe
// un handle_id del navegador: sale de la cookie firmada. Así nadie puede pedir
// la agenda de otro cambiando un número en la URL.

const express = require('express');
const negocio = require('./negocio');
const citas = require('./citas');
const sesion = require('./sesion');
const { brandFor } = require('./brand');
const { hoy, fechaValida, sumarDias, fechaBonita, bonita, diaDeSemana } = require('./agenda');

const router = express.Router();

const id = (req) => req.pro.id;

// Lo que necesita la app al abrir: quién soy y cómo se llama mi negocio.
router.get('/yo', (req, res) => {
  const brand = brandFor(req);
  const n = negocio.de(id(req));
  res.json({
    handle: req.pro.handle,
    url: `${brand.domain}/${req.pro.handle}`,
    nombre: n.nombre || req.pro.display_name || req.pro.handle,
    negocio: n,
  });
});

router.post('/salir', (req, res) => {
  sesion.borrar(res);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Hoy — la agenda del día
// ---------------------------------------------------------------------------
router.get('/agenda', (req, res) => {
  const fecha = fechaValida(req.query.fecha) ? req.query.fecha : hoy();
  const lista = citas.delDia(id(req), fecha);
  const franja = negocio.franjaDe(id(req), diaDeSemana(fecha));

  res.json({
    fecha,
    titulo: fechaBonita(fecha),
    es_hoy: fecha === hoy(),
    cerrado: negocio.cerrado(id(req), fecha) || !franja,
    franja,
    ayer: sumarDias(fecha, -1),
    manana: sumarDias(fecha, 1),
    citas: lista.map((c) => ({ ...c, hora_bonita: bonita(c.hora) })),
  });
});

// El profesional apuntando una cita a mano (alguien que llegó o llamó).
router.post('/agenda', (req, res) => {
  const r = citas.reservar(id(req), { ...req.body, origen: 'profesional' });
  if (!r.ok) return res.status(r.error === 'ocupado' ? 409 : 400).json(r);
  res.status(201).json(r);
});

// Huecos libres de un día, para el formulario de cita a mano.
router.get('/huecos', (req, res) => {
  const fecha = fechaValida(req.query.fecha) ? req.query.fecha : hoy();
  const serv = negocio.servicio(Number(req.query.servicio), id(req));
  res.json({ fecha, horas: citas.huecos(id(req), fecha, serv ? serv.minutos : 30) });
});

router.post('/cita/:id/:estado', (req, res) => {
  const ok = citas.cambiarEstado(id(req), Number(req.params.id), req.params.estado);
  if (!ok) return res.status(404).json({ error: 'no existe' });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Clientes — la MEMORIA
// ---------------------------------------------------------------------------
router.get('/clientes', (req, res) => {
  res.json({ clientes: citas.buscarClientes(id(req), req.query.q || '') });
});

router.get('/cliente/:id', (req, res) => {
  const f = citas.ficha(id(req), Number(req.params.id));
  if (!f) return res.status(404).json({ error: 'no existe' });

  // Las fechas se maquillan aquí y no en el navegador: los meses en español
  // ya viven en src/agenda.js y no vale la pena tenerlos dos veces.
  res.json({
    ...f,
    proxima: f.proxima
      ? { ...f.proxima, fecha_bonita: fechaBonita(f.proxima.fecha), hora_bonita: bonita(f.proxima.hora) }
      : null,
    historial: f.historial.map((c) => ({
      ...c,
      fecha_bonita: fechaBonita(c.fecha),
      hora_bonita: bonita(c.hora),
    })),
  });
});

// Lo que hace que el cliente se sienta conocido.
router.put('/cliente/:id/notas', (req, res) => {
  const ok = citas.guardarNotas(id(req), Number(req.params.id), (req.body || {}).notas);
  if (!ok) return res.status(404).json({ error: 'no existe' });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Regresos
// ---------------------------------------------------------------------------
router.get('/regresos', (req, res) => {
  const n = negocio.de(id(req));
  res.json({ regreso_dias: n.regreso_dias, clientes: citas.regresos(id(req)) });
});

// ---------------------------------------------------------------------------
// Mi negocio
// ---------------------------------------------------------------------------
router.get('/negocio', (req, res) => {
  res.json({
    negocio: negocio.de(id(req)),
    servicios: negocio.servicios(id(req)),
    horario: negocio.horario(id(req)),
    cerrados: negocio.cerradosDesde(id(req), hoy()),
  });
});

router.put('/negocio', (req, res) => {
  res.json({ ok: true, negocio: negocio.guardar(id(req), req.body || {}) });
});

router.post('/servicio', (req, res) => {
  const r = negocio.agregarServicio(id(req), req.body || {});
  if (!r.ok) return res.status(400).json(r);
  res.status(201).json(r);
});

router.put('/servicio/:id', (req, res) => {
  const r = negocio.editarServicio(id(req), Number(req.params.id), req.body || {});
  if (!r.ok) return res.status(400).json(r);
  res.json(r);
});

router.delete('/servicio/:id', (req, res) => {
  if (!negocio.archivarServicio(id(req), Number(req.params.id))) {
    return res.status(404).json({ error: 'no existe' });
  }
  res.json({ ok: true });
});

router.put('/horario', (req, res) => {
  negocio.guardarHorario(id(req), (req.body || {}).dias);
  res.json({ ok: true, horario: negocio.horario(id(req)) });
});

router.post('/cerrar', (req, res) => {
  const { fecha, motivo } = req.body || {};
  if (!negocio.cerrarDia(id(req), fecha, motivo)) return res.status(400).json({ error: 'fecha' });
  res.json({ ok: true, cerrados: negocio.cerradosDesde(id(req), hoy()) });
});

router.delete('/cerrar/:fecha', (req, res) => {
  negocio.abrirDia(id(req), req.params.fecha);
  res.json({ ok: true, cerrados: negocio.cerradosDesde(id(req), hoy()) });
});

module.exports = router;
