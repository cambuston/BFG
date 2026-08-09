// Base de datos: SQLite en un archivo, sin ORM. Mismo patrón que Días que
// Cuentan (better-sqlite3 + WAL + migraciones idempotentes al arrancar).
//
// Aquí solo vive el IDENTIFICADOR público (flecos.mx/juan) y de quién es.
// Servicios, horarios, clientes y citas NO existen todavía: eso es el resto
// de Flecos y se construye después.

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_PATH = process.env.FYB_DB_PATH || path.join(__dirname, '..', 'data', 'flecosybarbas.db');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS handles (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  brand        TEXT NOT NULL,              -- 'flecos' | 'barbas'
  handle       TEXT NOT NULL,              -- minúsculas, ya validado
  auth_provider TEXT NOT NULL,             -- google | apple | facebook | demo
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
`);

module.exports = { db, DB_PATH };
