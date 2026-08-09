// Identidad social (Google / Apple / Facebook) vía Supabase.
//
// Dos modos, con la MISMA interfaz para el resto del código:
//
//   AUTH_MODE=demo      (default) No hay Supabase todavía. Los tres botones
//                       funcionan y el alta se completa de verdad, con una
//                       identidad de mentiras. Sirve para ver y probar el
//                       flujo completo hoy, sin dar de alta nada en ningún
//                       lado. NUNCA en producción.
//
//   AUTH_MODE=supabase  El navegador hace el login real con Supabase y manda
//                       su access_token. Aquí se verifica contra Supabase
//                       ANTES de creer nada de lo que diga el navegador.
//
// Cambiar de uno a otro no toca ni el HTML ni las rutas: solo el .env.

const MODE = (process.env.AUTH_MODE || 'demo').toLowerCase();
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

if (MODE === 'supabase' && (!SUPABASE_URL || !SUPABASE_ANON_KEY)) {
  throw new Error('AUTH_MODE=supabase requiere SUPABASE_URL y SUPABASE_ANON_KEY (ver .env.example)');
}

const PROVIDERS = new Set(['google', 'apple', 'facebook']);

// Lo que el navegador necesita saber para poder autenticarse. La anon key de
// Supabase es pública por diseño (va en el cliente); el secreto de verdad
// nunca sale del servidor.
function publicConfig() {
  return {
    mode: MODE,
    supabaseUrl: MODE === 'supabase' ? SUPABASE_URL : null,
    supabaseAnonKey: MODE === 'supabase' ? SUPABASE_ANON_KEY : null,
    providers: ['google', 'apple', 'facebook'],
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
