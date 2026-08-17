// Sirve colores/taller.html — la pantalla viva para probar colores a mano.
//
//   node colores/taller.js        →  http://localhost:4321
//
// Solo hace falta un servidor porque las hojas de estilo y las tipografías se
// piden por ruta absoluta (/styles.css, /fonts/inter-latin.woff2). Abriendo el
// HTML con doble clic (file://) el navegador bloquea las fuentes y la página
// se ve con la letra equivocada, que es justo lo que no queremos al juzgar un
// color.
//
// No levanta la app: ni base de datos, ni marcas, ni API. Es express.static
// sobre public/ y nada más.

const path = require('node:path');
const express = require('express');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const app = express();

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'taller.html')));
app.use(express.static(PUBLIC_DIR, { index: false }));

const port = Number(process.env.PORT) || 4321;
app.listen(port, () => {
  console.log(`\nTaller de color en http://localhost:${port}`);
  console.log('Edita colores/taller.html y recarga.\n');
});
