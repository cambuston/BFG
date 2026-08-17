// El lector de .env (src/env.js).
//
// Importa porque de él dependen la marca, el modo de cuenta y las llaves de
// Supabase: si lee mal, la app arranca con la configuración equivocada y no se
// nota hasta que alguien intenta entrar con Google.

const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');

const { test } = require('node:test');
const assert = require('node:assert');

const env = require('../src/env');

const tmp = (contenido) => {
  const p = path.join(os.tmpdir(), `fyb-env-${process.pid}-${Math.random().toString(36).slice(2)}`);
  fs.writeFileSync(p, contenido);
  return p;
};

// --- leer el texto ---------------------------------------------------------

test('lee pares clave=valor y se salta comentarios y líneas vacías', () => {
  const r = env.parsear([
    '# esto es un comentario',
    '',
    'BRAND=barbas',
    '   PORT=3101   ',
    '# AUTH_MODE=supabase',      // comentado: no cuenta
  ].join('\n'));

  assert.deepEqual(r, { BRAND: 'barbas', PORT: '3101' });
});

test('respeta el valor entero cuando va entre comillas', () => {
  const r = env.parsear([
    'SECRETO="con espacios y # almohadilla"',
    "OTRO='comillas simples'",
  ].join('\n'));

  assert.equal(r.SECRETO, 'con espacios y # almohadilla');
  assert.equal(r.OTRO, 'comillas simples');
});

test('sin comillas, un # empieza comentario al final de la línea', () => {
  const r = env.parsear('PORT=3100 # el de Flecos');
  assert.equal(r.PORT, '3100');
});

test('aguanta el "export" que se pega desde una terminal', () => {
  assert.equal(env.parsear('export BRAND=garras').BRAND, 'garras');
});

test('no se traga basura: líneas sin = ni claves imposibles', () => {
  const r = env.parsear(['esto no es nada', '=sin-clave', '1MALA=x', 'BUENA=si'].join('\n'));
  assert.deepEqual(r, { BUENA: 'si' });
});

test('una llave de Supabase con puntos y guiones sobrevive entera', () => {
  const llave = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.aB-c_dE12';
  assert.equal(env.parsear(`SUPABASE_ANON_KEY=${llave}`).SUPABASE_ANON_KEY, llave);
});

// --- meterlo en process.env ------------------------------------------------

test('carga en process.env lo que no estaba', () => {
  const clave = `FYB_PRUEBA_${process.pid}`;
  delete process.env[clave];

  const archivo = tmp(`${clave}=puesto\n`);
  const puestas = env.cargar(archivo);

  assert.deepEqual(puestas, [clave]);
  assert.equal(process.env[clave], 'puesto');

  delete process.env[clave];
  fs.unlinkSync(archivo);
});

// Esta es la que protege a las pruebas de todo el proyecto: lanzan el servidor
// con su propio entorno y el .env de cada máquina NO debe pisarlo.
test('lo que ya está en el entorno gana sobre el .env', () => {
  const clave = `FYB_PRUEBA_MANDA_${process.pid}`;
  process.env[clave] = 'del entorno';

  const archivo = tmp(`${clave}=del archivo\n`);
  const puestas = env.cargar(archivo);

  assert.equal(process.env[clave], 'del entorno');
  assert.equal(puestas.includes(clave), false, 'no debería contarla como puesta');

  delete process.env[clave];
  fs.unlinkSync(archivo);
});

test('si no hay .env no pasa nada: no es un error', () => {
  const puestas = env.cargar(path.join(os.tmpdir(), 'fyb-env-que-no-existe-jamas'));
  assert.deepEqual(puestas, []);
});

// --- dónde se busca --------------------------------------------------------

// Esta es la de producción: la configuración vive ENCIMA de la carpeta de la
// app (/opt/flecosybarbas/.env con la app en /opt/flecosybarbas/app), y sin
// esto `npm run identidad` en el servidor leía un .env que no existe y decía
// «AUTH_MODE=demo» con las credenciales puestas.
test('si no hay .env dentro del proyecto, lo busca encima', () => {
  const clave = `FYB_PRUEBA_ENCIMA_${process.pid}`;
  delete process.env[clave];

  const dentro = path.join(os.tmpdir(), 'fyb-env-que-no-existe-jamas');
  const encima = tmp(`${clave}=el de encima\n`);

  const puestas = env.cargar([dentro, encima]);

  assert.deepEqual(puestas, [clave]);
  assert.equal(process.env[clave], 'el de encima');
  assert.equal(env.usado(), encima, 'tiene que poder decir cuál leyó');

  delete process.env[clave];
  fs.unlinkSync(encima);
});

test('gana el .env del proyecto sobre el de encima', () => {
  const clave = `FYB_PRUEBA_DENTRO_${process.pid}`;
  delete process.env[clave];

  const dentro = tmp(`${clave}=el de dentro\n`);
  const encima = tmp(`${clave}=el de encima\n`);

  env.cargar([dentro, encima]);

  assert.equal(process.env[clave], 'el de dentro');
  assert.equal(env.usado(), dentro);

  delete process.env[clave];
  fs.unlinkSync(dentro);
  fs.unlinkSync(encima);
});

// FYB_ENV_PATH manda y no se busca más; si está puesta, esta prueba no aplica.
test('busca en dos sitios: dentro del proyecto y encima', { skip: !!process.env.FYB_ENV_PATH }, () => {
  const raiz = path.join(__dirname, '..');
  assert.deepEqual(env.RUTAS, [
    path.join(raiz, '.env'),
    path.join(raiz, '..', '.env'),
  ]);
});
