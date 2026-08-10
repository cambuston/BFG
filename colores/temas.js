// Temas completos, listos para pegar en src/brand.js.
//
// Nada de aquí corre en la app. Para aplicar uno, se copia el objeto `tema`
// dentro de la marca en src/brand.js — ese es todo el trabajo. Las piezas y
// su significado están explicadas allá arriba.
//
// Para verlos:  node colores/ver.js --tema flecosMaqueta

module.exports = {
  // -------------------------------------------------------------------------
  // La maqueta que trajo Luis: Flecos en crema y salvia, Barbas en negro.
  // Las dos con herraje de latón.
  // -------------------------------------------------------------------------

  flecosMaqueta: {
    fondo: '#EFE9DC',        // crema
    tintaFondo: '46 36 27',  // marrón muy oscuro: el título va sobre el crema
    papel: '#F7F2E7',        // hueso
    superficie: '#3F513C',   // verde salvia oscuro
    tinta: '255 255 255',    // el formulario sigue en blanco sobre la salvia
    acento: '#A9543A',       // terracota
    logo: '#3F513C',         // el cuadro del logo en salvia, con tijeras terracota
    sombra: '60 44 24',      // sombra cálida, no azul marino
    herraje: 'laton',
  },

  barbasMaqueta: {
    fondo: '#121212',
    tintaFondo: '255 255 255',
    papel: '#1E1E1E',
    superficie: '#2A2A2A',
    tinta: '255 255 255',
    acento: '#C9A227',       // oro viejo
    logo: '#1E1E1E',
    sombra: '0 0 0',
    herraje: 'laton',
  },

  // -------------------------------------------------------------------------
  // Ideas para garras.mx (uñas). Lo trendy aquí es oscuro y saturado: la foto
  // del trabajo tiene que ser lo que brille, no el fondo.
  // -------------------------------------------------------------------------

  garrasNoche: {
    fondo: '#141019',
    tintaFondo: '255 255 255',
    papel: '#211A29',
    superficie: '#2B2135',
    tinta: '255 255 255',
    acento: '#E0457B',       // rosa fuerte
    logo: '#211A29',
    sombra: '20 5 30',
    herraje: 'laton',
  },

  garrasMocha: {
    fondo: '#3B2B26',
    tintaFondo: '255 255 255',
    papel: '#F3EAE3',
    superficie: '#503A33',
    tinta: '255 255 255',
    acento: '#B07A5A',
    logo: '#F3EAE3',
    sombra: '40 22 14',
    herraje: 'laton',
  },
};
