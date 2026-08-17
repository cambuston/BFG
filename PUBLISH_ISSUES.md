# Plantillas de Issues para publicación (pegar en GitHub)

Usa estas plantillas como issues por marca. Rellena los campos y asígnalas.

-- Issue: Preparar OAuth y configuración por marca --
Title: Preparar OAuth y `.env` para {MARCA}
Body:
- Marca: {MARCA} (Flecos / Barbas / Garras)
- Responsable: @
- Checklist:
  - [ ] `GOOGLE_CLIENT_ID_{APELLIDO}` y `GOOGLE_CLIENT_SECRET_{APELLIDO}` añadidos al `.env` de producción fuera del repo
  - [ ] `APPLE_CLIENT_ID_{APELLIDO}`, `APPLE_KEY_ID`, `APPLE_TEAM_ID` y `APPLE_PRIVATE_KEY_FILE` configurados en el host
  - [ ] Return URLs registrados en Google Cloud Console y Apple (ver README `identidad`)
  - [ ] Ejecutar `FYB_ORIGEN=produccion npm run identidad` y confirmar OK
  - [ ] Probar login local + pruebas de navegador (`npm run test:navegador`)

-- Issue: Preparar assets y ficha de tienda --
Title: Assets y ficha para tienda — {MARCA}
Body:
- Checklist:
  - [ ] Iconos en todas las resoluciones (App Store 1024, Play Store 512/1024)
  - [ ] Capturas de pantalla para móvil (iPhone / Android) y web si aplica
  - [ ] Textos: nombre, subtítulo, descripción corta y larga
  - [ ] URL de privacidad (HTTPS) y contacto de soporte
  - [ ] Localizaciones: listar idiomas objetivo

-- Issue: Preparar build y pruebas internas --
Title: Build y testing interno — {MARCA}
Body:
- Checklist:
  - [ ] Configurar `APP_IDENTIFIER` / `applicationId` por marca
  - [ ] Confirmar scheme iOS y task Gradle Android
  - [ ] Ejecutar `bundle exec fastlane ios beta` (o Xcode) y subir a TestFlight
  - [ ] Ejecutar `bundle exec fastlane android beta` y habilitar Internal Testing
  - [ ] Probar flujo completo de OAuth en entorno real (dominios HTTPS)

-- Issue: Lanzamiento producción — {MARCA}
Title: Lanzamiento producción — {MARCA}
Body:
- Checklist:
  - [ ] Ficha completada en App Store Connect / Play Console
  - [ ] Release build (`ipa` / `aab`) listo y firmado
  - [ ] Rollout gradual planificado (porcentaje, países)
  - [ ] Monitorización y Sentry/errores configurados

-- Issue: Añadir Fastlane y CI — repo
Title: Añadir Fastlane y lanes para builds (iOS/Android)
Body:
- Checklist:
  - [ ] `fastlane/Fastfile`, `fastlane/Appfile` y `Gemfile` añadidos (ya hechos)
  - [ ] Instrucciones en `fastlane/README.md`
  - [ ] Añadir secretos (AuthKey `.p8`, JSON_KEY_FILE) en los secretos del CI
  - [ ] Crear workflow mínimo en CI para `fastlane android beta` y `fastlane ios beta`

-- Cómo usar
- Copia la plantilla, reemplaza `{MARCA}` por `Flecos`, `Barbas` o `Garras` y crea el issue.
