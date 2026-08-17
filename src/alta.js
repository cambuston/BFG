// Quedarse un identificador. Es UNA sola decisión y ahora tiene DOS caminos
// que llegan hasta ella, así que vive aquí y no dentro de una ruta:
//
//   POST /api/handle/claim   modo demo y modo supabase: el navegador manda la
//                            identidad (ya verificada) y espera JSON.
//   /auth/google/callback    modo propio: el viaje vuelve al servidor, aquí no
//                            hay JSON que devolver sino a dónde redirigir.
//
// Lo que decide es idéntico en los dos, incluida la carrera. Duplicarlo era
// pedir que un día se arreglara un bug en un solo lado.

const { db } = require('./db');
const { normalize, validate } = require('./handles');
const negocio = require('./negocio');

// Se busca por el `sub` SOLO, no por (proveedor, sub).
//
// El `sub` es el id de la persona en el proveedor. Buscando también por
// proveedor, quien entró con Google y vuelve con Apple sería un desconocido:
// se intentaría crear su identificador otra vez, el índice UNIQUE saltaría y
// la pantalla le diría «alguien tomó flecos.mx/juan mientras entrabas» — su
// propia página. Con Supabase pasaba de verdad, porque junta en un mismo
// usuario las cuentas que comparten correo verificado.
const findAccount = db.prepare(
  'SELECT id, handle FROM handles WHERE brand = ? AND auth_sub = ?'
);

const insertHandle = db.prepare(`
  INSERT INTO handles (brand, handle, auth_provider, auth_sub, email, display_name, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const recorta = (v, max) =>
  (typeof v === 'string' && v.trim()) ? v.trim().slice(0, max) : null;

// Devuelve { estado, cuerpo, handleId }. `handleId` solo viene cuando la cosa
// salió bien: es la señal de «ábrele sesión».
//
// La carrera se resuelve con el índice UNIQUE, no con un chequeo previo: entre
// «está libre» y el INSERT pueden pasar milisegundos y otra persona puede
// ganar. Por eso se intenta insertar y, si SQLite se queja, es un 409.
function apartar(brand, handleCrudo, identidad) {
  const handle = normalize(handleCrudo);
  const { valid, reason } = validate(handle);
  if (!valid) return { estado: 400, cuerpo: { error: 'invalid handle', reason } };

  const id = identidad || {};
  const provider = String(id.provider || '');
  const sub = String(id.sub || '');
  if (!provider || !sub) return { estado: 401, cuerpo: { error: 'not authenticated' } };

  // ¿Esta misma persona ya tiene página en esta marca? No creamos otra: la
  // mandamos a la suya. Volver a entrar es, de hecho, iniciar sesión.
  const suya = findAccount.get(brand.id, sub);
  if (suya) {
    return {
      estado: 200,
      handleId: suya.id,
      cuerpo: {
        ok: true,
        already: true,
        handle: suya.handle,
        url: `https://${brand.domain}/${suya.handle}`,
      },
    };
  }

  const nombre = recorta(id.name, 120);
  let nuevoId;
  try {
    nuevoId = insertHandle.run(
      brand.id, handle, provider, sub, recorta(id.email, 200), nombre, Date.now()
    ).lastInsertRowid;
  } catch (err) {
    if (err && String(err.code || '').startsWith('SQLITE_CONSTRAINT')) {
      return { estado: 409, cuerpo: { error: 'taken', handle } };
    }
    throw err;
  }

  // El negocio nace con servicios y horario de ejemplo: quien acaba de darse
  // de alta ya tiene página que funciona, en vez de una pantalla vacía.
  negocio.estrenar(nuevoId, nombre);

  return {
    estado: 201,
    handleId: nuevoId,
    cuerpo: {
      ok: true,
      already: false,
      handle,
      url: `https://${brand.domain}/${handle}`,
    },
  };
}

module.exports = { apartar };
