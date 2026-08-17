// Base de datos: SQLite en un archivo, sin ORM. Mismo patrón que Días que
// Cuentan (better-sqlite3 + WAL + migraciones idempotentes al arrancar).
//
// Aquí vive TODO el esquema. Antes estaba repartido; se juntó porque las
// tablas se referencian entre ellas y el orden de creación importa.
//
// ---------------------------------------------------------------------------
// DOS DECISIONES QUE EXPLICAN CASI TODO LO DEMÁS
// ---------------------------------------------------------------------------
//
// 1. LAS FECHAS SON TEXTO, EN LA HORA DEL LOCAL.  'YYYY-MM-DD' y 'HH:MM'.
//
//    No hay epoch, ni UTC, ni zonas horarias, y es a propósito. Una peluquería
//    está en un solo lugar: cuando Juan dice "el viernes a las 10" quiere decir
//    las 10 de su reloj, y nadie más va a leer esa cita desde Tokio. Guardar
//    epoch obligaría a saber la zona del negocio y a convertir de ida y vuelta
//    en cada pantalla, para no ganar nada. Como texto ordenable, comparar y
//    ordenar citas es `<` y `ORDER BY` — y lo que se guarda es exactamente lo
//    que Juan ve.
//
//    (Si algún día hay cadenas con sucursales en husos distintos, aquí es donde
//    se agrega una zona por negocio.)
//
// 2. EL DINERO SON PESOS ENTEROS.  250, no 250.00 ni 25000 centavos.
//
//    Nadie cobra $250.50 por un corte. Un entero evita los errores de redondeo
//    de los flotantes sin el ruido de andar multiplicando por 100.

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_PATH = process.env.FYB_DB_PATH || path.join(__dirname, '..', 'data', 'flecosybarbas.db');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
// Sin esto SQLite ignora las llaves foráneas y un DELETE dejaría huérfanos.
db.pragma('foreign_keys = ON');

