// ¿Está bien configurado el «entrar sin intermediario» de cada marca?
//
//   npm run identidad
//
// Lee el .env y revisa las dos formas de entrar, marca por marca.
//
// De Google, tres cosas, y la segunda y la tercera se las pregunta a él:
//
//   1. Hay credenciales (propias o generales).
//   2. Google reconoce el client_id.
//   3. Google acepta la dirección de regreso — el famoso
//      `redirect_uri_mismatch`, que es el 90% de los tropiezos.
//
// De Apple, lo que se puede saber con certeza sin entrar: que estén sus cuatro
// piezas y que la llave .p8 de verdad FIRME. A Apple NO se le pregunta, y no
// es por flojera: contesta que sí a cualquier cosa (ver revisaApple), así que
// preguntarle daría oks falsos. Lo que no se puede comprobar, se dice.
//
// Solo LEE: pide la pantalla de entrada y mira qué contesta, sin seguir el
// viaje. No crea usuarios ni cambia nada en ningún lado.

const env = require('../src/env');

env.cargar();

const { BRANDS } = require('../src/brand');
const oauth = require('../src/oauth');

const MODO = (process.env.AUTH_MODE || 'demo').toLowerCase();

// Dónde corre cada marca en local, que es donde se prueba. Son los mismos
// puertos de `npm run flecos|barbas|garras`.
//
// Y con FYB_ORIGEN se comprueba otro sitio:
//
//   FYB_ORIGEN=produccion         cada marca EN SU DOMINIO (flecos.mx,
//                                 barbas.mx, garras.mx) — es lo que se quiere
//                                 en el servidor
//   FYB_ORIGEN=https://loquesea   ese sitio para las tres, para un túnel https
//
// La palabra existe porque el despliegue son TRES dominios: pasar
// `https://flecos.mx` a secas comprobaba la dirección de regreso de Flecos
// tres veces y decía que Barbas y Garras estaban mal.
const PUERTOS = { flecos: 3100, barbas: 3101, garras: 3102 };
const ORIGEN = String(process.env.FYB_ORIGEN || '').trim().replace(/\/+$/, '');
const EN_PRODUCCION = /^(produccion|producción|prod)$/i.test(ORIGEN);

const origenDe = (id) => {
  if (EN_PRODUCCION) return `https://${BRANDS[id].domain}`;
  return ORIGEN || `http://localhost:${PUERTOS[id] || 3100}`;
};

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

// Le pide a Google la pantalla de entrada, sin seguirla, y traduce lo que
// conteste.
//
// OJO, que esto costó averiguarlo: Google NO devuelve un 400 con el motivo.
// Devuelve un 302, y hay que mirar A DÓNDE:
//
//   .../v3/signin/identifier?...     bien: te está pidiendo que entres
//   .../signin/oauth/error?authError=<base64>   mal, y el motivo va ahí dentro
//
// Sin decodificar ese `authError`, un `redirect_uri_mismatch` se ve igual que
// un viaje perfecto —los dos son 302— y el comprobador daría un ok falso, que
// es peor que no comprobar nada. La primera versión de esto lo daba.
async function pregunta(url) {
  let r;
  try {
    r = await fetch(url, { redirect: 'manual' });
  } catch (e) {
    return { error: e.message };
  }

  const destino = r.headers.get('location') || '';
  if (!/signin\/oauth\/error/.test(destino)) return { bien: true };

  let motivo = '';
  try {
    const codificado = new URL(destino).searchParams.get('authError') || '';
    motivo = Buffer.from(codificado, 'base64url').toString('utf8');
  } catch (e) { /* si no se puede leer, se reporta genérico */ }

  return { bien: false, motivo };
}

