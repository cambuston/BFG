// Alta de un profesional, en cuatro pasos y una despedida:
//
//   1. Elige su dirección     flecos.mx/juan
//   2. Guarda su cuenta       Google / Apple
//   3. Su horario             ← ya hay sesión: de aquí en adelante es /api/mi
//   4. Sus servicios
//   5. Listo, y adentro
//
// Los pasos 3 y 4 NO llenan una pantalla en blanco. El alta deja el negocio
// estrenado con horario y servicios de ejemplo (src/negocio.js), así que lo
// que se enseña es eso ya puesto y lo único que se hace es corregirlo. Por eso
// los dos se pueden saltar y la página pública funciona igual.
(function () {
  'use strict';

  var BRAND = window.BRAND || { name: 'Flecos', domain: 'flecos.mx' };

  // Vista de prueba para referencias decoradas. No cambia el flujo normal:
  // solo se activa expresamente con `?decorated=1`.
  var decoratedMode = new URLSearchParams(window.location.search).get('decorated');
  document.body.classList.toggle('is-decorated', decoratedMode === '1');
  document.body.classList.toggle(
    'is-decorated-barbas',
    decoratedMode === 'barbas' && BRAND.id === 'barbas'
  );
  document.body.classList.toggle(
    'is-decorated-barbas-mexico',
    decoratedMode === 'barbas-mexico' && BRAND.id === 'barbas'
  );

  var $ = function (id) { return document.getElementById(id); };

  var stepsEl   = $('steps');
  var input     = $('handle');
  var box       = $('handle-box');
  var statusEl  = $('handle-status');
  var goBtn     = $('handle-go');
  var backBtn   = $('handle-back');
  var echoEl    = $('handle-echo');
  var errorEl   = $('error');
  var doneUrl   = $('done-url');
  var doneTitle = $('done-title');
  var diasEl = $('alta-dias');
  var serviciosEl = $('alta-servicios');

  var FINAL = 5;           // el número del último paso, en un solo sitio

  // El identificador tiene que sobrevivir al viaje a Google y de regreso:
  // sessionStorage, no una variable, porque la página se recarga entera.
  var SS_KEY = 'fyb_handle';

  var authCfg = { mode: 'demo', providers: [] };
  var current = '';        // último identificador confirmado como libre
  var checkTimer = null;
  var checkSeq = 0;        // descarta respuestas viejas que llegan tarde

  // ---------- Mismas reglas que el servidor (src/handles.js) ----------
  // Aquí es para limpiar lo que se teclea; quien manda siempre es el servidor.
  function normalize(raw) {
    return String(raw == null ? '' : raw)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/ñ/gi, 'n')
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-{2,}/g, '-');
  }

  var REASONS = {
    empty:    '',
    short:    'Muy corta: al menos 3 letras.',
    long:     'Muy larga: máximo 30 letras.',
    chars:    'Solo letras, números y guion.',
    hyphen:   'No puede empezar ni terminar con guion.',
    reserved: 'Esa dirección la usa la app. Escoge otra.',
    taken:    'Ya está ocupada. Prueba con otra.'
  };

  // ---------- Pasos ----------
  function show(n) {
    var steps = stepsEl.querySelectorAll('.step');
    for (var i = 0; i < steps.length; i++) {
      steps[i].hidden = (Number(steps[i].dataset.step) !== n);
    }
    errorEl.textContent = '';
    document.body.classList.toggle('is-complete', n === FINAL);
    document.body.dataset.screenStep = String(n);
  }

  function fail(msg) {
    errorEl.textContent = msg || 'Algo salió mal. Inténtalo otra vez.';
  }

  // ---------- Utilidades ----------
  function el(tag, clase, texto) {
    var e = document.createElement(tag);
    if (clase) e.className = clase;
    if (texto !== undefined && texto !== null) e.textContent = texto;
    return e;
  }

  function vaciar(n) { while (n.firstChild) n.removeChild(n.firstChild); }

  // Las llamadas de los pasos 3 y 4, que ya van con sesión.
  function pide(metodo, ruta, cuerpo) {
    var opciones = { method: metodo, headers: {} };
    if (cuerpo !== undefined && cuerpo !== null) {
      opciones.headers['Content-Type'] = 'application/json';
      opciones.body = JSON.stringify(cuerpo);
    }
    return fetch(ruta, opciones).then(function (r) {
      return r.json().then(function (d) {
        if (!r.ok) throw Object.assign(new Error('api'), { datos: d });
        return d;
      });
    });
  }

  // Una tras otra, no todas a la vez: si una falla se para ahí y se dice cuál,
  // en vez de dejar la mitad guardada sin saber qué mitad.
  function enCadena(tareas) {
    var p = Promise.resolve();
    tareas.forEach(function (t) {
      p = p.then(function () { return pide(t[0], t[1], t[2]); });
    });
    return p;
  }

  // ---------- Paso 1: ¿está libre? ----------
  function setStatus(kind, text) {
    statusEl.className = 'handle-status' + (kind ? ' is-' + kind : '');
    statusEl.textContent = '';
    if (text) {
      if (kind) {
        var icon = document.createElement('i');
        icon.className = kind === 'ok'
          ? 'fa-solid fa-circle-check'
          : 'fa-solid fa-circle-exclamation';
        statusEl.appendChild(icon);
      }
      statusEl.appendChild(document.createTextNode(text));
    }
    box.className = 'handle-box' + (kind ? ' is-' + kind : '');
  }

  function setGo(enabled, handle) {
    goBtn.disabled = !enabled;
    goBtn.textContent = enabled
      ? 'Quiero ' + BRAND.domain + '/' + handle
      : 'Escribe tu dirección';
  }

  function check() {
    var handle = normalize(input.value);
    current = '';
    setGo(false, '');

    if (!handle) { setStatus('', ''); return; }

    var seq = ++checkSeq;
    fetch('/api/handle/' + encodeURIComponent(handle))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (seq !== checkSeq) return;              // llegó tarde: ya escribió más
        if (normalize(input.value) !== handle) return;

        if (data.valid && data.available) {
          current = data.handle;
          setStatus('ok', BRAND.domain + '/' + data.handle + ' está disponible');
          setGo(true, data.handle);
        } else {
          setStatus('error', REASONS[data.reason] || 'No se puede usar esa dirección.');
        }
      })
      .catch(function () {
        if (seq !== checkSeq) return;
        setStatus('error', 'No se pudo comprobar. ¿Hay internet?');
      });
  }

  input.addEventListener('input', function () {
    // Se corrige lo tecleado en vivo (mayúsculas, acentos, espacios) para que
    // lo que se ve sea exactamente la dirección que va a quedar.
    var clean = normalize(input.value);
    if (clean !== input.value) {
      var atEnd = input.selectionStart === input.value.length;
      input.value = clean;
      if (atEnd) input.setSelectionRange(clean.length, clean.length);
    }
    setStatus('', '');
    setGo(false, '');
    clearTimeout(checkTimer);
    checkTimer = setTimeout(check, 250);
  });

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !goBtn.disabled) { e.preventDefault(); goBtn.click(); }
  });

  goBtn.addEventListener('click', function () {
    if (!current) return;
    sessionStorage.setItem(SS_KEY, current);
    echoEl.textContent = BRAND.domain + '/' + current;
    show(2);
  });

  backBtn.addEventListener('click', function () {
    sessionStorage.removeItem(SS_KEY);
    show(1);
    input.focus();
  });

  // ---------- Paso 2: identidad ----------
  //
  // Modo demo:     se inventa una identidad y se completa el alta al instante.
  // Modo supabase: se sale a Google o a Apple y se vuelve con un token.
  //                Sin SDK: Supabase expone el flujo por URL directa.

  function demoSub() {
    var k = 'fyb_demo_sub';
    var v = localStorage.getItem(k);
    if (!v) {
      v = 'u' + Math.random().toString(36).slice(2, 10);
      localStorage.setItem(k, v);
    }
    return v;
  }

  function startAuth(provider) {
    var handle = sessionStorage.getItem(SS_KEY);
    if (!handle) { show(1); return; }

    if (authCfg.mode === 'demo') {
      claim(handle, { provider: provider, sub: demoSub() }, null);
      return;
    }

    // Modo propio: el viaje lo lleva NUESTRO servidor. El identificador va en
    // la URL porque de aquí en adelante quien lo tiene que recordar es él (en
    // una cookie firmada): la dirección de regreso la fija el proveedor y no
    // admite adornos, así que no puede viajar por ahí.
    if (authCfg.mode === 'propio') {
      window.location.href = '/auth/' + encodeURIComponent(provider)
        + '?handle=' + encodeURIComponent(handle);
      return;
    }

    // Supabase: implicit flow. Vuelve a esta misma página con el token en el
    // fragmento (#access_token=...), que es lo que lee readReturnedToken().
    var url = authCfg.supabaseUrl + '/auth/v1/authorize'
      + '?provider=' + encodeURIComponent(provider)
      + '&redirect_to=' + encodeURIComponent(window.location.origin + '/');
    window.location.href = url;
  }

  // Los dos finales del alta. Están aparte porque ahora se llega a ellos por
  // DOS caminos: la respuesta del POST (modos demo y supabase) y la vuelta del
  // servidor tras hablar con Google (modo propio).
  //
  // Aquí el alta YA está hecha y la sesión abierta. Lo que sigue —horario y
  // servicios— es afinar lo que el negocio ya trae puesto, así que a quien ya
  // tenía dirección no se le vuelve a preguntar: esa persona no se está dando
  // de alta, está entrando.
  function listo(handle, esNueva) {
    sessionStorage.removeItem(SS_KEY);
    doneTitle.textContent = esNueva ? 'Ya es tuya' : 'Ya la tenías';
    doneUrl.textContent = BRAND.domain + '/' + handle;

    if (!esNueva) { show(FINAL); return; }

    pide('GET', '/api/mi/negocio')
      .then(function (d) {
        pintarHorario(d.horario);
        pintarServicios(d.servicios);
        show(3);
      })
      // Si no se pudo traer, la dirección ya es suya de todos modos: se
      // termina el alta en vez de dejarla atorada por un ajuste opcional.
      .catch(function () { show(FINAL); });
  }

  // ---------- Paso 3: el horario ----------
  //
  // Siete fichas y UNA franja. La versión día por día (siete renglones con dos
  // relojes cada uno) no cabe: en un teléfono de 390 px la tarjeta deja unos
  // 250 px de ancho y un solo input[type=time] pide 137. Y tampoco hace falta
  // aquí: casi nadie abre a horas distintas cada día, y quien lo hace tiene el
  // horario completo esperándolo en Mi negocio.
  var NOMBRES_DIA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  var FICHAS_DIA  = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

  function pintarHorario(horario) {
    vaciar(diasEl);
    for (var dia = 0; dia < 7; dia++) {
      var abierto = horario.some(function (h) { return h.dia === dia; });

      var chip = el('button', 'dia-chip', FICHAS_DIA[dia]);
      chip.type = 'button';
      chip.dataset.dia = String(dia);
      chip.setAttribute('aria-label', NOMBRES_DIA[dia]);
      chip.setAttribute('aria-pressed', abierto ? 'true' : 'false');
      chip.classList.toggle('is-on', abierto);
      chip.addEventListener('click', function () {
        var on = this.getAttribute('aria-pressed') !== 'true';
        this.setAttribute('aria-pressed', on ? 'true' : 'false');
        this.classList.toggle('is-on', on);
      });
      diasEl.appendChild(chip);
    }

    // La franja que se ofrece es la que más días comparten, no la del primero:
    // con lunes a viernes de 10 a 19 y el sábado de 9 a 3, lo que se propone
    // es 10 a 19.
    var cuenta = {};
    var mejor = null;
    horario.forEach(function (h) {
      var clave = h.abre + '|' + h.cierra;
      cuenta[clave] = (cuenta[clave] || 0) + 1;
      if (!mejor || cuenta[clave] > cuenta[mejor]) mejor = clave;
    });
    if (mejor) {
      $('alta-abre').value = mejor.split('|')[0];
      $('alta-cierra').value = mejor.split('|')[1];
    }
  }

  $('horario-sigue').addEventListener('click', function () {
    var abre = $('alta-abre').value;
    var cierra = $('alta-cierra').value;

    var prendidos = Array.prototype.filter.call(
      diasEl.querySelectorAll('.dia-chip'),
      function (c) { return c.getAttribute('aria-pressed') === 'true'; });

    // Un negocio cerrado los siete días no puede recibir una sola cita, y una
    // franja al revés lo deja igual de mudo. Más vale pararlo aquí que dejar
    // la página pública sin una hora que ofrecer.
    if (!prendidos.length) { fail('Escoge al menos un día.'); return; }
    if (!abre || !cierra) { fail('Pon la hora a la que abres y a la que cierras.'); return; }
    if (cierra <= abre) { fail('La hora de cierre va después de la de abrir.'); return; }

    var dias = prendidos.map(function (c) {
      return { dia: Number(c.dataset.dia), abre: abre, cierra: cierra };
    });

    ocupado(this, true);
    pide('PUT', '/api/mi/horario', { dias: dias })
      .then(function () { show(4); })
      .catch(function () { fail('No se pudo guardar el horario.'); })
      .then(function () { ocupado($('horario-sigue'), false); });
  });

  $('horario-salta').addEventListener('click', function () { show(4); });

  // ---------- Paso 4: los servicios ----------
  //
  // Se editan en la propia lista, no en una hoja aparte: son tres renglones y
  // lo normal es cambiarle el precio a los tres de corrido.
  var borrados = [];        // ids que había y se quitaron

  function pintarServicios(servicios) {
    vaciar(serviciosEl);
    borrados = [];
    servicios.forEach(agregarFila);
  }

  function agregarFila(s) {
    var fila = el('div', 'alta-servicio');
    if (s && s.id) fila.dataset.id = String(s.id);
    // Lo que llegó, para no mandar de vuelta lo que nadie tocó.
    fila.dataset.antes = JSON.stringify(s
      ? { nombre: s.nombre, precio: s.precio === null ? '' : String(s.precio), minutos: String(s.minutos) }
      : {});

    var nombre = document.createElement('input');
    nombre.type = 'text';
    nombre.className = 's-nombre';
    nombre.maxLength = 60;
    nombre.placeholder = 'Corte';
    nombre.value = s ? s.nombre : '';
    fila.appendChild(nombre);

    var linea = el('div', 's-linea');

    var precio = document.createElement('input');
    precio.type = 'number';
    precio.className = 's-precio';
    precio.inputMode = 'numeric';
    precio.min = '0';
    precio.placeholder = '250';
    precio.value = s && s.precio !== null ? String(s.precio) : '';
    linea.appendChild(campito('$', precio, null));

    var minutos = document.createElement('input');
    minutos.type = 'number';
    minutos.className = 's-minutos';
    minutos.inputMode = 'numeric';
    minutos.min = '5';
    minutos.placeholder = '30';
    minutos.value = s ? String(s.minutos) : '30';
    linea.appendChild(campito(null, minutos, 'min'));

    var quitar = el('button', 's-quitar');
    quitar.type = 'button';
    quitar.setAttribute('aria-label', 'Quitar servicio');
    quitar.appendChild(el('i', 'fa-light fa-trash'));
    quitar.addEventListener('click', function () {
      if (fila.dataset.id) borrados.push(fila.dataset.id);
      fila.parentNode.removeChild(fila);
    });
    linea.appendChild(quitar);

    fila.appendChild(linea);
    serviciosEl.appendChild(fila);
    return fila;
  }

  // Un campo con su unidad pegada ("$ 250", "30 min"), para que se lea sin
  // etiqueta encima: en esta tarjeta no cabe una etiqueta por campo.
  function campito(antes, input, despues) {
    var caja = el('label', 's-campo');
    if (antes) caja.appendChild(el('span', 's-unidad', antes));
    caja.appendChild(input);
    if (despues) caja.appendChild(el('span', 's-unidad', despues));
    return caja;
  }

  $('alta-agregar').addEventListener('click', function () {
    agregarFila(null).querySelector('.s-nombre').focus();
  });

  // Las mismas reglas que src/negocio.js. Aquí es para decirlo antes de mandar;
  // quien manda sigue siendo el servidor.
  function revisar(fila) {
    var nombre = fila.querySelector('.s-nombre').value.trim();
    if (!nombre) return { error: 'Ponle nombre a cada servicio.' };

    var minutos = Number(fila.querySelector('.s-minutos').value);
    if (!isFinite(minutos) || minutos < 5 || minutos > 480) {
      return { error: '«' + nombre + '»: los minutos van entre 5 y 480.' };
    }

    // El precio puede faltar («sobre pedido»), pero si viene es un número.
    var crudo = fila.querySelector('.s-precio').value.trim();
    if (crudo !== '' && !isFinite(Number(crudo))) {
      return { error: '«' + nombre + '»: el precio tiene que ser un número.' };
    }

    return { datos: { nombre: nombre, precio: crudo, minutos: String(minutos) } };
  }

  $('servicios-sigue').addEventListener('click', function () {
    var filas = Array.prototype.slice.call(serviciosEl.querySelectorAll('.alta-servicio'));
    // Sin un solo servicio no hay nada que reservar: la página pública queda
    // en pie pero vacía.
    if (!filas.length) { fail('Deja al menos un servicio.'); return; }

    var tareas = [];
    for (var i = 0; i < filas.length; i++) {
      var r = revisar(filas[i]);
      if (r.error) { fail(r.error); return; }

      var id = filas[i].dataset.id;
      if (!id) { tareas.push(['POST', '/api/mi/servicio', r.datos]); continue; }
      // Lo que nadie tocó no se vuelve a escribir.
      if (filas[i].dataset.antes !== JSON.stringify(r.datos)) {
        tareas.push(['PUT', '/api/mi/servicio/' + id, r.datos]);
      }
    }
    borrados.forEach(function (id) { tareas.push(['DELETE', '/api/mi/servicio/' + id, null]); });

    ocupado(this, true);
    enCadena(tareas)
      .then(function () { show(FINAL); })
      .catch(function () { fail('No se pudieron guardar los servicios.'); })
      .then(function () { ocupado($('servicios-sigue'), false); });
  });

  $('servicios-salta').addEventListener('click', function () { show(FINAL); });

  // ---------- Listo ----------
  $('done-ir').addEventListener('click', function () { window.location.href = '/mi'; });

  // Mientras se guarda, el botón no se puede volver a tocar: dos clics serían
  // dos altas del mismo servicio.
  function ocupado(boton, si) {
    boton.disabled = si;
    boton.classList.toggle('esperando', si);
  }

  // Alguien la tomó mientras se autenticaba. De regreso al paso 1, con el
  // campo limpio y diciendo qué pasó y qué hacer.
  function laGanaron(handle) {
    sessionStorage.removeItem(SS_KEY);
    show(1);
    input.value = '';
    setStatus('error', 'Alguien tomó ' + BRAND.domain + '/' + handle
      + ' mientras entrabas. Escoge otra.');
    setGo(false, '');
    input.focus();
  }

  // POST del alta. `token` va como Bearer cuando hay Supabase de por medio.
  function claim(handle, fakeAuth, token) {
    var headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;

    fetch('/api/handle/claim', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ handle: handle, auth: fakeAuth || {} })
    })
      .then(function (r) {
        return r.json().then(function (data) { return { status: r.status, data: data }; });
      })
      .then(function (res) {
        if (res.status === 409) { laGanaron(handle); return; }
        if (res.status === 401) { show(2); fail('No se pudo confirmar tu cuenta.'); return; }
        if (!res.data || !res.data.ok) { show(2); fail(res.data && res.data.error); return; }

        listo(res.data.handle, !res.data.already);
      })
      .catch(function () { show(2); fail('No se pudo guardar. ¿Hay internet?'); });
  }

  // Regreso de Supabase. Vuelve una de dos cosas, y las dos por la URL:
  //
  //   #access_token=...                          salió bien
  //   #error=access_denied&error_description=... salió mal
  //
  // Lo segundo es el camino MÁS COMÚN de todos —quien le da a «Cancelar» en la
  // pantalla de Google pasa por aquí— y también por donde aparece un proveedor
  // mal configurado. Antes se ignoraba: la persona volvía al paso 1 con el
  // campo vacío, sin una palabra de qué pasó.
  //
  // Supabase manda el error en el fragmento o en la query según el caso, así
  // que se miran los dos.
  function readReturn() {
    var frag = new URLSearchParams((window.location.hash || '').slice(1));
    var query = new URLSearchParams(window.location.search || '');
    var token = frag.get('access_token');
    var error = frag.get('error') || query.get('error');
    // En modo propio el alta ya la hizo el servidor: aquí solo llega el
    // resultado, para pintar la misma pantalla final de siempre.
    var listo = query.get('listo');
    var ocupada = query.get('ocupada');
    if (!token && !error && !listo && !ocupada) return null;

    // Limpia la barra de direcciones: ni el token ni el error se quedan ahí.
    history.replaceState(null, '', window.location.pathname);

    return {
      token: token,
      error: error,
      listo: listo,
      nueva: query.get('nueva') === '1',
      ocupada: ocupada,
      detalle: frag.get('error_description') || query.get('error_description') || ''
    };
  }

  // Los códigos de error en cristiano. Unos vienen del proveedor
  // (`access_denied` cuando le dan a Cancelar) y otros de nuestro servidor.
  // Lo que no esté en la lista cae en un mensaje genérico: la lista del
  // proveedor puede crecer sin avisar.
  function textoDeError(codigo) {
    if (codigo === 'access_denied') return 'No se completó el acceso. Puedes intentarlo otra vez.';
    // Lo mismo, dicho por Apple: es como llama a darle a «Cancelar».
    if (codigo === 'user_cancelled_authorize') return 'No se completó el acceso. Puedes intentarlo otra vez.';
    if (codigo === 'server_error') return 'La cuenta no respondió. Inténtalo otra vez en un momento.';
    // Tardó más de diez minutos, o abrió el regreso en otro navegador.
    if (codigo === 'viaje_perdido') return 'Se venció el intento. Vuelve a darle al botón.';
    if (codigo === 'sin_identidad') return 'No se pudo confirmar tu cuenta. Inténtalo otra vez.';
    if (codigo === 'proveedor_no_disponible') return 'Esa forma de entrar no está lista todavía.';
    if (codigo === 'handle_invalido') return 'Esa dirección no sirve. Escoge otra.';
    return 'No se pudo entrar con esa cuenta. Prueba con otra.';
  }

  Array.prototype.forEach.call(
    document.querySelectorAll('[data-provider]'),
    function (btn) {
      btn.addEventListener('click', function () { startAuth(btn.dataset.provider); });
    }
  );

  // ---------- Arranque ----------
  fetch('/api/config')
    .then(function (r) { return r.json(); })
    .then(function (cfg) {
      authCfg = cfg.auth || authCfg;

      if (authCfg.mode === 'demo') {
        var note = document.createElement('p');
        note.className = 'demo-flag';
        note.textContent = 'Modo demo: la cuenta es de mentiras.';
        document.querySelector('[data-step="2"]').appendChild(note);
      }

      // Un botón sin credenciales es un botón que falla al tocarlo. Solo se
      // enseñan los que el servidor dice que puede atender para ESTA marca:
      // Flecos puede tener Apple y Barbas todavía no.
      if (authCfg.providers && authCfg.providers.length) {
        Array.prototype.forEach.call(
          document.querySelectorAll('[data-provider]'),
          function (btn) {
            btn.hidden = authCfg.providers.indexOf(btn.dataset.provider) < 0;
          }
        );
      }

      // ¿Venimos de vuelta de Google o de Apple?
      var vuelta = readReturn();
      var pending = sessionStorage.getItem(SS_KEY);

      // Modo propio: el servidor ya hizo el alta y solo manda el resultado.
      if (vuelta && vuelta.ocupada) { laGanaron(vuelta.ocupada); return; }
      if (vuelta && vuelta.listo) { listo(vuelta.listo, vuelta.nueva); return; }

      if (vuelta && pending) {
        // El identificador sobrevivió el viaje: se queda en el paso 2 pase lo
        // que pase, para que reintentar sea un clic y no volver a escribirlo.
        echoEl.textContent = BRAND.domain + '/' + pending;
        show(2);
        if (vuelta.token) claim(pending, null, vuelta.token);
        else fail(textoDeError(vuelta.error));
        return;
      }

      // Vuelta sin identificador guardado (otra pestaña, sessionStorage
      // limpio): al paso 1, pero explicando si hubo error.
      if (vuelta && vuelta.error) {
        show(1);
        input.focus();
        fail(textoDeError(vuelta.error));
        return;
      }

      show(1);
      input.focus();
    })
    .catch(function () { show(1); });
})();