db.exec(`
-- ---------------------------------------------------------------------------
-- El profesional y su dirección pública
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS handles (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  brand        TEXT NOT NULL,              -- 'flecos' | 'barbas' | 'garras'
  handle       TEXT NOT NULL,              -- minúsculas, ya validado
  auth_provider TEXT NOT NULL,             -- google | apple | demo
  auth_sub     TEXT NOT NULL,              -- id del usuario en el proveedor
  email        TEXT,
  display_name TEXT,
  created_at   INTEGER NOT NULL
);

-- La unicidad es POR MARCA: flecos.mx/juan y barbas.mx/juan son dos negocios
-- distintos. Este índice es además el candado real contra la carrera de dos
-- personas pidiendo el mismo identificador al mismo tiempo: el segundo INSERT
-- falla por constraint, no por un chequeo previo que ya se quedó viejo.
CREATE UNIQUE INDEX IF NOT EXISTS idx_handles_brand_handle
  ON handles(brand, handle);

-- Una cuenta = un identificador por marca. Si el mismo Google vuelve a
-- registrarse, lo mandamos a su página en vez de crear un duplicado.
CREATE UNIQUE INDEX IF NOT EXISTS idx_handles_brand_account
  ON handles(brand, auth_provider, auth_sub);

-- ---------------------------------------------------------------------------
-- Mi negocio
-- ---------------------------------------------------------------------------
-- Una fila por profesional. Se crea vacía en el alta para que el resto del
-- código nunca tenga que preguntarse si existe.
CREATE TABLE IF NOT EXISTS negocio (
  handle_id     INTEGER PRIMARY KEY REFERENCES handles(id) ON DELETE CASCADE,
  nombre        TEXT,                      -- "Barbería Juan" (o el nombre a secas)
  whatsapp      TEXT,                      -- solo dígitos
  ciudad        TEXT,
  -- Cada cuánto suele volver la gente. Es lo que mueve la pantalla de
  -- Regresos: pasados estos días sin volver, el cliente aparece en la lista.
  regreso_dias  INTEGER NOT NULL DEFAULT 21,
  actualizado   INTEGER
);

CREATE TABLE IF NOT EXISTS servicios (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  handle_id INTEGER NOT NULL REFERENCES handles(id) ON DELETE CASCADE,
  nombre    TEXT NOT NULL,                 -- "Corte + barba"
  precio    INTEGER,                       -- pesos enteros; NULL = "sobre pedido"
  minutos   INTEGER NOT NULL DEFAULT 30,   -- cuánto tarda: de aquí salen los horarios
  orden     INTEGER NOT NULL DEFAULT 0,
  -- Se archivan en vez de borrarse: una cita vieja tiene que poder seguir
  -- diciendo qué servicio fue.
  activo    INTEGER NOT NULL DEFAULT 1,
  creado    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_servicios_handle ON servicios(handle_id, activo, orden);

-- Horario semanal. dia: 0 domingo … 6 sábado (igual que Date.getDay()).
-- Sin fila = cerrado ese día.
CREATE TABLE IF NOT EXISTS horario (
  handle_id INTEGER NOT NULL REFERENCES handles(id) ON DELETE CASCADE,
  dia       INTEGER NOT NULL,
  abre      TEXT NOT NULL,                 -- 'HH:MM'
  cierra    TEXT NOT NULL,                 -- 'HH:MM'
  PRIMARY KEY (handle_id, dia)
);

-- Días sueltos que no trabaja (vacaciones, una boda, el 25 de diciembre).
CREATE TABLE IF NOT EXISTS cerrados (
  handle_id INTEGER NOT NULL REFERENCES handles(id) ON DELETE CASCADE,
  fecha     TEXT NOT NULL,                 -- 'YYYY-MM-DD'
  motivo    TEXT,
  PRIMARY KEY (handle_id, fecha)
);

-- ---------------------------------------------------------------------------
-- Clientes  ·  aquí vive la MEMORIA
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clientes (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  handle_id INTEGER NOT NULL REFERENCES handles(id) ON DELETE CASCADE,
  nombre    TEXT NOT NULL,
  telefono  TEXT,                          -- solo dígitos; es la llave real
  -- "Máquina 1 lados. Tijera arriba. Más largo enfrente."
  -- Un solo campo de texto libre a propósito: es lo que un peluquero
  -- realmente escribe. Campos estructurados nadie los llena.
  notas     TEXT,
  creado    INTEGER NOT NULL
);

-- El teléfono identifica al cliente dentro de un negocio: así reconocemos a
-- quien vuelve sin pedirle cuenta ni contraseña. Parcial porque el propio
-- peluquero puede dar de alta a alguien sin teléfono.
CREATE UNIQUE INDEX IF NOT EXISTS idx_clientes_tel
  ON clientes(handle_id, telefono) WHERE telefono IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_clientes_nombre ON clientes(handle_id, nombre);

-- ---------------------------------------------------------------------------
-- Citas
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS citas (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  handle_id   INTEGER NOT NULL REFERENCES handles(id) ON DELETE CASCADE,
  cliente_id  INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  -- El servicio puede archivarse después; la cita conserva nombre y precio
  -- de ESE día, que es lo que de verdad pasó.
  servicio_id INTEGER REFERENCES servicios(id) ON DELETE SET NULL,
  servicio    TEXT NOT NULL,
  precio      INTEGER,
  fecha       TEXT NOT NULL,               -- 'YYYY-MM-DD'
  hora        TEXT NOT NULL,               -- 'HH:MM'
  minutos     INTEGER NOT NULL,
  estado      TEXT NOT NULL DEFAULT 'reservada',  -- reservada | cumplida | cancelada
  origen      TEXT NOT NULL DEFAULT 'cliente',    -- cliente | profesional
  creado      INTEGER NOT NULL
);

-- La agenda del día y la del cliente son las dos consultas de siempre.
CREATE INDEX IF NOT EXISTS idx_citas_agenda  ON citas(handle_id, fecha, hora);
CREATE INDEX IF NOT EXISTS idx_citas_cliente ON citas(cliente_id, fecha);

-- ---------------------------------------------------------------------------
-- Ajustes internos (llave/valor). Hoy solo el secreto de las sesiones.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ajustes (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);
`);

// Lee un ajuste, y si no existe lo crea con el valor que le dé `hacer()`.
// Se usa para el secreto de las sesiones: así sobrevive a los reinicios sin
// pedirle a nadie que configure nada.
function ajuste(clave, hacer) {
  const fila = db.prepare('SELECT valor FROM ajustes WHERE clave = ?').get(clave);
  if (fila) return fila.valor;
  const valor = hacer();
  db.prepare('INSERT OR IGNORE INTO ajustes (clave, valor) VALUES (?, ?)').run(clave, valor);
  return db.prepare('SELECT valor FROM ajustes WHERE clave = ?').get(clave).valor;
}

module.exports = { db, DB_PATH, ajuste };
