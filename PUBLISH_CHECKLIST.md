# Checklist de publicación — Flecos, Barbas, Garras

Este documento recoge los pasos técnicos y de producto para llevar las tres
marcas (`Flecos`, `Barbas`, `Garras`) a App Store (iOS) y Google Play (Android).
Divide en: prerequisitos, preparación por marca, builds, subida y post-lanzamiento.

Resumen rápido
- Son tres apps/identidades, la mayor parte del trabajo es repetir pasos por marca.
- Mantener secretos fuera del árbol: usa `APPLE_PRIVATE_KEY_FILE` y `.env` fuera.
- Verifica OAuth por marca con `npm run identidad` y `FYB_ORIGEN=produccion`.

Prerrequisitos comunes
- Cuentas de desarrollador:
  - Apple Developer Program (99 USD/año) — cuenta para el equipo.
  - Google Play Console (cuenta de desarrollador paga única).
- Accesos: quien publica debe tener permisos en App Store Connect y Play Console.
- Certificados y claves:
  - Apple: `AuthKey_XXXXXXXXXX.p8` (Key ID) y Team ID.
  - Google: credenciales OAuth (Client ID / Client secret) y acceso a Play Console.
- DOMINIOS y HTTPS: dominios verificados (`flecos.mx`, `barbas.mx`, `garras.mx`) con HTTPS.

Preparación por marca (hacer por Flecos, Barbas, Garras)
1. Decidir identificadores y arte:
   - `bundle identifier` iOS: com.tuempresa.flecos (o similar por marca).
   - `applicationId` Android: mx.flecos.app (consistente con marca).
   - Logos, iconos y capturas con las dimensiones requeridas.
2. OAuth y Entrar por marca:
   - En `src/oauth.js` y `src/auth.routes.js`, confirmar que hay variables por marca:
     - `GOOGLE_CLIENT_ID_FLECOS`, `GOOGLE_CLIENT_SECRET_FLECOS`, etc.
     - `APPLE_CLIENT_ID_FLECOS`, `APPLE_KEY_ID`, `APPLE_TEAM_ID`, `APPLE_PRIVATE_KEY_FILE`.
   - En `.env` (en servidor, fuera del repo), añadir las variables por marca.
   - Ejecutar localmente: `npm run identidad` y para producción:

```
FYB_ORIGEN=produccion npm run identidad
```

   - Corregir cualquier `redirect_uri_mismatch` en Google y dominios/Return URLs en Apple.
3. Verificar la firma Apple ES256: la librería debe producir `ieee-p1363` (no DER).
   - Las pruebas en `test/oauth.test.js` ya comprueban esto; falla si la firma está mal.

Builds y artefactos
- iOS (App Store):
  - Generar `ipa` con Xcode o Fastlane. Requisitos:
    - `bundle identifier`, provisioning profile y App Store Connect App creado.
    - `Sign in with Apple` configurado en App ID.
  - Versionado semántico: actualizar `CFBundleShortVersionString` y `CFBundleVersion`.
  - Capturas de pantalla para dispositivos relevantes, iconos, descripción y privacidad.
- Android (Play Store):
  - Generar `aab` recomendado (`bundletool`/Gradle/Fastlane).
  - Firmar con la keystore de release y mantener copia segura.
  - Preparar assets y descripción.

Subida y fichas en tiendas
- App Store (iOS):
  1. App Store Connect: crear app (per marca) y asignar `bundle id`.
  2. Completar ficha: nombre, subtítulo, descripción, keywords, support URL, privacy URL.
  3. Subir `ipa` (Xcode Organizer o `altool` / Fastlane `deliver`).
  4. Añadir capturas, rating, localizaciones y configuraciones de privacidad (Data Use).
  5. Revisar pruebas internas (TestFlight) antes de solicitar revisión.
  6. Revisar políticas de Apple (Sign in with Apple obligatorio si hay otros inicios de terceros).
  7. Enviar a revisión y monitorizar; responder a rechazos con logs y cambios mínimos.

- Google Play (Android):
  1. Play Console: crear app por marca.
  2. Subir `aab` o `apk` firmado.
  3. Completar ficha: descripciones, gráficas, categorización, contacto y privacy URL.
  4. Configurar testing (internal/closed/open) y lanzar pruebas.
  5. Configurar distribución por países y rollouts gradual si procede.

Checklist técnico inmediato (comprobaciones en repo antes de build)
- `npm test` verde y `npm run test:navegador` si tocaste frontend.
- `npm run identidad` OK para cada marca (local y `FYB_ORIGEN=produccion`).
- Revisar `src/oauth.js`:
  - Cliente por marca correctamente seleccionado.
  - Apple client_secret generado con formato correcto.
- `APPLE_PRIVATE_KEY_FILE` presente en servidor y legible por el proceso.
- `FYB_SECRET` en `.env` para firmar cookies/sesiones en producción.

Checklist de producto / marketing (antes de enviar)
- Textos: nombre, descripción corta y larga, palabras clave.
- Imágenes: icono a 1024px (App Store), capturas para iPhone y iPad, capturas Play Store.
- Política de privacidad publicada en HTTPS.
- Contacto de soporte y correo válido en la ficha.
- Localización: textos y capturas para mercados relevantes.

Pruebas y QA
- TestFlight (iOS): invitar testers y revisar comportamientos OAuth en entorno real (no localhost).
- Play Internal Testing: pruebas de flujo completo.
- Probar entradas reales: iniciar con Google y Apple en producción (dominios reales) antes del envío.

Post-lanzamiento
- Monitorizar analytics y errores (Sentry, logs del servidor).
- Revisar comentarios y errores de Inicio de sesión (OAuth) primero.
- Plan de rollbacks: si crash bloqueante, retirar release y subir hotfix.

Notas y recomendaciones
- No incluir `.p8` ni secretos en el repo; usar rutas (`_FILE`) y variables en el host.
- Apple no acepta `localhost`; usa `flecos.mx` o túnel HTTPS para pruebas reales.
- Publicar primero en testing y lanzar rollout gradual.

Plantilla de preguntas para preparar cada marca
1. ¿Quién administra la cuenta Apple/Google? (email y permisos)
2. ¿Bundle ID / applicationId propuesto?
3. ¿Iconos y capturas listos? (paths o URLs)
4. ¿Se usará el mismo proyecto Google para las tres marcas o uno por marca?
5. ¿Se compartirán credenciales comunes o habrá variables por marca en `.env`?

---
Si quieres, genero ahora:
- checklist desglosado en tareas de GitHub (issues) por marca, o
- un `publish.sh` / instrucciones de Fastlane mínimas para automatizar la subida.
