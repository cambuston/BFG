const path = require('path');
const fs = require('fs');
const express = require('express');

const { brandFor, BRANDS, ENV_BRAND, variablesCss } = require('./src/brand');
const handlesRoutes = require('./src/handles.routes');
const miRoutes = require('./src/mi.routes');
const publicoRoutes = require('./src/publico.routes');
const auth = require('./src/auth');
const sesion = require('./src/sesion');

const app = express();
const PORT = process.env.PORT || 3100;
const PUBLIC_DIR = path.join(__dirname, 'public');

app.use(express.json({ limit: '32kb' }));

// La sesión se carga en TODAS las peticiones (deja req.pro o null). Va antes
// que cualquier ruta porque varias preguntan por req.pro. La marca se pasa
// como función porque depende del Host de cada petición: una sesión de Flecos
// no vale en Barbas.
app.use(sesion.cargar((req) => brandFor(req).id));

// Qué marca soy, cómo se inicia sesión, y si ya hay alguien dentro.
app.get('/api/config', (req, res) => {
  const brand = brandFor(req);
  res.json({
    brand,
    auth: auth.publicConfig(),
    // Para que el navegador sepa si mandar a alguien al alta o a su agenda.
    sesion: req.pro ? { handle: req.pro.handle } : null,
  });
});

// Identidad verificada ANTES de tocar la base. El navegador nunca decide
// quién es: en modo supabase esto llama a Supabase con el access_token.
app.post('/api/handle/claim', auth.required);
app.use('/api/handle', handlesRoutes);

// Área del profesional: cookie firmada obligatoria en todas.
app.use('/api/mi', sesion.exigir, miRoutes);

// Lo que ve el cliente: sin cuenta y sin sesión.
app.use('/api/p', publicoRoutes);

// ---------- Frontend ----------
//
// Tres páginas, todas servidas con la marca ya incrustada (color, nombre,
// dominio). Así Barbas nunca parpadea en azul de Flecos antes de que corra el
// JavaScript.
//
//   index.html    /            el alta (pasos 1 y 2)
//   negocio.html  /juan        la página pública y reservar
//   mi.html       /mi          Hoy · Clientes · Regresos · Mi negocio
const PAGINAS = {
  alta: path.join(PUBLIC_DIR, 'index.html'),
  publica: path.join(PUBLIC_DIR, 'negocio.html'),
  mi: path.join(PUBLIC_DIR, 'mi.html'),
};

// Se lee en cada petición a propósito: editar el HTML y recargar basta, sin
// reiniciar el servidor. Son archivos de unos pocos KB.
function render(archivo, brand, extra = {}) {
  const html = fs.readFileSync(archivo, 'utf8');
  const datos = {
    BRAND_JSON: JSON.stringify(brand).replace(/</g, '\\u003c'),
    BRAND_COLOR: brand.color,
    BRAND_NAME: brand.name,
    BRAND_DOMAIN: brand.domain,
    BRAND_TAGLINE: brand.tagline,
    // El tema entero, listo para meter dentro de :root { … }. Va incrustado y
    // no en una hoja aparte para que Barbas no parpadee en el azul de Flecos
    // mientras carga el CSS.
    BRAND_TEMA: Object.entries(variablesCss(brand))
      .map(([k, v]) => `${k}:${v}`).join(';'),
    ...extra,
  };
  return html.replace(/\{\{(\w+)\}\}/g, (todo, clave) =>
    Object.prototype.hasOwnProperty.call(datos, clave) ? datos[clave] : todo);
}

app.get('/', (req, res) => {
  res.type('html').send(render(PAGINAS.alta, brandFor(req)));
});

// Archivos estáticos (css, fuentes, iconos, arte del calendario).
// index:false para que '/' siempre pase por render() y reciba su marca.
app.use(express.static(PUBLIC_DIR, { index: false }));

// ---------- /mi — el área del profesional ----------
//
// Sin sesión no hay nada que enseñar: se manda al alta. La comprobación de
// verdad la hace cada ruta de /api/mi; esto es solo para no pintar una
// pantalla vacía.
app.get('/mi', (req, res) => {
  if (!req.pro) return res.redirect('/');
  res.type('html').send(render(PAGINAS.mi, brandFor(req), {
    HANDLE: req.pro.handle,
  }));
});

// ---------- flecos.mx/juan — la página pública ----------
const { normalize, validate } = require('./src/handles');
const { db } = require('./src/db');
const negocio = require('./src/negocio');
const findHandle = db.prepare('SELECT * FROM handles WHERE brand = ? AND handle = ?');

// Escapa lo que va a salir dentro del HTML. El nombre del negocio lo escribe
// el propio profesional, pero igual se escapa: es texto de usuario metido en
// una plantilla, y ese es el camino corto a un XSS.
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

app.get('/:handle', (req, res, next) => {
  const brand = brandFor(req);
  const handle = normalize(req.params.handle);
  if (!validate(handle).valid) return next();

  const row = findHandle.get(brand.id, handle);
  if (!row) return next();

  const n = negocio.de(row.id);
  const nombre = n.nombre || row.display_name || row.handle;

  res.type('html').send(render(PAGINAS.publica, brand, {
    HANDLE: esc(row.handle),
    NEGOCIO: esc(nombre),
    // El <title> y la descripción van servidos, no puestos por JavaScript:
    // así WhatsApp y Google ven el nombre real al compartir la liga.
    TITULO: esc(`${nombre} · ${brand.domain}/${row.handle}`),
  }));
});

// Errores: JSON limpio, nunca HTML
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'invalid JSON body' });
  }
  console.error(err);
  res.status(500).json({ error: 'internal error' });
});

// Solo levanta el puerto cuando se corre de verdad (`node server.js`). Al
// hacer require desde las pruebas, se exporta la app y cada prueba escucha en
// un puerto libre (listen(0)) sin chocar con el servidor de desarrollo.
if (require.main === module) {
  app.listen(PORT, () => {
    const which = ENV_BRAND ? `marca fija: ${ENV_BRAND}` : `marca por Host (default: flecos)`;
    console.log(`Flecos y Barbas en http://localhost:${PORT}  (${which}, auth: ${auth.MODE})`);
    if (!ENV_BRAND) {
      console.log(`  Flecos: http://localhost:${PORT}`);
      console.log(`  Barbas: curl -H 'Host: barbas.mx' http://localhost:${PORT}`);
    }
    void BRANDS;
  });
}

module.exports = app;
