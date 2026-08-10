// Pinta las TRES marcas juntas, familia por familia.
//
//   node colores/ver-familias.js
//
// Va aparte de ver.js porque el trabajo es distinto: ver.js compara colores
// sueltos en una marca, y esto compara FAMILIAS completas. Levanta un servidor
// por marca (cada uno con su base de usar y tirar, si comparten archivo SQLite
// se pelean por el candado) y saca las dos pantallas que importan.
//
// La salida es colores/muestras-familias/index.html: una fila por familia, las
// tres marcas en columnas. Es el artefacto para decidir mirando, no leyendo.

const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');

const familias = require('./familias');

const RAIZ = path.join(__dirname, '..');
const SALIDA = path.join(__dirname, 'muestras-familias');
const TELEFONO = { viewport: { width: 390, height: 780 }, deviceScaleFactor: 2 };
const MARCAS = ['flecos', 'barbas', 'garras'];

// --- contraste (ver colores/README.md) ---
const aRgb = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const luz = (hex) => {
  const rgb = aRgb(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
// Contra blanco. Sirve para las dos preguntas que importan:
//   texto blanco sobre la superficie  → alto es bueno
//   el acento como texto sobre blanco → alto es bueno
const contraste = (hex) => (luz(hex) === null ? null : 1.05 / (luz(hex) + 0.05));

// --- servidores ---
function puertoLibre() {
  return new Promise((res, rej) => {
    const s = net.createServer();
    s.on('error', rej);
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => res(port)); });
  });
}

