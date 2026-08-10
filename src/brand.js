// UN SOLO CÓDIGO, TRES APPS.
//
// Flecos (peluquería), Barbas (barbería) y Garras (uñas) son la misma
// aplicación con distinta marca. Todo lo que
// cambia entre las dos vive AQUÍ: nombre, dominio, color y textos de portada.
// Ni una línea más del código sabe cuál de las dos está corriendo.
//
// Cómo se elige la marca, en orden:
//   1. BRAND (flecos | barbas | garras)                ← producción y `npm run`
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
  garras: {
    id: 'garras',
    name: 'Garras',
    domain: 'garras.mx',
    // PROVISIONAL: el look de las tres se está decidiendo en colores/.
    color: '#4A2545',
    tagline: 'Que tus clientes regresen',
    who: 'estudio de uñas',
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

// ---------------------------------------------------------------------------
// EL TEMA
// ---------------------------------------------------------------------------
//
// Hasta aquí, una marca era UN COLOR y la app daba por hecho que encima iba
// texto blanco. Eso alcanza mientras las dos marcas sean un azul y un verde
// oscuros, pero no para un tema claro (fondo crema, letra oscura) ni para un
// herraje de latón.
//
// Así que una marca puede traer además un `tema` con estas piezas. Todas son
// opcionales: lo que no diga se deduce de `color`, y el resultado es
// EXACTAMENTE lo que se veía cuando solo había un color por marca. Por eso
// arriba ninguna de las dos marcas trae `tema` todavía y la app se ve igual
// que siempre.
//
//   fondo       el fondo de la pantalla
//   tintaFondo  TERNA RGB del texto encima del fondo: '255 255 255'
//   papel       la carta del calendario (el marco blanco)
//   superficie  la página de dentro de la carta, donde vive el formulario
//   tinta       TERNA RGB del texto encima de la superficie
//   acento      la marca sobre blanco: texto de botones, iconos, foco
//   logo        el cuadro del logo. Es blanco PURO, no el hueso del papel:
//               son dos blancos distintos y se notaba al medirlo.
//   texto       la tinta OSCURA, la que va sobre blanco: lo que se teclea en
//               un campo, las filas de la agenda, la lista de servicios
//   sombraAccion  TERNA RGB de la sombra del botón principal. Es un azul
//               distinto al de `sombra` (0 35 130, no 6 26 82): en Días que
//               Cuentan son dos azules a propósito.
//   sombra      la TERNA RGB de las sombras, sin alfa: '6 26 82'
//   herraje     las argollas: 'plata' (como hoy) o 'laton'
//
// Un tema completo se ve así:
//
//   tema: {
//     fondo: '#EFE9DC', tintaFondo: '46 36 27',
//     papel: '#F7F2E7', superficie: '#3F513C', tinta: '255 255 255',
//     acento: '#A9543A', logo: '#3F513C', texto: '#2E241B',
//     sombra: '60 44 24', sombraAccion: '60 44 24', herraje: 'laton',
//   }
//
// Hay temas listos para probar en colores/temas.js. Para aplicarlos, se pegan
// aquí: ese es todo el trabajo.

const HERRAJES = new Set(['plata', 'laton']);

function temaDe(marca) {
  const t = (marca && marca.tema) || {};
  const color = (marca && marca.color) || '#2F6BFF';

  const herraje = HERRAJES.has(t.herraje) ? t.herraje : 'plata';

  return {
    fondo: t.fondo || color,
    // Blanco sobre el color de marca: es como se ha visto siempre.
    //
    // Terna RGB suelta, por lo mismo que `sombra`: la app tiene texto blanco a
    // media tinta por todos lados (rgba(255,255,255,.75), .62, .8…) y cada uno
    // necesita conservar SU opacidad. Se usa así: rgb(var(--tinta) / 0.75)
    tintaFondo: t.tintaFondo || '255 255 255',
    // El blanco hueso del arte del calendario de Días que Cuentan.
    papel: t.papel || '#FAFAFC',
    superficie: t.superficie || color,
    tinta: t.tinta || '255 255 255',
    acento: t.acento || color,
    // Blanco puro. Ojo: NO es `papel` (#FAFAFC). Se probó ponerle el hueso del
    // calendario y la comparación pixel a pixel lo cazó: 5 de 255 de
    // diferencia, invisible a ojo pero un cambio al fin.
    logo: t.logo || '#FFFFFF',
    // El azul marino de Días que Cuentan para el texto.
    texto: t.texto || '#1B2A4A',
    // Salió al aplicar la maqueta de verdad: el botón principal lleva una
    // sombra azul marino propia, y sobre un fondo cálido se veía fría.
    sombraAccion: t.sombraAccion || '0 35 130',
    // El azul marino con el que Días que Cuentan sombrea todo.
    //
    // Va como TERNA RGB suelta ('6 26 82') y no como color completo, porque
    // cada sombra de la app lleva su propia opacidad: la cabecera usa 0.60 y
    // 0.35, el calendario 0.26, la hoja 0.40… Si el token trajera el alfa
    // metido, todas esas se aplanarían en una sola y el look cambiaría.
    // Se usa así:  rgb(var(--sombra) / 0.26)
    sombra: t.sombra || '6 26 82',
    herraje,
  };
}

// Las variables de CSS que se le incrustan al HTML. Salen de aquí y de ningún
// otro lado: si un color aparece escrito a mano en una hoja de estilo, es un
// bug (ver colores/README.md).
function variablesCss(marca) {
  const t = temaDe(marca);
  return {
    // --- El tema ---
    '--fondo': t.fondo,
    '--tinta-fondo': t.tintaFondo,
    '--papel': t.papel,
    '--superficie': t.superficie,
    '--tinta': t.tinta,
    '--acento': t.acento,
    '--logo': t.logo,
    '--sombra-accion': t.sombraAccion,
    // --text lo define styles.css, que es copia literal y no se toca; se pisa
    // aquí porque el :root incrustado va después.
    '--text': t.texto,
    '--sombra': t.sombra,
    // El herraje no es un color sino un degradado de ocho paradas; el valor
    // completo vive en tema.css y aquí solo se escoge cuál.
    '--herraje': `var(--herraje-${t.herraje})`,

    // --- Nombres viejos ---
    // Las cuatro hojas copiadas de Días que Cuentan hablan en estos, y no se
    // tocan (ver CLAUDE.md). Se mantienen apuntando al tema.
    '--brand-blue': t.superficie,
    '--primary': t.acento,
    '--secondary': t.acento,
  };
}

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

module.exports = { BRANDS, brandFor, ENV_BRAND, DEFAULT_BRAND, temaDe, variablesCss, HERRAJES };