async function revisaGoogle(id, marca) {
  const cred = oauth.credenciales('google', id);
  if (!cred) {
    aviso(`${marca.name} no tiene credenciales de Google`,
      `pon GOOGLE_CLIENT_ID_${id.toUpperCase()} y GOOGLE_CLIENT_SECRET_${id.toUpperCase()} `
      + '(o los generales GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET para las tres)');
    return;
  }

  const propias = !!process.env[`GOOGLE_CLIENT_ID_${id.toUpperCase()}`];
  ok(`Google · credenciales ${propias ? 'propias' : 'generales'}: ${cred.id.slice(0, 24)}…`);
  if (!propias) {
    aviso('Google · usa las credenciales generales',
      'funciona, pero la pantalla enseñará el mismo nombre y logo que las otras marcas');
  }

  const regreso = `${origenDe(id)}/auth/google/callback`;
  const url = oauth.urlDeEntrada({
    proveedor: 'google', brandId: id, redirectUri: regreso, state: 'comprobacion',
  });

  const r = await pregunta(url);
  if (r.error) {
    aviso(`Google · no se pudo preguntar (${r.error})`, '¿hay internet?');
    return;
  }

  if (r.bien) {
    ok(`Google · acepta el regreso a ${regreso}`);
    await revisaGoogleConWww(id, marca);
  } else if (/redirect_uri_mismatch/i.test(r.motivo)) {
    mal(`Google · no acepta volver a ${regreso}`,
      'Google Cloud → Clients → tu cliente → Authorized redirect URIs: agrégala TAL CUAL');
  } else if (/deleted_client|invalid_client|unauthorized_client/i.test(r.motivo)) {
    mal('Google · no reconoce el client_id',
      '¿es de este proyecto? ¿lo borraste? Revisa Google Cloud → Clients');
  } else {
    mal(`Google · rechaza la entrada de ${marca.name}`,
      `lo que contesta: ${(r.motivo || 'sin detalle').split('\n')[0].slice(0, 120)}`);
  }
}

// El `www.` también llega a la app: nginx sirve los seis nombres y NO manda
// www al dominio pelado. Y la dirección de regreso se arma con el Host de la
// petición (`origen`, en src/auth.routes.js), así que quien entre por
// www.flecos.mx vuelve a www.flecos.mx y Google tiene que conocer esa también.
// Es el mismo redirect_uri_mismatch de siempre, pero solo lo pisa una parte de
// la gente, que es lo que lo hace difícil de encontrar después.
async function revisaGoogleConWww(id, marca) {
  if (!EN_PRODUCCION) return;

  const regreso = `https://www.${marca.domain}/auth/google/callback`;
  const url = oauth.urlDeEntrada({
    proveedor: 'google', brandId: id, redirectUri: regreso, state: 'comprobacion',
  });

  const r = await pregunta(url);
  if (r.error || r.bien) {
    if (r.bien) ok(`Google · acepta el regreso a ${regreso}`);
    return;
  }

  aviso(`Google · no acepta volver a ${regreso}`,
    `www.${marca.domain} también sirve la app, así que quien entre por ahí `
    + 'no podrá con Google: o agregas esa dirección de regreso, o haces que '
    + 'nginx mande www al dominio pelado');
}

