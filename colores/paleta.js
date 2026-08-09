// Colores candidatos para las marcas.
//
// Esto es SOLO una lista para mirar. Nada de aquí se usa en la app: el color
// de verdad vive en src/brand.js y se cambia ahí. Este archivo existe para
// poder comparar opciones sin tocar el código que corre.

module.exports = {
  // --- Los de ahora ---
  actuales: [
    { id: 'flecos', nombre: 'Flecos (hoy)', color: '#2F6BFF', nota: 'El azul de Días que Cuentan' },
    { id: 'barbas', nombre: 'Barbas (hoy)', color: '#0F766E', nota: 'Verde barbería' },
  ],

  // --- Para probar ---
  //
  // Todos son colores OSCUROS o MEDIOS a propósito: la app es texto blanco
  // sobre el color de marca, así que un color claro deja la letra ilegible.
  // Ver el contraste que reporta `ver.js` antes de enamorarse de uno.
  candidatos: [
    { id: 'indigo',    nombre: 'Índigo',        color: '#4338CA', nota: 'Primo del azul actual, más morado' },
    { id: 'pizarra',   nombre: 'Pizarra',       color: '#334155', nota: 'Neutro serio; deja brillar el oro' },
    { id: 'vino',      nombre: 'Vino',          color: '#9F1239', nota: 'Peluquería clásica' },
    { id: 'tabaco',    nombre: 'Tabaco',        color: '#78350F', nota: 'Barbería de cuero y madera' },
    { id: 'bosque',    nombre: 'Bosque',        color: '#166534', nota: 'Verde más frío que el de Barbas' },
    { id: 'ciruela',   nombre: 'Ciruela',       color: '#6B21A8', nota: 'Salón de belleza' },
    { id: 'petroleo',  nombre: 'Petróleo',      color: '#155E75', nota: 'Entre el azul y el verde' },
    { id: 'carbon',    nombre: 'Carbón',        color: '#1F2937', nota: 'Casi negro; el más sobrio' },
    { id: 'terracota', nombre: 'Terracota',     color: '#9A3412', nota: 'Cálido, mexicano' },
  ],
};
