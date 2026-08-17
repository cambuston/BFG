# Los archivos con los que se comprueba un dominio

**Hoy esto está vacío a propósito, y así está bien.** La pantalla de *Web
Authentication Configuration* de Apple —Services ID → *Sign in with Apple* →
**Configure**— pide el dominio y la Return URL y nada más: no hay *Download*
de ningún archivo ni botón de *Verify*. Comprobado en el portal, en los tres
Services ID, el 2026-08-11.

Entonces, ¿por qué existe esta carpeta? Porque **cuando alguien sí pida un
archivo en `/.well-known/`, la trampa está puesta**: Express no sirve nada cuyo
camino empiece por punto (`dotfiles: 'ignore'`), así que dejarlo en
`public/.well-known/` da un 404 y del otro lado solo se lee «no pudimos
verificar el dominio». Apple tuvo ese paso años atrás con el
`apple-developer-domain-association.txt`, y lo siguen pidiendo Google Search
Console y compañía.

Así que el archivo va aquí, con el **nombre de la marca**:

```
flecos.txt      lo que sirve flecos.mx y www.flecos.mx
barbas.txt      … barbas.mx
garras.txt      … garras.mx
```

El servidor lo publica en
`https://<dominio>/.well-known/apple-developer-domain-association.txt` y
escoge el de la marca por el Host, igual que hace con los iconos (la ruta está
en `server.js`). Si falta el de una marca, 404 y ya: no rompe nada, y eso está
probado en `test/alta.test.js`.

No son secretos —son públicos por diseño, cualquiera puede pedirlos— así que
van a git sin problema.
