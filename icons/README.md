# icons — el arte de las tres marcas

El original. **Nada de esta carpeta la sirve la app**: lo que usa está copiado
en `public/marca/<marca>/`.

```
f.png / f.zip     Flecos — un fleco
b.png / b.zip     Barbas — una barba
g.png / g.zip     Garras — una mano de uñas pintadas
```

Los `.zip` traen el juego completo generado a partir del dibujo: `android/`,
`ios/` y `web/`. De ahí salió lo que hay en `public/marca/`:

| Archivo | De dónde sale | Para qué |
|---|---|---|
| `icono.png` | `android/res/mipmap-xxxhdpi/ic_launcher_foreground.png` | **el logo de la portada** |
| `favicon.ico`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png` | `web/` | la pestaña del navegador y la pantalla de inicio |

**Por qué `icono.png` sale de la capa de Android y no del PNG suelto**: es la
única versión de las tres con el mismo encuadre (432×432, el trazo ocupa el 43%
del ancho centrado, medido) y con resolución suficiente para 86 px a 3x. Los
sueltos van de 140 a 449 px y cada uno con su margen.

El alto sí varía, y es del dibujo, no del encuadre: Flecos y Barbas son casi
cuadrados y el de Garras es una mano tumbada (43% de ancho por 27% de alto),
así que en la portada sale igual de ancho pero más bajo. Es lo esperado.

**El logo NO se pinta, se usa de máscara.** El arte es trazo negro sobre
transparente y `public/tema.css` lo usa de plantilla sobre `--acento`, así que
sigue al tema de cada marca (ver `colores/README.md`). Si algún día se cambia
el arte, lo único que importa es que siga siendo **trazo sobre transparente**:
un PNG con fondo blanco horneado pintaría un cuadrado sólido.

`google/` son los mismos iconos a **120×120**, que es lo que pide la pantalla
de consentimiento de Google (*Google Auth Platform → Branding → App logo*): uno
por marca, salidos de `public/marca/<marca>/icon-512.png` con `sips -z 120 120`.
No los sirve nadie; están hechos para subirlos a mano al portal, que es cosa de
una vez por proyecto.

Para una marca nueva: generas el juego, copias esos cinco archivos a
`public/marca/<marca>/` y ya. `src/brand.js` arma la ruta con el id de la
marca, así que no hay ninguna lista que actualizar.

Los `android/` e `ios/` de los `.zip` se quedan aquí hasta que haya app nativa.
