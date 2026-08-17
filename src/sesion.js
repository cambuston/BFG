// Sesión del profesional: saber que quien vuelve a /mi es Juan.
//
// Sin librería de sesiones y sin tabla de sesiones: una cookie FIRMADA que
// lleva dentro a quién pertenece. El servidor no guarda nada, solo comprueba
// la firma. Es lo más chico que resuelve el problema de verdad.
//
//   fyb_sesion = <handleId>.<expira>.<firma>
//                └─ el dato ─┘        └─ HMAC-SHA256 del dato con el secreto
//
// Cambiar un solo caracter del dato invalida la firma, así que nadie puede
// escribir "soy el handle 7" a mano. Y como la firma incluye la expiración,
// tampoco puede estirarse la vigencia.
//
// EL SECRETO. Sale de FYB_SECRET si está; si no, se genera uno al azar la
// primera vez y se guarda en la base (tabla `ajustes`). Así funciona sin que
// nadie configure nada y las sesiones sobreviven a un reinicio — pero si te
// llevas la base a otro lado, el secreto viaja con ella. En producción de
// verdad, pon FYB_SECRET.

const crypto = require('crypto');
const { db, ajuste } = require('./db');

const NOMBRE = 'fyb_sesion';
const DIAS = 90;                        // 3 meses sin volver a entrar
const VIDA_MS = DIAS * 24 * 60 * 60 * 1000;

const SECRETO = process.env.FYB_SECRET
  || ajuste('secreto_sesion', () => crypto.randomBytes(32).toString('hex'));

const firmar = (dato) =>
  crypto.createHmac('sha256', SECRETO).update(dato).digest('base64url');

// Comparación en tiempo constante: comparar firmas con === filtra información
// por el tiempo que tarda en fallar. Es barato hacerlo bien.
function igualSeguro(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

// Express no trae lector de cookies y no vamos a agregar cookie-parser por
// esto: son cinco líneas.
function leerCookies(req) {
  const crudo = req.headers.cookie || '';
  const out = {};
  for (const parte of crudo.split(';')) {
    const i = parte.indexOf('=');
    if (i < 0) continue;
    const k = parte.slice(0, i).trim();
    if (k) out[k] = decodeURIComponent(parte.slice(i + 1).trim());
  }
  return out;
}

function crear(res, handleId) {
  const dato = `${handleId}.${Date.now() + VIDA_MS}`;
  const valor = `${dato}.${firmar(dato)}`;
  res.cookie(NOMBRE, valor, {
    httpOnly: true,                     // el JavaScript de la página no la ve
    sameSite: 'lax',                    // sobrevive volver de Google, no viaja a sitios ajenos
    secure: process.env.NODE_ENV === 'production',
    maxAge: VIDA_MS,
    path: '/',
  });
}

function borrar(res) {
  res.clearCookie(NOMBRE, { path: '/' });
}

// Devuelve el handleId de la cookie, o null. No toca la base.
function handleIdDe(req) {
  const valor = leerCookies(req)[NOMBRE];
  if (!valor) return null;

  const corte = valor.lastIndexOf('.');
  if (corte < 0) return null;
  const dato = valor.slice(0, corte);
  const firma = valor.slice(corte + 1);
  if (!igualSeguro(firma, firmar(dato))) return null;

  const [id, expira] = dato.split('.');
  if (!id || !expira) return null;
  if (Number(expira) < Date.now()) return null;
  return Number(id);
}

const buscarPorId = db.prepare('SELECT * FROM handles WHERE id = ?');

// Deja en req.pro el profesional de la sesión (o null). Siempre continúa:
// las rutas que exigen sesión usan `exigir`.
//
// La marca importa: una sesión de Flecos no debe servir en Barbas aunque sea
// la misma persona. Son dos negocios distintos.
function cargar(brandId) {
  return function (req, res, next) {
    req.pro = null;
    const id = handleIdDe(req);
    if (id) {
      const fila = buscarPorId.get(id);
      const marca = typeof brandId === 'function' ? brandId(req) : brandId;
      if (fila && fila.brand === marca) req.pro = fila;
    }
    next();
  };
}

function exigir(req, res, next) {
  if (!req.pro) return res.status(401).json({ error: 'sin sesion' });
  next();
}

// `firmar` e `igualSeguro` salen para que el viaje al proveedor de identidad
// (src/auth.routes.js) firme su cookie con el MISMO secreto. Un solo secreto
// en el proyecto: si un día se rota, se rota una vez.
module.exports = {
  NOMBRE, crear, borrar, cargar, exigir, handleIdDe, DIAS, firmar, igualSeguro, leerCookies,
};
