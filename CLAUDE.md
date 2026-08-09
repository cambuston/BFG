# Flecos y Barbas

Citas, regreso y memoria para peluqueros y barberos independientes.
Un solo código, dos apps: `flecos.mx` y `barbas.mx`.

Lee el [README](README.md) para lo que ya está construido, cómo correrlo y cómo
probarlo. Aquí solo va lo que no se deduce del código.

---

## Modo autónomo

Cuando Luis escriba **«modo autónomo»** (o «autónomo», o «adelante sin
preguntar»), significa esto y no hace falta que lo explique otra vez:

- **No preguntes.** Si hay una duda razonable, escoge la opción más sensata y
  sigue. No pares a pedir confirmación a media tarea.
- **Termina todo.** No entregues la mitad ni digas «¿quieres que siga?».
  La tarea completa, o el reporte de qué faltó y por qué.
- **Los supuestos van al final**, en una lista corta: «asumí X porque Y».
  Antes no; interrumpen.
- **Nada de pedir permiso para crear, editar o borrar dentro de este proyecto.**

Aun en modo autónomo, sí hay que detenerse en dos casos:

1. **Lo que sale del proyecto**: desplegar, `git push`, publicar en tiendas,
   mandar correo, tocar el servidor de producción. Ahí siempre se pregunta.
2. **Antes de borrar, saca copia.** No se pregunta, se hace: un `tar.gz` al
   scratchpad y luego adelante. Ya pasó una vez con la versión anterior de este
   proyecto y sirvió.

## Contexto que no está en el código

- **Este proyecto es nuevo y no tiene usuarios.** Se puede romper y rehacer sin
  drama. Eso NO aplica a *Días que Cuentan* (`~/code/DiasQueCuentan`), que tiene
  grupos reales en producción y todavía sin respaldos.
- **El look viene de Días que Cuentan a propósito.** Las hojas `styles.css`,
  `header-split.css`, `calendar-form.css` y `calendar-colors.css` son copias
  literales de ese proyecto. **No las reescribas ni las "mejores"**: si el look
  hay que cambiarlo, se cambia en `handle.css` o con las variables de
  `src/brand.js`. Ya hubo un intento anterior que reimplementó el look desde
  cero y salió distinto; por eso se copiaron tal cual.
- **Todo lo que se ve va en español**, incluidos los nombres de las pruebas y
  los comentarios del código.

## Reglas de la casa

- **Sin frameworks ni dependencias nuevas** salvo que haga falta de verdad.
  Node + Express + better-sqlite3 y ya. Las pruebas con `node --test`, no con
  Jest ni Vitest. El frontend es HTML/CSS/JS puro, sin build.
- **Una prueba que no puede fallar no sirve.** Cuando algo importante quede
  cubierto, rómpelo a propósito una vez para comprobar que la prueba lo detecta,
  y luego restaura. Las tres comprobaciones hechas están anotadas en el README.
- **Antes de dar algo por terminado, corre `npm test`.** Y si tocaste la
  interfaz, `npm run test:navegador` y mira las capturas.
- **Los identificadores de la app** (`mi`, `registro`, `api`, …) se apartan en
  `src/handles.js` ANTES de publicar una sección nueva con ese nombre.

## Lo que sigue

El alta son dos pasos y nada más. Falta todo lo demás de Flecos 1.0: la página
pública del profesional, reservar cita, la ficha del cliente, los regresos y
«mi negocio». El plan completo está en [ideas.txt](ideas.txt) — ese archivo son
las notas originales de producto, no lo borres.
