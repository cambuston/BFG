// UN SOLO CÓDIGO, DOS APPS.
//
// Flecos y Barbas son la misma aplicación con distinta marca. Todo lo que
// cambia entre las dos vive AQUÍ: nombre, dominio, color y textos de portada.
// Ni una línea más del código sabe cuál de las dos está corriendo.
//
// Cómo se elige la marca, en orden:
//   1. La variable de entorno BRAND (flecos | barbas)  ← producción y `npm run`
//   2. El Host de la petición (barbas.mx → barbas)     ← un solo server, dos dominios
//   3. flecos (default)
//
// Para cambiar el color de una marca: cambia `color` y ya. El fondo, los
// botones, el cuerpo del calendario y la barra del navegador lo siguen todos,
// porque el look entero cuelga de --brand-blue (ver public/styles.css).

const BRANDS = {
  flecos: {
    id: 'flecos',
    name: 'Flecos',
    domain: 'flecos.mx',
    // Azul de Días que Cuentan: el look es exactamente el mismo.
    color: '#2F6BFF',
    tagline: 'Que tus clientes regresen',
    // Pregunta del paso 1. Cambia por marca porque el oficio cambia.
    who: 'peluquería',
  },
  barbas: {
    id: 'barbas',
    name: 'Barbas',
    domain: 'barbas.mx',
    // Verde barbería. Único cambio visual real entre las dos apps.
    color: '#0F766E',
    tagline: 'Que tus clientes regresen',
    who: 'barbería',
  },
};

const DEFAULT_BRAND = 'flecos';

// Marca fijada por entorno (si la hay). Se valida al arrancar para que un
// BRAND mal escrito falle de inmediato y no sirva la marca equivocada.
const ENV_BRAND = process.env.BRAND ? String(process.env.BRAND).toLowerCase() : null;
if (ENV_BRAND && !BRANDS[ENV_BRAND]) {
  throw new Error(`BRAND desconocida: "${ENV_BRAND}". Usa: ${Object.keys(BRANDS).join(' | ')}`);
}

// Marca de esta petición. Con BRAND fijo siempre gana el entorno; si no, se
// deduce del Host (barbas.mx, www.barbas.mx, barbas.local, localhost:3101...).
function brandFor(req) {
  if (ENV_BRAND) return BRANDS[ENV_BRAND];
  const host = String((req && req.headers && req.headers.host) || '').toLowerCase();
  for (const b of Object.values(BRANDS)) {
    // El nombre basta: "barbas" aparece en barbas.mx, www.barbas.mx y barbas.local.
    if (host.includes(b.id)) return b;
  }
  return BRANDS[DEFAULT_BRAND];
}

module.exports = { BRANDS, brandFor, ENV_BRAND, DEFAULT_BRAND };
