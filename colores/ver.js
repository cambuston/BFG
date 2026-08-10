// Prueba colores de marca SIN tocar nada del código que corre.
//
//   node colores/ver.js                       todos los de paleta.js
//   node colores/ver.js "#9F1239"             un color suelto
//   node colores/ver.js --tema flecosMaqueta  un TEMA completo de temas.js
//   node colores/ver.js --temas               todos los temas
//
// Levanta su propio servidor con una base de usar y tirar, da de alta un
// negocio de ejemplo, y pinta cada color en las dos pantallas que importan:
// el alta y la página pública. Deja las capturas y una hoja de contactos en
// colores/muestras/.
//
// CÓMO PINTA EL COLOR SIN EDITAR src/brand.js: el servidor incrusta el color
// en un <style> con :root { --brand-blue: … }, y aquí simplemente se le mete
// otra regla encima con addStyleTag. Es exactamente el mismo mecanismo que
// usa la app, así que lo que se ve es lo que se vería de verdad.

const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');

const paleta = require('./paleta');
const temas = require('./temas');

const RAIZ = path.join(__dirname, '..');
const SALIDA = path.join(__dirname, 'muestras');
const TELEFONO = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 };

// ---------------------------------------------------------------------------
// Contraste (WCAG). La app es TEXTO BLANCO sobre el color de marca, así que
// este número decide si un color sirve o no.
// ---------------------------------------------------------------------------

function aRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminancia(hex) {
  const rgb = aRgb(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Contra blanco puro, que es el color de casi todo el texto de la app.
function contraste(hex) {
  const l = luminancia(hex);
  return l === null ? null : (1.0 + 0.05) / (l + 0.05);
}

// AA pide 4.5 para texto normal. Y el cuerpo de la app va en Inter 200 —muy
// delgada—, así que quedarse justo en 4.5 es quedarse corto en la práctica.
function veredicto(c) {
  if (c === null) return { nivel: 'malo', texto: 'color inválido' };
  // Cerca del límite se enseñan 3 decimales: con 2, un 4.4996 se imprimía
  // "4.50 · NO llega a 4.5", que parece un error del programa y no lo es.
  const n = Math.abs(c - 4.5) < 0.05 ? c.toFixed(3) : c.toFixed(2);
  if (c < 4.5) return { nivel: 'malo', texto: `${n} · NO llega a AA (4.5)` };
  if (c < 5.5) return { nivel: 'justo', texto: `${n} · justo en el límite` };
  if (c < 7) return { nivel: 'bien', texto: `${n} · cómodo` };
  return { nivel: 'bien', texto: `${n} · de sobra` };
}

// ---------------------------------------------------------------------------
// Servidor de usar y tirar
// ---------------------------------------------------------------------------

function puertoLibre() {
  return new Promise((res, rej) => {
    const s = net.createServer();
    s.on('error', rej);
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => res(port)); });
  });
}

