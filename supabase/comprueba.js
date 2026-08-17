// ¿Está bien configurado el Supabase de verdad?
//
//   npm run supabase
//
// Lee el .env y le pregunta al propio Supabase. Son cuatro comprobaciones, y
// las cuatro fallan por separado con instrucciones de qué tocar:
//
//   1. El .env tiene lo que hace falta y con buena pinta.
//   2. La URL y la anon key sirven                 → GET /auth/v1/settings
//   3. Hay proveedores prendidos (Google, …)       → lo dice ese mismo settings
//   4. La dirección de regreso está autorizada     → GET /auth/v1/authorize
//
// Solo LEE. No crea usuarios, no cambia nada del proyecto y no habla con
// Google ni con Apple: la 4 mira a dónde CONTESTA Supabase que hay que ir, sin
// seguir el viaje.
//
// Lo que este programa NO puede comprobar es lo último del camino: que el
// cliente de OAuth de Google tenga puesta la URL de callback de Supabase. Eso
// solo se ve entrando de verdad; la guía (README.md de esta carpeta) dice
// exactamente qué pegar y dónde.

const env = require('../src/env');

env.cargar();

const URL_BASE = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
const ANON = (process.env.SUPABASE_ANON_KEY || '').trim();
const MODO = (process.env.AUTH_MODE || 'demo').toLowerCase();

// La dirección a la que Supabase tiene que saber devolver a la gente. Es la
// del alta, que es donde vive el botón (public/app.js manda origin + '/').
const PUERTO = process.env.PORT || 3100;
const REGRESO = process.env.FYB_REGRESO || `http://localhost:${PUERTO}/`;

let fallos = 0;
let avisos = 0;

const ok = (t) => console.log(`  ok    ${t}`);
const mal = (t, comoSeArregla) => {
  fallos++;
  console.log(`  MAL   ${t}`);
  if (comoSeArregla) console.log(`        → ${comoSeArregla}`);
};
const aviso = (t, nota) => {
  avisos++;
  console.log(`  ojo   ${t}`);
  if (nota) console.log(`        → ${nota}`);
};

