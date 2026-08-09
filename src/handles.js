// Reglas del identificador público (flecos.mx/juan).
//
//   único · minúsculas · sin espacios · sin acentos · letras, números y guion
//
// Vive aparte del servidor porque lo usan los dos lados: el navegador para
// limpiar lo que el usuario teclea, y el servidor para no confiar en eso.

const MIN = 3;
const MAX = 30;

// Rutas de la propia app: nadie puede quedarse con flecos.mx/mi ni con
// flecos.mx/api. Si algún día agregamos una sección nueva, se apunta aquí
// ANTES de publicarla.
const RESERVED = new Set([
  'mi', 'registro', 'cita', 'citas', 'api', 'app', 'www', 'admin', 'root',
  'hoy', 'clientes', 'regresos', 'negocio', 'cuenta', 'entrar', 'salir',
  'login', 'logout', 'signup', 'ayuda', 'soporte', 'contacto', 'acerca',
  'privacidad', 'terminos', 'aviso', 'blog', 'precios', 'static', 'public',
  'assets', 'img', 'css', 'js', 'fonts', 'fontawesome', 'favicon', 'robots',
  'sitemap', 'manifest', 'flecos', 'barbas', 'flecosybarbas', 'null', 'undefined',
]);

// "José Pérez" -> "jose-perez". Descompone (NFD) para poder borrar los
// diacríticos como caracteres sueltos, pasa a minúsculas y convierte los
// espacios en guiones. ̀-ͯ es el bloque de acentos combinantes.
function normalize(raw) {
  return String(raw == null ? '' : raw)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')   // tildes y diéresis (é→e, ü→u)
    .replace(/ñ/gi, 'n')          // ñ no lleva acento combinante: aparte
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-');
}

// Devuelve { valid, reason }. `reason` es una clave, no un texto: el mensaje
// que ve la persona se arma en el navegador (app.js).
function validate(handle) {
  const h = String(handle == null ? '' : handle);
  if (h.length === 0) return { valid: false, reason: 'empty' };
  if (h !== normalize(h)) return { valid: false, reason: 'chars' };
  if (h.length < MIN) return { valid: false, reason: 'short' };
  if (h.length > MAX) return { valid: false, reason: 'long' };
  if (h.startsWith('-') || h.endsWith('-')) return { valid: false, reason: 'hyphen' };
  if (RESERVED.has(h)) return { valid: false, reason: 'reserved' };
  return { valid: true, reason: null };
}

module.exports = { normalize, validate, MIN, MAX, RESERVED };
