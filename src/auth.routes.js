// El viaje al proveedor de identidad, sin intermediario (AUTH_MODE=propio).
//
//   GET  /auth/google?handle=juan    → se va a Google
//   GET  /auth/google/callback       → vuelve, y aquí se decide todo
//   POST /auth/apple/callback        → Apple vuelve por POST (form_post)
//
// La diferencia con el modo supabase no es solo de quién verifica: allá el
// navegador volvía con un token y hacía el POST del alta; aquí **el viaje
// vuelve al servidor**, así que el alta se hace en este archivo y al navegador
// se le devuelve una página, no un JSON.
//
// EL IDENTIFICADOR TIENE QUE SOBREVIVIR EL VIAJE, y no puede ir en la URL de
// regreso: esa la fija el proveedor y no admite adornos. Va en una cookie
// firmada y de diez minutos, junto con el `state` que evita que alguien nos
// meta una vuelta ajena (CSRF). Firmada con el MISMO secreto que las sesiones.

const express = require('express');
const crypto = require('crypto');

const { brandFor } = require('./brand');
const { normalize, validate } = require('./handles');
const sesion = require('./sesion');
const oauth = require('./oauth');
const { apartar } = require('./alta');

const router = express.Router();

const COOKIE = 'fyb_viaje';
const VIDA_MS = 10 * 60 * 1000;         // diez minutos: lo que tarda entrar

// De dónde salió la petición, que es a dónde tiene que volver. Detrás de un
// proxy (nginx, Cloudflare) el protocolo real viene en la cabecera: sin esto,
// en producción armaríamos una dirección http:// y Google la rechazaría por
// no coincidir con la registrada.
function origen(req) {
  const reenviado = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const proto = reenviado || req.protocol || 'http';
  return `${proto}://${req.headers.host}`;
}

const regresoA = (req, proveedor) => `${origen(req)}/auth/${proveedor}/callback`;

// ---------------------------------------------------------------------------
// La cookie del viaje: <nonce>.<handle>.<expira>.<firma>
// El handle ya está normalizado (solo a-z0-9 y guion), así que el punto es un
// separador seguro.
// ---------------------------------------------------------------------------

function guardaViaje(res, nonce, handle, proveedor) {
  const dato = `${nonce}.${handle}.${Date.now() + VIDA_MS}`;

  // Aquí se decide si el viaje de Apple funciona o no funciona nunca.
  //
  // Con Google la vuelta es una navegación de primer nivel por GET, y `lax`
  // basta (`strict` no: la cookie no llegaría y el viaje se perdería siempre).
  // Apple vuelve por POST desde appleid.apple.com, y a una cookie `lax` el
  // navegador NO la manda en un POST que viene de otro sitio. Tiene que ser
  // `none`, que a su vez exige `secure`. Apple solo admite direcciones de
  // regreso https, así que no se pierde nada por exigirlo.
  const porFormulario = oauth.vuelvePorFormulario(proveedor);

  res.cookie(COOKIE, `${dato}.${sesion.firmar(dato)}`, {
    httpOnly: true,
    sameSite: porFormulario ? 'none' : 'lax',
    secure: porFormulario || process.env.NODE_ENV === 'production',
    maxAge: VIDA_MS,
    path: '/',
  });
}

function leeViaje(req) {
  const crudo = sesion.leerCookies(req)[COOKIE];
  if (!crudo) return null;

  const partes = String(crudo).split('.');
  if (partes.length !== 4) return null;

  const [nonce, handle, expira, firma] = partes;
  if (!sesion.igualSeguro(firma, sesion.firmar(`${nonce}.${handle}.${expira}`))) return null;
  if (Number(expira) < Date.now()) return null;

  return { nonce, handle };
}

const tiraViaje = (res) => res.clearCookie(COOKIE, { path: '/' });

// A dónde se manda al navegador de vuelta. Los códigos los lee public/app.js,
// que es quien sabe decirlos en cristiano.
const aCasa = (res, params) => res.redirect('/?' + new URLSearchParams(params));

// ---------------------------------------------------------------------------
// 1. Salida
// ---------------------------------------------------------------------------

router.get('/:proveedor', (req, res) => {
  const brand = brandFor(req);
  const proveedor = String(req.params.proveedor || '').toLowerCase();

  if (!oauth.PROVEEDORES[proveedor] || !oauth.credenciales(proveedor, brand.id)) {
    return aCasa(res, { error: 'proveedor_no_disponible' });
  }

  // El identificador se valida ANTES de mandar a nadie a ningún lado: es una
  // grosería llevarte a Google para decirte al volver que la dirección no
  // servía.
  const handle = normalize(req.query.handle);
  if (!validate(handle).valid) return aCasa(res, { error: 'handle_invalido' });

  const nonce = crypto.randomBytes(16).toString('hex');
  guardaViaje(res, nonce, handle, proveedor);

  const url = oauth.urlDeEntrada({
    proveedor,
    brandId: brand.id,
    redirectUri: regresoA(req, proveedor),
    state: nonce,
  });

  res.redirect(url);
});

// ---------------------------------------------------------------------------
// 2. Regreso
// ---------------------------------------------------------------------------

// Google contesta por GET y Apple por POST, pero lo que llega es lo mismo
// (`code`, `state`, `error`) y lo que hay que hacer con ello también. Lo único
// que cambia es de dónde se leen, así que se juntan los dos sitios y de ahí en
// adelante hay UN camino.
const formulario = express.urlencoded({ extended: false, limit: '16kb' });

async function regreso(req, res, next) {
  const brand = brandFor(req);
  const proveedor = String(req.params.proveedor || '').toLowerCase();
  const datos = { ...(req.query || {}), ...(req.body || {}) };
  const viaje = leeViaje(req);
  tiraViaje(res);

  // Le dio a «Cancelar», o el proveedor está mal configurado. Es el camino
  // más transitado después del bueno.
  if (datos.error) return aCasa(res, { error: String(datos.error) });

  // Sin cookie (tardó demasiado, la borró, o llegó por su cuenta) o con un
  // `state` que no es el nuestro: no se sigue. Esto es lo que impide que
  // alguien nos cuele una vuelta preparada por él.
  if (!viaje || !datos.state || !sesion.igualSeguro(String(datos.state), viaje.nonce)) {
    return aCasa(res, { error: 'viaje_perdido' });
  }

  let identidad;
  try {
    identidad = await oauth.identidad({
      proveedor,
      brandId: brand.id,
      code: String(datos.code || ''),
      redirectUri: regresoA(req, proveedor),
      // Apple manda el nombre aquí, y SOLO la primera vez que esta persona
      // autoriza la app. Si se ignora, no hay forma de volver a pedirlo.
      usuario: datos.user,
    });
  } catch (e) {
    return next(e);
  }
  if (!identidad) return aCasa(res, { error: 'sin_identidad' });

  const r = apartar(brand, viaje.handle, identidad);

  // Se la ganaron mientras se autenticaba: de vuelta al paso 1, diciéndolo.
  if (r.estado === 409) return aCasa(res, { ocupada: viaje.handle });
  if (!r.handleId) return aCasa(res, { error: 'no_se_pudo' });

  sesion.crear(res, r.handleId);
  aCasa(res, { listo: r.cuerpo.handle, nueva: r.cuerpo.already ? '0' : '1' });
}

router.get('/:proveedor/callback', regreso);
router.post('/:proveedor/callback', formulario, regreso);

module.exports = router;
