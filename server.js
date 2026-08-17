// El .env, ANTES que nada. Los módulos de abajo leen process.env al cargarse
// (la marca, el modo de cuenta, la ruta de la base), así que si esto no va
// primero, leen un entorno a medias.
require('./src/env').cargar();

const path = require('path');
const fs = require('fs');
const express = require('express');

const { brandFor, BRANDS, ENV_BRAND, variablesCss } = require('./src/brand');
const handlesRoutes = require('./src/handles.routes');
const miRoutes = require('./src/mi.routes');
const publicoRoutes = require('./src/publico.routes');
const authRoutes = require('./src/auth.routes');
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
    auth: auth.publicConfig(brand.id),
    // Para que el navegador sepa si mandar a alguien al alta o a su agenda.
    sesion: req.pro ? { handle: req.pro.handle } : null,
  });
});

// Identidad verificada ANTES de tocar la base. El navegador nunca decide
// quién es: en modo supabase esto llama a Supabase con el access_token.
app.post('/api/handle/claim', auth.required);
app.use('/api/handle', handlesRoutes);

// El viaje a Google sin intermediario (AUTH_MODE=propio). Va ANTES de la ruta
// de la página pública (/:handle) porque `auth` es un nombre de la app, no de
// nadie: está apartado en src/handles.js.
app.use('/auth', authRoutes);

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
//   index.html    /            el alta (dirección, cuenta, horario, servicios)
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
// Los iconos son POR MARCA, y van antes que los estáticos porque el nombre es
// el mismo para las tres: /favicon.ico de barbas.mx tiene que dar la barba, no
// el fleco. El arte de cada una vive en public/marca/<marca>/.
const ICONOS = ['favicon.ico', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png'];
app.get(ICONOS.map((f) => `/${f}`), (req, res) => {
  const archivo = path.basename(req.path);
  res.sendFile(path.join(PUBLIC_DIR, 'marca', brandFor(req).id, archivo));
});

// Apple no se cree que los dominios son tuyos: da un archivo de verificación
// por Services ID y hay que servirlo en /.well-known/ de cada dominio de ese
// Services ID. Es POR MARCA, como los iconos, porque cada marca tiene el suyo.
//
// Y NO se puede dejar en public/: express.static no sirve nada cuyo camino
// empiece por punto (`dotfiles: 'ignore'`), así que un archivo en
// public/.well-known/ contesta 404 sin decir por qué y Apple dice solo que no
// pudo verificar. Por eso vive aparte y con ruta propia.
// La carpeta se puede mover con FYB_APPLE_DOMINIOS; es lo que usan las pruebas
// para no escribir dentro del repo.
const DOMINIOS_APPLE = process.env.FYB_APPLE_DOMINIOS
  || path.join(__dirname, 'identidad', 'dominios');
app.get('/.well-known/apple-developer-domain-association.txt', (req, res, next) => {
  const archivo = path.join(DOMINIOS_APPLE, `${brandFor(req).id}.txt`);
  if (!fs.existsSync(archivo)) return next();   // esta marca aún no lo tiene
  res.type('text/plain').send(fs.readFileSync(archivo, 'utf8'));
});

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
