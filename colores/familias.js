// FAMILIAS: el look de las TRES marcas, decidido junto.
//
// Cada familia trae un tema para Flecos, uno para Barbas y uno para Garras.
// La gracia es verlas en fila: lo que importa no es si un color gusta suelto,
// sino si las tres se leen como hermanas y aun así se distinguen.
//
//   node colores/ver.js --familias
//
// Para aplicar una, se pegan sus tres `tema` en src/brand.js. Nada más.
//
// ---------------------------------------------------------------------------
// LA REGLA QUE MANDA EN LOS ACENTOS
// ---------------------------------------------------------------------------
//
// `acento` es el color del TEXTO DEL BOTÓN PRINCIPAL, que va sobre blanco. Eso
// obliga a que sea oscuro: el oro bonito de la maqueta (#C9A227) da 2.42 de
// contraste sobre blanco y es ilegible. Por eso los acentos de aquí son
// versiones apagadas de los colores de la maqueta:
//
//   oro     #C9A227 → 2.42 ✗      #8A6D1F → 4.90 ✓
//   rosa    #FF4D8D → 3.14 ✗      #C2185B → 5.87 ✓
//
// Si algún día se quiere el oro brillante para adornos sobre fondo oscuro,
// hace falta un token aparte (`acentoClaro`): son dos usos con fondos
// opuestos y un solo color no puede con los dos.

// Lo que las tres marcas comparten dentro de una familia se escribe una vez.
const mezcla = (base, propio) => ({ ...base, ...propio });

// ---------------------------------------------------------------------------
// A · OFICIO — cada marca, el material de su oficio
// ---------------------------------------------------------------------------
// Es la maqueta de Luis llevada a las tres. Flecos huele a salón con plantas,
// Barbas a cuero y latón, Garras a estudio de uñas de noche.
// La más bonita y la que más se aleja de Días que Cuentan.
const oficio = {
  flecos: {
    fondo: '#EFE9DC', tintaFondo: '46 36 27',
    papel: '#F7F2E7', superficie: '#3F513C', tinta: '255 255 255',
    acento: '#96472F', logo: '#3F513C', texto: '#2E241B',
    sombra: '60 44 24', sombraAccion: '60 44 24', herraje: 'laton',
  },
  barbas: {
    fondo: '#121212', tintaFondo: '255 255 255',
    papel: '#1E1E1E', superficie: '#2A2A2A', tinta: '255 255 255',
    acento: '#8A6D1F', logo: '#1E1E1E', texto: '#1C1C1C',
    sombra: '0 0 0', sombraAccion: '0 0 0', herraje: 'laton',
  },
  garras: {
    fondo: '#1E1122', tintaFondo: '255 255 255',
    papel: '#2A1B30', superficie: '#33203C', tinta: '255 255 255',
    // Cromo, no latón: las uñas cromadas son EL acabado del momento, y de paso
    // separa a Garras de las otras dos sin cambiar nada más.
    acento: '#C2185B', logo: '#2A1B30', texto: '#241528',
    sombra: '25 6 30', sombraAccion: '25 6 30', herraje: 'plata',
  },
};

// ---------------------------------------------------------------------------
// B · UN SISTEMA — la misma app, tres acentos
// ---------------------------------------------------------------------------
// Mismo caparazón gris oscuro para las tres; lo único que cambia es el color
// del acento. La más disciplinada y la más barata de mantener: un arreglo de
// diseño se hace una vez y sirve para las tres. También la más "app" y la
// menos artesanal.
const cascaron = {
  fondo: '#16181D', tintaFondo: '255 255 255',
  papel: '#262A33', superficie: '#1D2026', tinta: '255 255 255',
  texto: '#1B1F27', sombra: '0 0 0', sombraAccion: '0 0 0', herraje: 'plata',
  logo: '#262A33',
};

const sistema = {
  flecos: mezcla(cascaron, { acento: '#2557E8' }),
  barbas: mezcla(cascaron, { acento: '#0E7C63' }),
  garras: mezcla(cascaron, { acento: '#C2185B' }),
};

// ---------------------------------------------------------------------------
// C · COLOR PLENO — lo de hoy, arreglado
// ---------------------------------------------------------------------------
// El modelo actual (el fondo y la tarjeta del mismo color saturado), pero con
// los tres colores corregidos para que el texto blanco se lea bien, y con
// herraje por marca. Es el cambio más pequeño posible y el que mejor conserva
// el aire de Días que Cuentan.
const pleno = (color, herraje) => ({
  fondo: color, superficie: color, acento: color,
  tintaFondo: '255 255 255', tinta: '255 255 255',
  papel: '#FAFAFC', logo: '#FFFFFF', texto: '#1B2A4A',
  sombra: '6 26 82', sombraAccion: '0 35 130', herraje,
});

const plenoFamilia = {
  // #2557E8 en vez de #2F6BFF: el de hoy se queda en 4.499 y no llega a AA.
  flecos: pleno('#2557E8', 'plata'),
  barbas: pleno('#0F5F58', 'laton'),
  garras: pleno('#7A1F52', 'plata'),
};

module.exports = {
  oficio: {
    nombre: 'A · Oficio',
    idea: 'Cada marca, el material de su oficio. Es la maqueta de Luis llevada a las tres.',
    temas: oficio,
  },
  sistema: {
    nombre: 'B · Un sistema',
    idea: 'Mismo caparazón oscuro, tres acentos. La más barata de mantener.',
    temas: sistema,
  },
  pleno: {
    nombre: 'C · Color pleno',
    idea: 'Lo de hoy con los colores corregidos. El cambio más pequeño posible.',
    temas: plenoFamilia,
  },
};
