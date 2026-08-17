// Lee el archivo .env y lo mete en process.env.
//
// Hasta ahora .env.example decía «copia este archivo a .env», pero NADIE lo
// leía: había que exportar las variables a mano en cada terminal. Con Supabase
// eso deja de ser una molestia y pasa a ser un tropiezo garantizado, porque
// AUTH_MODE=supabase escrito en .env no hacía absolutamente nada.
//
// Sin dependencias: son treinta líneas y dotenv no da nada más que esto.
//
// DOS REGLAS que importan:
//
//   1. Lo que YA está en el entorno GANA. `BRAND=barbas npm start` manda sobre
//      el .env, y las pruebas —que lanzan el servidor con su propio entorno—
//      no se ven afectadas por lo que cada quien tenga en su .env.
//   2. Si no hay .env, no pasa nada. No es un error: en demo no hace falta.

const fs = require('node:fs');
const path = require('node:path');

// DÓNDE SE BUSCA, en orden, y se lee EL PRIMERO que exista:
//
//   1. FYB_ENV_PATH, si está. Manda y no se busca más: es lo que pone el
//      servicio de systemd, y también lo que apuntan las pruebas a un archivo
//      que no existe, a propósito, para que ningún .env se les cuele.
//   2. <proyecto>/.env         ← trabajar en local
//   3. <encima del proyecto>/.env  ← producción
//
// La tercera no es un capricho. En el servidor la configuración vive FUERA del
// árbol del código (`/opt/flecosybarbas/.env`, con la app en
// `/opt/flecosybarbas/app`) para que un despliegue nuevo reemplace la app
// entera sin llevarse por delante el secreto de las sesiones ni las
// credenciales. El servicio lo resolvía con FYB_ENV_PATH, pero cualquier cosa
// corrida a mano desde la carpeta de la app —`npm run identidad`, la que se
// usa justo para saber si el login quedó bien— no veía nada y contestaba
// «AUTH_MODE=demo» con el .env de producción completo a un palmo. Ahora lo
// encuentra sin que nadie tenga que acordarse de exportar la variable.
const RAIZ = path.join(__dirname, '..');
const RUTAS = process.env.FYB_ENV_PATH
  ? [process.env.FYB_ENV_PATH]
  : [path.join(RAIZ, '.env'), path.join(RAIZ, '..', '.env')];

// Devuelve un objeto con lo que dice el texto. Aparte de `cargar` para poder
// probarlo sin escribir archivos ni tocar process.env.
function parsear(texto) {
  const out = {};
  for (const linea of String(texto).split(/\r?\n/)) {
    const l = linea.trim();
    if (!l || l.startsWith('#')) continue;

    // `export FOO=bar` también vale: es como se pega desde una terminal.
    const sinExport = l.startsWith('export ') ? l.slice(7).trim() : l;

    const i = sinExport.indexOf('=');
    if (i <= 0) continue;

    const clave = sinExport.slice(0, i).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(clave)) continue;

    let valor = sinExport.slice(i + 1).trim();

    // Comillas: se quitan, y solo entonces se respeta lo de dentro tal cual.
    // Sin comillas, un # empieza un comentario al final de la línea —que es lo
    // que espera cualquiera que haya escrito un .env antes.
    const comilla = valor[0];
    if ((comilla === '"' || comilla === "'") && valor.endsWith(comilla) && valor.length > 1) {
      valor = valor.slice(1, -1);
    } else {
      const c = valor.indexOf(' #');
      if (c >= 0) valor = valor.slice(0, c).trim();
    }

    out[clave] = valor;
  }
  return out;
}

// El archivo que se leyó de verdad, para poder DECIRLO. Los comprobadores lo
// enseñan en la primera línea: media hora de este despliegue se fue en no saber
// que se estaba mirando un .env que no existía.
let leido = null;

// Mete el .env en process.env y devuelve las claves que SÍ puso (las que ya
// venían del entorno no se tocan, así que no salen en la lista).
//
// `ruta` puede ser una ruta o una lista de candidatas; sin ella, las de RUTAS.
function cargar(ruta) {
  const candidatas = ruta ? [].concat(ruta) : RUTAS;

  for (const candidata of candidatas) {
    let texto;
    try {
      texto = fs.readFileSync(candidata, 'utf8');
    } catch (e) {
      continue;                           // esta no está: se prueba la siguiente
    }

    leido = candidata;
    const puestas = [];
    for (const [clave, valor] of Object.entries(parsear(texto))) {
      if (process.env[clave] !== undefined) continue; // gana el entorno
      process.env[clave] = valor;
      puestas.push(clave);
    }
    return puestas;
  }

  return [];                              // no hay .env: normal, no es error
}

// Cuál se leyó, o null si no había ninguno.
const usado = () => leido;

module.exports = { cargar, parsear, usado, RUTAS };