async function arranca(db) {
  const port = await puertoLibre();
  const hijo = spawn(process.execPath, [path.join(RAIZ, 'server.js')], {
    cwd: RAIZ,
    env: { ...process.env, PORT: String(port), FYB_DB_PATH: db, AUTH_MODE: 'demo', BRAND: 'flecos' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let salida = '';
  hijo.stderr.on('data', (d) => { salida += d; });
  await new Promise((res, rej) => {
    const plazo = setTimeout(() => rej(new Error(`el servidor no arrancó. ${salida}`)), 15000);
    hijo.stdout.on('data', (d) => {
      salida += d;
      if (salida.includes('Flecos y Barbas en')) { clearTimeout(plazo); res(); }
    });
    hijo.on('exit', (c) => { clearTimeout(plazo); rej(new Error(`el servidor murió (${c}). ${salida}`)); });
  });
  return { port, url: `http://localhost:${port}`, hijo };
}

function pide(base, ruta, cuerpo) {
  const u = new URL(ruta, base);
  return new Promise((res, rej) => {
    const datos = JSON.stringify(cuerpo);
    const req = http.request({
      port: u.port, hostname: u.hostname, path: u.pathname, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(datos) },
    }, (r) => { r.resume(); r.on('end', res); });
    req.on('error', rej);
    req.write(datos); req.end();
  });
}

// ---------------------------------------------------------------------------

// Un tema completo se pinta con las MISMAS variables que incrusta el
// servidor (src/brand.js), así que lo que se ve es lo que se vería de verdad.
function cssDeTema(t) {
  const v = {
    '--fondo': t.fondo, '--tinta-fondo': t.tintaFondo, '--papel': t.papel,
    '--superficie': t.superficie, '--tinta': t.tinta, '--acento': t.acento,
    '--logo': t.logo, '--text': t.texto || '#1B2A4A',
    '--sombra': t.sombra, '--sombra-accion': t.sombraAccion || '0 35 130',
    '--herraje': `var(--herraje-${t.herraje || 'plata'})`,
    '--brand-blue': t.superficie, '--primary': t.acento, '--secondary': t.acento,
  };
  return ':root{' + Object.entries(v).map(([k, x]) => `${k}:${x}!important`).join(';') + '}';
}

async function main() {
  const args = process.argv.slice(2);

  let lista;
  if (args[0] === '--temas' || args[0] === '--tema') {
    const cuales = args[0] === '--temas' ? Object.keys(temas) : args.slice(1);
    const faltan = cuales.filter((n) => !temas[n]);
    if (!cuales.length || faltan.length) {
      console.error('Temas que no conozco:', faltan.join(', ') || '(ninguno)');
      console.error('Hay:', Object.keys(temas).join(', '));
      process.exit(1);
    }
    lista = cuales.map((n) => ({
      id: n, nombre: n, color: temas[n].superficie, nota: 'tema completo',
      css: cssDeTema(temas[n]),
    }));
  } else if (args.length) {
    lista = args.map((c, i) => ({ id: `color-${i + 1}`, nombre: c, color: c, nota: '' }));
  } else {
    lista = [...paleta.actuales, ...paleta.candidatos];
  }

  const malos = lista.filter((c) => !aRgb(c.color));
  if (malos.length) {
    console.error('Colores que no entiendo (usa #RRGGBB):', malos.map((m) => m.color).join(', '));
    process.exit(1);
  }

  fs.rmSync(SALIDA, { recursive: true, force: true });
  fs.mkdirSync(SALIDA, { recursive: true });

  const db = path.join(os.tmpdir(), `fyb-colores-${process.pid}.db`);
  const app = await arranca(db);

  // Un negocio de ejemplo, para que la página pública tenga qué enseñar.
  await pide(app.url, '/api/handle/claim', {
    handle: 'juan', auth: { provider: 'google', sub: 'colores', name: 'Juan Pérez' },
  });

  const navegador = await chromium.launch();
  const filas = [];

  console.log(`\nProbando ${lista.length} color(es). El texto de la app es blanco:\n`);

  for (const c of lista) {
    const v = veredicto(contraste(c.color));
    const ctx = await navegador.newContext(TELEFONO);
    const page = await ctx.newPage();

    // El mismo mecanismo que usa el servidor: pisar las variables de :root.
    // Con --tema viene el juego completo; con un color suelto, solo el color.
    const css = c.css
      || `:root{--fondo:${c.color}!important;--superficie:${c.color}!important;`
         + `--acento:${c.color}!important;--brand-blue:${c.color}!important;`
         + `--primary:${c.color}!important;--secondary:${c.color}!important}`;

    const tiros = {};
    for (const [nombre, ruta] of [['alta', '/'], ['publica', '/juan']]) {
      await page.goto(app.url + ruta);
      await page.addStyleTag({ content: css });
      // El alta se ve mejor con el botón encendido.
      if (nombre === 'alta') {
        await page.fill('#handle', 'juan-nuevo');
        await page.waitForFunction(() => !document.getElementById('handle-go').disabled)
          .catch(() => {});
      }
      await page.waitForTimeout(500);
      const archivo = `${c.id}-${nombre}.png`;
      await page.screenshot({ path: path.join(SALIDA, archivo) });
      tiros[nombre] = archivo;
    }

    await ctx.close();
    filas.push({ ...c, ...v, contraste: contraste(c.color), tiros });

    const marca = { bien: '  ok  ', justo: ' justo', malo: '  MAL ' }[v.nivel];
    console.log(`  ${marca}  ${c.color}  ${c.nombre.padEnd(16)} ${v.texto}`);
  }

  await navegador.close();
  app.hijo.kill();
  for (const f of [db, `${db}-wal`, `${db}-shm`]) { try { fs.unlinkSync(f); } catch (e) { /* puede no existir */ } }

  hojaDeContactos(filas);
  console.log(`\nHoja de contactos: colores/muestras/index.html\n`);
}

// Una sola página con todos los colores lado a lado. Comparar en el navegador
// es mucho más útil que abrir PNG uno por uno.
function hojaDeContactos(filas) {
  const tarjetas = filas.map((f) => `
    <figure class="c ${f.nivel}">
      <div class="tiros">
        <img src="${f.tiros.alta}" alt="Alta en ${f.nombre}" loading="lazy">
        <img src="${f.tiros.publica}" alt="Página pública en ${f.nombre}" loading="lazy">
      </div>
      <figcaption>
        <span class="muestra" style="background:${f.color}"></span>
        <b>${f.nombre}</b>
        <code>${f.color}</code>
        <span class="contraste">${f.texto}</span>
        ${f.nota ? `<span class="nota">${f.nota}</span>` : ''}
      </figcaption>
    </figure>`).join('\n');

  fs.writeFileSync(path.join(SALIDA, 'index.html'), `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Flecos y Barbas · colores</title>
<style>
  body{margin:0;padding:28px;background:#11151f;color:#e8ecf5;
       font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
  h1{font-size:1.5rem;font-weight:500;margin:0 0 6px}
  p.sub{margin:0 0 28px;opacity:.65;font-size:.95rem;max-width:60ch}
  .rejilla{display:grid;gap:26px;grid-template-columns:repeat(auto-fill,minmax(330px,1fr))}
  .c{margin:0;background:#1a2030;border-radius:14px;padding:14px;border:1px solid #2a3245}
  .c.malo{border-color:#8b2e3d}
  .c.justo{border-color:#8a6d1f}
  .tiros{display:flex;gap:8px}
  .tiros img{width:calc(50% - 4px);border-radius:8px;display:block}
  figcaption{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:12px;font-size:.9rem}
  .muestra{width:20px;height:20px;border-radius:6px;border:1px solid #3a4459}
  code{background:#0d1119;padding:2px 7px;border-radius:5px;font-size:.85rem}
  .contraste{width:100%;opacity:.8;font-size:.85rem}
  .malo .contraste{color:#ff9aa8}
  .justo .contraste{color:#ffd27a}
  .nota{width:100%;opacity:.5;font-size:.82rem}
</style></head><body>
<h1>Colores de marca</h1>
<p class="sub">Izquierda el alta, derecha la página pública. El contraste es del
texto blanco sobre el color: AA pide 4.5, y como el cuerpo va en Inter 200 (muy
delgada), quedarse en 4.5 se queda corto. Generado con
<code>node colores/ver.js</code>.</p>
<div class="rejilla">${tarjetas}</div>
</body></html>`);
}

main().catch((e) => { console.error(e); process.exit(1); });