async function main() {
  console.log('\nSupabase — comprobación\n');

  // De dónde sale todo lo que se lee aquí. Sin esta línea, «falta SUPABASE_URL»
  // manda a arreglar el .env equivocado.
  if (env.usado()) console.log(`  ok    configuración: ${env.usado()}`);
  else aviso(`no encontré ningún .env (busqué en ${env.RUTAS.join(' y en ')})`);

  // --- 1. El .env -----------------------------------------------------------
  if (!URL_BASE && !ANON) {
    mal('no hay SUPABASE_URL ni SUPABASE_ANON_KEY',
      'copia .env.example a .env y rellena las dos. La guía: supabase/README.md');
    return terminar();
  }
  if (!URL_BASE) {
    mal('falta SUPABASE_URL', 'Supabase → Project Settings → API → Project URL');
    return terminar();
  }
  if (!ANON) {
    mal('falta SUPABASE_ANON_KEY', 'Supabase → Project Settings → API → anon public');
    return terminar();
  }

  if (!/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/.test(URL_BASE)) {
    aviso(`SUPABASE_URL con forma rara: ${URL_BASE}`,
      'se espera https://xxxxxxxx.supabase.co, sin barra al final ni /rest/v1');
  } else {
    ok(`SUPABASE_URL ${URL_BASE}`);
  }

  // Supabase tiene DOS formatos de llave, y los dos siguen sirviendo:
  //
  //   sb_publishable_…  la nueva, pública. Su pareja secreta es sb_secret_…
  //   eyJ…              la vieja: un JWT con el rol dentro (anon | service_role)
  //
  // Lo que importa en los dos casos es lo mismo: que no sea la SECRETA, porque
  // esta llave va al navegador.
  const partes = ANON.split('.');

  if (ANON.startsWith('sb_secret_')) {
    mal('SUPABASE_ANON_KEY es la llave secreta (sb_secret_…)',
      'esa no sale del servidor. Usa la publicable: sb_publishable_…');
  } else if (ANON.startsWith('sb_publishable_')) {
    ok('SUPABASE_ANON_KEY es la llave publicable (el formato nuevo)');
  } else if (partes.length !== 3) {
    aviso('SUPABASE_ANON_KEY con forma desconocida',
      '¿pegaste la llave completa? Empieza por sb_publishable_ o por eyJ');
  } else {
    let rol = null;
    try {
      rol = JSON.parse(Buffer.from(partes[1], 'base64url').toString('utf8')).role;
    } catch (e) { /* si no se puede leer, lo dirá la llamada de abajo */ }

    if (rol === 'service_role') {
      mal('SUPABASE_ANON_KEY es la llave service_role',
        'esa es SECRETA y esta va al navegador. Usa la "anon public".');
    } else if (rol === 'anon') {
      ok('SUPABASE_ANON_KEY es la anon key');
    } else {
      aviso(`SUPABASE_ANON_KEY con rol "${rol || 'desconocido'}"`, 'se esperaba "anon"');
    }
  }

  if (MODO !== 'supabase') {
    aviso(`AUTH_MODE=${MODO}: la app sigue con la cuenta de mentiras`,
      'pon AUTH_MODE=supabase en .env cuando lo de abajo salga en verde');
  } else {
    ok('AUTH_MODE=supabase');
  }

  // --- 2 y 3. ¿Responde? ¿Con qué proveedores? -----------------------------
  let ajustes;
  try {
    const r = await fetch(`${URL_BASE}/auth/v1/settings`, { headers: { apikey: ANON } });
    if (r.status === 401) {
      mal('Supabase contesta 401: la anon key no es de este proyecto',
        'Project Settings → API: la URL y la llave tienen que ser del MISMO proyecto');
      return terminar();
    }
    if (!r.ok) {
      mal(`Supabase contesta ${r.status} en /auth/v1/settings`, 'revisa la URL del proyecto');
      return terminar();
    }
    ajustes = await r.json();
    ok('la URL y la llave sirven: Supabase contesta');
  } catch (e) {
    mal(`no se pudo hablar con Supabase (${e.message})`,
      '¿hay internet? ¿el proyecto sigue vivo? Supabase duerme los proyectos gratis inactivos');
    return terminar();
  }

  const externos = (ajustes && ajustes.external) || {};
  const prendidos = ['google', 'apple'].filter((p) => externos[p]);

  if (!prendidos.length) {
    mal('no hay ningún proveedor prendido (Google, Apple)',
      'Supabase → Authentication → Providers. Con Google basta para arrancar.');
  } else {
    ok(`proveedores prendidos: ${prendidos.join(', ')}`);
    for (const p of ['google', 'apple']) {
      if (!externos[p]) aviso(`${p} apagado`, 'la app enseña su botón igual, y ese botón fallará');
    }
  }

  // --- 4. ¿La dirección de regreso está autorizada? ------------------------
  //
  // Si no lo está, Supabase no rebota a Google: devuelve a la gente a su Site
  // URL con ?error=. Eso, en la app, es una vuelta al alta sin explicación.
  const proveedor = prendidos[0] || 'google';
  try {
    const u = `${URL_BASE}/auth/v1/authorize?provider=${proveedor}`
      + `&redirect_to=${encodeURIComponent(REGRESO)}`;
    const r = await fetch(u, { redirect: 'manual', headers: { apikey: ANON } });
    const destino = r.headers.get('location') || '';

    if (!destino) {
      aviso(`no se pudo comprobar el regreso (Supabase contestó ${r.status} sin redirección)`,
        `comprueba a mano que ${REGRESO} esté en Authentication → URL Configuration → Redirect URLs`);
    } else if (/[?#&]error/.test(destino)) {
      const detalle = decodeURIComponent((/error_description=([^&]*)/.exec(destino) || [, ''])[1])
        .replace(/\+/g, ' ');
      mal(`Supabase rechaza volver a ${REGRESO}${detalle ? ` (${detalle})` : ''}`,
        'Authentication → URL Configuration → Redirect URLs: agrégala tal cual, con la barra final');
    } else {
      ok(`el regreso a ${REGRESO} está autorizado (rebota a ${new URL(destino).host})`);
    }
  } catch (e) {
    aviso(`no se pudo comprobar el regreso (${e.message})`);
  }

  terminar();
}

function terminar() {
  console.log('');
  if (fallos) {
    console.log(`  ${fallos} cosa(s) que arreglar. La guía: supabase/README.md\n`);
    process.exitCode = 1;
  } else if (avisos) {
    console.log('  Sirve, con avisos. Arranca con: npm start\n');
  } else {
    console.log('  Todo listo. Arranca con: npm start\n');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
