// Identidad social (Google / Apple).
//
// Tres modos, con la MISMA interfaz para el resto del código:
//
//   AUTH_MODE=demo      (default) No hay nada configurado. Los dos botones
//                       funcionan y el alta se completa de verdad, con una
//                       identidad de mentiras. Sirve para ver y probar el
//                       flujo completo hoy, sin dar de alta nada en ningún
//                       lado. NUNCA en producción.
//
//   AUTH_MODE=propio    Hablamos con Google y con Apple directamente, sin
//                       intermediario.
//                       Cada marca enseña SU dominio, su nombre y su logo en
//                       la pantalla del proveedor, y no hay mensualidad. El
//                       viaje vive en src/auth.routes.js y src/oauth.js.
//
//   AUTH_MODE=supabase  Supabase hace de portero. El navegador vuelve con un
//                       access_token y aquí se verifica contra Supabase ANTES
//                       de creer nada. Funciona, pero la pantalla de Google
//                       dice «Sign in to xxxx.supabase.co» —el dominio del
//                       portero— y es la MISMA cara para las tres marcas.
//
// Cambiar de uno a otro no toca ni el HTML ni las rutas: solo el .env.

const { BRANDS } = require('./brand');
const oauth = require('./oauth');

const MODE = (process.env.AUTH_MODE || 'demo').toLowerCase();
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

if (MODE === 'supabase' && (!SUPABASE_URL || !SUPABASE_ANON_KEY)) {
  throw new Error('AUTH_MODE=supabase requiere SUPABASE_URL y SUPABASE_ANON_KEY (ver .env.example)');
}

// En modo propio, arrancar sin credenciales sería arrancar con los botones
// rotos. Mejor no arrancar: un fallo al levantar se ve; una pantalla que no
// entra, no.
if (MODE === 'propio') {
  const conAlgo = Object.keys(BRANDS).filter((b) => oauth.disponibles(b).length);
  if (!conAlgo.length) {
    throw new Error(
      'AUTH_MODE=propio y ninguna marca tiene credenciales. Faltan GOOGLE_CLIENT_ID '
      + 'y GOOGLE_CLIENT_SECRET (o los de cada marca: GOOGLE_CLIENT_ID_FLECOS…), '
      + 'o el juego de Apple (APPLE_CLIENT_ID, APPLE_TEAM_ID, APPLE_KEY_ID y la '
      + 'llave). La guía: identidad/README.md'
    );
  }
}

const PROVIDERS = new Set(['google', 'apple']);

// Lo que el navegador necesita saber para poder autenticarse. Nada de aquí es
// secreto: la anon key de Supabase es pública por diseño y el client_id de
// Google también. Los secretos no salen del servidor.
//
// `providers` es la lista de botones que SE PUEDEN enseñar. En modo propio
// depende de la marca: si Barbas todavía no tiene credenciales de Apple, su
// botón de Apple no se pinta en vez de fallar al tocarlo.
function publicConfig(brandId) {
  return {
    mode: MODE,
    supabaseUrl: MODE === 'supabase' ? SUPABASE_URL : null,
    supabaseAnonKey: MODE === 'supabase' ? SUPABASE_ANON_KEY : null,
    providers: MODE === 'propio'
      ? oauth.disponibles(brandId)
      : ['google', 'apple'],
  };
}

// Verifica quién es. Devuelve { provider, sub, email, name } o null.
//
// En modo supabase preguntamos por el usuario al propio Supabase con el
// access_token. Es la comprobación más simple que no exige compartir el
// secreto de firma del proyecto con este servidor.
async function verify(req) {
  const body = req.body || {};
  const claimed = body.auth || {};

  if (MODE === 'demo') {
    const provider = String(claimed.provider || '').toLowerCase();
    if (!PROVIDERS.has(provider)) return null;
    // Identidad de mentiras, estable durante la sesión del navegador: el
    // cliente manda un id que él mismo generó y guardó.
    const sub = String(claimed.sub || '').slice(0, 64) || `demo-${Date.now()}`;
    return {
      provider,
      sub: `demo:${sub}`,
      email: null,
      name: typeof claimed.name === 'string' ? claimed.name.slice(0, 120) : null,
    };
  }

  // En modo propio nadie se identifica por este POST: la identidad la trae el
  // regreso de /auth/google/callback, que hace el alta él mismo (src/alta.js).
  // Que este camino conteste 401 es lo correcto, no un olvido.
  if (MODE === 'propio') return null;

  // --- modo supabase ---
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return null;

  let resp;
  try {
    resp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    });
  } catch (e) {
    // Supabase caído / sin red: mejor 401 que dejar pasar a alguien sin verificar.
    return null;
  }
  if (!resp.ok) return null;

  const user = await resp.json();
  if (!user || !user.id) return null;

  const meta = user.user_metadata || {};
  return {
    provider: String((user.app_metadata && user.app_metadata.provider) || 'supabase'),
    sub: String(user.id),
    email: user.email || null,
    name: meta.full_name || meta.name || null,
  };
}

// Middleware: deja en req.body.auth la identidad YA verificada, pisando lo
// que haya mandado el navegador. Así las rutas nunca ven datos sin verificar.
function required(req, res, next) {
  verify(req)
    .then((identity) => {
      if (!identity) return res.status(401).json({ error: 'not authenticated' });
      req.body = req.body || {};
      req.body.auth = identity;
      next();
    })
    .catch(next);
}

module.exports = { MODE, publicConfig, verify, required, PROVIDERS };
