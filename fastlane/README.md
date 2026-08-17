# Fastlane — instrucciones rápidas

Requiere Ruby y Bundler. Instalación y uso mínimo:

```bash
gem install bundler
bundle install
```

Variables de entorno recomendadas (por marca):

- `APP_IDENTIFIER` (ej. com.tuempresa.flecos)
- `IOS_SCHEME` (nombre del scheme Xcode)
- `APPLE_ID` (cuenta Apple)
- `JSON_KEY_FILE` (ruta al service account JSON de Google Play)
- `GRADLE_TASK` (opcional, por defecto `bundle`)

Uso:

```bash
bundle exec fastlane ios beta
bundle exec fastlane ios release
bundle exec fastlane android beta
bundle exec fastlane android release
```

Notas:
- Personaliza `fastlane/Appfile` por marca o exporta variables de entorno.
- No guardes claves en el repo: `AuthKey_*.p8` y `JSON_KEY_FILE` fuera del árbol.
