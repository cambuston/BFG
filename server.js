const path = require('path');
const fs = require('fs');
const express = require('express');

const { brandFor, BRANDS, ENV_BRAND } = require('./src/brand');
const handlesRoutes = require('./src/handles.routes');
const auth = require('./src/auth');

const app = express();
const PORT = process.env.PORT || 3100;
const PUBLIC_DIR = path.join(__dirname, 'public');

app.use(express.json({ limit: '32kb' }));

// Qué marca soy y cómo se inicia sesión. El navegador ya recibe la marca
// incrustada en el HTML (ver renderIndex); esto es para el resto.
app.get('/api/config', (req, res) => {
  const brand = brandFor(req);
  res.json({ brand, auth: auth.publicConfig() });
});

// Identidad verificada ANTES de tocar la base. El navegador nunca decide
// quién es: en modo supabase esto llama a Supabase con el access_token.
app.post('/api/handle/claim', auth.required);
app.use('/api/handle', handlesRoutes);

// ---------- Frontend ----------
//
// El HTML se sirve con la marca ya incrustada (color, nombre, dominio). Así
// Barbas nunca parpadea en azul de Flecos antes de que corra el JavaScript.
const INDEX_PATH = path.join(PUBLIC_DIR, 'index.html');

function renderIndex(brand) {
  // Se lee en cada petición a propósito: editar el HTML y recargar basta,
  // sin reiniciar el servidor. Es un archivo de 8 KB.
  const html = fs.readFileSync(INDEX_PATH, 'utf8');
  return html
    .replace(/\{\{BRAND_JSON\}\}/g, JSON.stringify(brand).replace(/</g, '\\u003c'))
    .replace(/\{\{BRAND_COLOR\}\}/g, brand.color)
    .replace(/\{\{BRAND_NAME\}\}/g, brand.name)
    .replace(/\{\{BRAND_DOMAIN\}\}/g, brand.domain)
    .replace(/\{\{BRAND_TAGLINE\}\}/g, brand.tagline);
}

app.get('/', (req, res) => {
  res.type('html').send(renderIndex(brandFor(req)));
});

// Archivos estáticos (css, fuentes, iconos, arte del calendario).
// index:false para que '/' siempre pase por renderIndex y reciba su marca.
app.use(express.static(PUBLIC_DIR, { index: false }));

// flecos.mx/juan — la página pública del profesional.
//
// TODAVÍA NO EXISTE: el alta (pasos 1 y 2) es lo único construido. Esto
// evita un 404 que se ve roto y confirma que el identificador quedó tomado.
const { normalize, validate } = require('./src/handles');
const { db } = require('./src/handles.db');
const findHandle = db.prepare('SELECT handle, display_name FROM handles WHERE brand = ? AND handle = ?');

app.get('/:handle', (req, res, next) => {
  const brand = brandFor(req);
  const handle = normalize(req.params.handle);
  if (!validate(handle).valid) return next();

  const row = findHandle.get(brand.id, handle);
  if (!row) return next();

  res.type('html').send(`<!DOCTYPE html>
<html lang="es"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>${brand.domain}/${row.handle}</title>
<meta name="theme-color" content="${brand.color}">
<link rel="stylesheet" href="/fonts/fonts.css">
<style>
  :root { --brand-blue: ${brand.color}; }
  body { margin:0; min-height:100vh; display:grid; place-items:center; padding:24px;
         font-family:'Inter',system-ui,sans-serif; font-weight:200; text-align:center;
         background:var(--brand-blue); color:#fff; }
  h1 { font-size:1.8rem; font-weight:400; letter-spacing:.06em; margin:0 0 10px; }
  p  { margin:0; opacity:.85; }
  .u { margin-top:18px; font-size:.95rem; opacity:.7; }
</style>
</head><body><div>
  <h1>${row.display_name || row.handle}</h1>
  <p>Aquí va la página pública: servicios, horarios y “Hacer cita”.</p>
  <p class="u">${brand.domain}/${row.handle} · apartado ✓</p>
</div></body></html>`);
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