// Apple SÍ se puede comprobar, pero solo de puertas adentro, y conviene saber
// por qué: a su pantalla de entrada se le puede pedir con un Services ID
// inventado y contesta un 200 con la pantalla de siempre; a su endpoint de
// token, con un equipo y una llave inventados, contesta `invalid_grant` (mira
// el code antes que al cliente). O sea que cualquier pregunta por red daría un
// «ok» a una configuración que no sirve —justo lo que este programa evita en
// Google decodificando el `authError`—. Un ok falso es peor que no comprobar.
//
// Así que aquí se comprueba lo que sí se puede saber con certeza, que además
// es donde está el error caro: que estén las cuatro piezas y que la llave de
// verdad FIRME.
function revisaApple(id, marca) {
  const M = id.toUpperCase();
  const cred = oauth.credenciales('apple', id);

  if (!cred) {
    // No basta con decir «no hay credenciales»: no es lo mismo no haber
    // empezado que haberlo hecho todo y pegar mal la llave, y las dos cosas
    // llegan aquí igual. Se mira qué falta de verdad.
    const hay = (n) => !!String(process.env[`${n}_${M}`] || process.env[n] || '').trim();
    const faltan = ['APPLE_CLIENT_ID', 'APPLE_TEAM_ID', 'APPLE_KEY_ID']
      .filter((n) => !hay(n));
    if (!hay('APPLE_PRIVATE_KEY') && !hay('APPLE_PRIVATE_KEY_FILE')) {
      faltan.push('APPLE_PRIVATE_KEY (o APPLE_PRIVATE_KEY_FILE)');
    }

    if (faltan.length) {
      aviso(`${marca.name} no tiene credenciales de Apple`,
        `faltan ${faltan.join(', ')}. Es opcional: sin ellas la marca `
        + 'simplemente no enseña el botón de Apple');
    } else {
      mal('Apple · la llave .p8 no se puede leer',
        'tiene que ser el archivo ENTERO, con sus dos líneas -----BEGIN/END-----. '
        + 'En el .env los saltos de línea van como «\\n»; con _FILE, revisa la ruta');
    }
    return;
  }

  const propias = !!process.env[`APPLE_CLIENT_ID_${M}`];
  ok(`Apple · credenciales ${propias ? 'propias' : 'generales'}: ${cred.id}`);
  if (!propias) {
    aviso('Apple · usa el Services ID general',
      'funciona, pero la pantalla enseñará el mismo nombre para las tres marcas');
  }

  // La que caza el error más común: la llave pegada a medias o con los saltos
  // de línea perdidos. Apple contesta a eso un `invalid_client` que no
  // menciona la llave por ningún lado.
  if (!oauth.secretoDeApple(cred)) {
    mal('Apple · la llave .p8 no sirve para firmar',
      'tiene que ser el archivo ENTERO, con sus dos líneas -----BEGIN/END-----. '
      + 'En el .env, los saltos de línea van como «\\n»; o usa APPLE_PRIVATE_KEY_FILE');
    return;
  }
  ok(`Apple · la llave ${cred.llaveId} firma (equipo ${cred.equipo})`);

  for (const [qué, valor] of [['APPLE_TEAM_ID', cred.equipo], ['APPLE_KEY_ID', cred.llaveId]]) {
    if (!/^[A-Z0-9]{10}$/i.test(valor)) {
      aviso(`Apple · ${qué} no tiene la pinta de siempre (${valor})`,
        'los de Apple son diez letras y números; revisa que no se haya colado un espacio');
    }
  }

  // Esto no se comprueba: se dice. Es el tropiezo equivalente al
  // `redirect_uri_mismatch` de Google, y solo se ve entrando de verdad.
  const regreso = `${origenDe(id)}/auth/apple/callback`;
  if (regreso.startsWith('http://')) {
    aviso('Apple · no admite localhost ni http: esto no se prueba en local',
      `en el portal va el dominio ${marca.domain} y la Return URL `
      + `https://${marca.domain}/auth/apple/callback`);
  } else {
    aviso(`Apple · falta comprobar a mano que acepta volver a ${regreso}`,
      'developer.apple.com → Identifiers → tu Services ID → Sign in with Apple → '
      + 'Configure → Return URLs, TAL CUAL (y el dominio arriba, sin https://). '
      + `Si www.${marca.domain} también sirve la app, va la suya también. `
      + 'Apple contesta lo mismo esté bien o mal, así que esto solo se ve entrando');
  }
}

async function main() {
  console.log('\nEntrar con Google y con Apple, sin intermediario — comprobación\n');

  // Lo PRIMERO, porque explica de dónde sale todo lo demás. Un comprobador que
  // dice «faltan las credenciales» sin decir dónde buscó manda a revisar el
  // .env equivocado.
  if (env.usado()) {
    ok(`configuración: ${env.usado()}`);
  } else {
    aviso(`no encontré ningún .env (busqué en ${env.RUTAS.join(' y en ')})`,
      'sin él, lo único que se ve es lo que traiga el entorno');
  }

  if (MODO !== 'propio') {
    aviso(`AUTH_MODE=${MODO}: la app NO está usando esto todavía`,
      'pon AUTH_MODE=propio en .env cuando lo de abajo salga en verde');
  } else {
    ok('AUTH_MODE=propio');
  }

  if (ORIGEN && !EN_PRODUCCION) {
    aviso(`FYB_ORIGEN=${ORIGEN} vale para las TRES marcas`,
      'si lo que quieres es comprobar el servidor, cada marca en su dominio: '
      + 'FYB_ORIGEN=produccion npm run identidad');
  }

  for (const id of Object.keys(BRANDS)) {
    const marca = BRANDS[id];
    console.log(`\n  ── ${marca.name} (${marca.domain}) ──`);
    await revisaGoogle(id, marca);
    revisaApple(id, marca);
  }

  console.log('');
  if (fallos) {
    console.log(`  ${fallos} cosa(s) que arreglar. La guía: identidad/README.md\n`);
    process.exitCode = 1;
  } else if (avisos) {
    console.log('  Sirve, con avisos.\n');
  } else {
    console.log('  Todo listo. Arranca con: npm start\n');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