async function arranca(marca) {
  const port = await puertoLibre();
  const db = path.join(os.tmpdir(), `fyb-fam-${marca}-${process.pid}.db`);
  const hijo = spawn(process.execPath, [path.join(RAIZ, 'server.js')], {
    cwd: RAIZ,
    env: { ...process.env, PORT: String(port), FYB_DB_PATH: db, AUTH_MODE: 'demo', BRAND: marca },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let salida = '';
  hijo.stderr.on('data', (d) => { salida += d; });
  await new Promise((res, rej) => {
    const plazo = setTimeout(() => rej(new Error(`${marca} no arrancó. ${salida}`)), 15000);
    hijo.stdout.on('data', (d) => {
      salida += d;
      if (salida.includes('Flecos y Barbas en')) { clearTimeout(plazo); res(); }
    });
    hijo.on('exit', (c) => { clearTimeout(plazo); rej(new Error(`${marca} murió (${c}). ${salida}`)); });
  });
  return { marca, port, url: `http://localhost:${port}`, db, hijo };
}

function siembra(base) {
  const u = new URL('/api/handle/claim', base);
  const cuerpo = JSON.stringify({
    handle: 'ana', auth: { provider: 'google', sub: 'fam', name: 'Ana Ruiz' },
  });
  return new Promise((res, rej) => {
    const req = http.request({
      port: u.port, hostname: u.hostname, path: u.pathname, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(cuerpo) },
    }, (r) => { r.resume(); r.on('end', res); });
    req.on('error', rej);
    req.write(cuerpo); req.end();
  });
}

// Las mismas variables que incrusta el servidor (ver src/brand.js), para que
// lo que se ve sea lo que se vería de verdad.
function cssDeTema(t) {
  const v = {
    '--fondo': t.fondo, '--tinta-fondo': t.tintaFondo, '--papel': t.papel,
    '--superficie': t.superficie, '--tinta': t.tinta, '--acento': t.acento,
    '--logo': t.logo, '--text': t.texto, '--sombra': t.sombra,
    '--sombra-accion': t.sombraAccion,
    '--herraje': `var(--herraje-${t.herraje})`,
    '--brand-blue': t.superficie, '--primary': t.acento, '--secondary': t.acento,
  };
  return ':root{' + Object.entries(v).map(([k, x]) => `${k}:${x}!important`).join(';') + '}';
}

async function main() {
  fs.rmSync(SALIDA, { recursive: true, force: true });
  fs.mkdirSync(SALIDA, { recursive: true });

  const apps = {};
  for (const m of MARCAS) {
    // De uno en uno: arrancar los tres a la vez hace que SQLite se pelee.
    apps[m] = await arranca(m);
    await siembra(apps[m].url);
  }

  const navegador = await chromium.launch();
  const filas = [];

  for (const [clave, fam] of Object.entries(familias)) {
    console.log(`\n${fam.nombre}  —  ${fam.idea}`);
    const celdas = [];

    for (const marca of MARCAS) {
      const t = fam.temas[marca];
      const css = cssDeTema(t);
      const ctx = await navegador.newContext(TELEFONO);
      const page = await ctx.newPage();
      const tiros = {};

      for (const [nombre, ruta] of [['publica', '/ana'], ['alta', '/']]) {
        await page.goto(apps[marca].url + ruta);
        await page.addStyleTag({ content: css });
        if (nombre === 'alta') {
          await page.fill('#handle', 'nueva-clienta');
          await page.waitForFunction(() => !document.getElementById('handle-go').disabled)
            .catch(() => {});
        }
        await page.waitForTimeout(450);
        const archivo = `${clave}-${marca}-${nombre}.png`;
        await page.screenshot({ path: path.join(SALIDA, archivo) });
        tiros[nombre] = archivo;
      }
      await ctx.close();

      const cSup = contraste(t.superficie);   // texto blanco encima
      const cAcc = contraste(t.acento);       // el acento como texto sobre blanco
      celdas.push({ marca, tema: t, tiros, cSup, cAcc });

      const mal = cAcc < 4.5 || cSup < 4.5;
      console.log(`   ${mal ? '⚠ ' : '  '}${marca.padEnd(7)} superficie ${cSup.toFixed(2)} · acento sobre blanco ${cAcc.toFixed(2)}`);
    }
    filas.push({ clave, ...fam, celdas });
  }

  await navegador.close();
  for (const m of MARCAS) {
    apps[m].hijo.kill();
    for (const f of [apps[m].db, `${apps[m].db}-wal`, `${apps[m].db}-shm`]) {
      try { fs.unlinkSync(f); } catch (e) { /* puede no existir */ }
    }
  }

  hoja(filas);
  console.log('\nHoja: colores/muestras-familias/index.html\n');
}

function hoja(filas) {
  const NOMBRE = { flecos: 'Flecos · peluquería', barbas: 'Barbas · barbería', garras: 'Garras · uñas' };

  const secciones = filas.map((f) => `
    <section class="fam">
      <h2>${f.nombre}</h2>
      <p class="idea">${f.idea}</p>
      <div class="tres">
        ${f.celdas.map((c) => `
          <figure>
            <figcaption>
              <b>${NOMBRE[c.marca]}</b>
              <span class="chips">
                <i style="background:${c.tema.fondo}"></i>
                <i style="background:${c.tema.superficie}"></i>
                <i style="background:${c.tema.acento}"></i>
                <i style="background:${c.tema.papel}"></i>
                <em>${c.tema.herraje}</em>
              </span>
              <span class="ct ${c.cAcc < 4.5 ? 'mal' : ''}">
                blanco/superficie ${c.cSup.toFixed(1)} · acento/blanco ${c.cAcc.toFixed(1)}
              </span>
            </figcaption>
            <div class="par">
              <img src="${c.tiros.publica}" alt="" loading="lazy">
              <img src="${c.tiros.alta}" alt="" loading="lazy">
            </div>
          </figure>`).join('')}
      </div>
    </section>`).join('');

  fs.writeFileSync(path.join(SALIDA, 'index.html'), `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Flecos · Barbas · Garras — las tres juntas</title>
<style>
  body{margin:0;padding:30px;background:#0e1117;color:#e9edf5;
       font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
  h1{font-size:1.6rem;font-weight:500;margin:0 0 6px}
  p.top{margin:0 0 34px;opacity:.62;max-width:70ch;font-size:.95rem}
  .fam{margin-bottom:44px;padding-bottom:34px;border-bottom:1px solid #232a38}
  .fam:last-child{border:0}
  h2{font-size:1.15rem;font-weight:600;margin:0 0 4px}
  .idea{margin:0 0 18px;opacity:.6;font-size:.9rem}
  .tres{display:grid;gap:20px;grid-template-columns:repeat(3,1fr)}
  @media(max-width:1000px){.tres{grid-template-columns:1fr}}
  figure{margin:0;background:#161b24;border:1px solid #232a38;border-radius:12px;padding:12px}
  figcaption{display:flex;flex-direction:column;gap:6px;margin-bottom:10px;font-size:.88rem}
  .chips{display:flex;align-items:center;gap:5px}
  .chips i{width:17px;height:17px;border-radius:5px;border:1px solid #39435a}
  .chips em{font-style:normal;opacity:.5;font-size:.78rem;margin-left:4px}
  .ct{opacity:.55;font-size:.78rem}
  .ct.mal{color:#ff9aa8;opacity:1}
  .par{display:flex;gap:8px}
  .par img{width:calc(50% - 4px);border-radius:7px;display:block}
</style></head><body>
<h1>Las tres juntas</h1>
<p class="top">Cada fila es una familia completa: el mismo criterio aplicado a
Flecos, Barbas y Garras. En cada par, izquierda la página pública y derecha el
alta. Los dos contrastes son las dos preguntas que importan: el texto blanco
sobre la tarjeta, y el acento cuando hace de texto del botón sobre blanco —
ese segundo es el que descarta los oros y rosas bonitos pero ilegibles.</p>
${secciones}
</body></html>`);
}

main().catch((e) => { console.error(e); process.exit(1); });
