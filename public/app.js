// Alta de un profesional, en dos pasos:
//
//   1. Elige su dirección     flecos.mx/juan
//   2. Guarda su cuenta       Google / Apple / Facebook
//
// Nada más. Servicios, horarios, clientes y citas vienen después.
(function () {
  'use strict';

  var BRAND = window.BRAND || { name: 'Flecos', domain: 'flecos.mx' };

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
  }

  function fail(msg) {
    errorEl.textContent = msg || 'Algo salió mal. Inténtalo otra vez.';
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
  // Modo supabase: se sale a Google/Apple/Facebook y se vuelve con un token.
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

    // Supabase: implicit flow. Vuelve a esta misma página con el token en el
    // fragmento (#access_token=...), que es lo que lee readReturnedToken().
    var url = authCfg.supabaseUrl + '/auth/v1/authorize'
      + '?provider=' + encodeURIComponent(provider)
      + '&redirect_to=' + encodeURIComponent(window.location.origin + '/');
    window.location.href = url;
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
        if (res.status === 409) {
          // Alguien la tomó mientras se autenticaba. De regreso al paso 1.
          sessionStorage.removeItem(SS_KEY);
          show(1);
          input.value = '';
          setStatus('error', 'Alguien tomó ' + BRAND.domain + '/' + handle
            + ' mientras entrabas. Escoge otra.');
          setGo(false, '');
          input.focus();
          return;
        }
        if (res.status === 401) { show(2); fail('No se pudo confirmar tu cuenta.'); return; }
        if (!res.data || !res.data.ok) { show(2); fail(res.data && res.data.error); return; }

        sessionStorage.removeItem(SS_KEY);
        doneTitle.textContent = res.data.already ? 'Ya la tenías' : 'Ya es tuya';
        doneUrl.textContent = BRAND.domain + '/' + res.data.handle;
        show(3);
      })
      .catch(function () { show(2); fail('No se pudo guardar. ¿Hay internet?'); });
  }

  // Regreso de Supabase: el token viene en el fragmento de la URL.
  function readReturnedToken() {
    if (!window.location.hash) return null;
    var p = new URLSearchParams(window.location.hash.slice(1));
    var token = p.get('access_token');
    if (!token) return null;
    // Limpia la barra de direcciones: el token no debe quedarse ahí.
    history.replaceState(null, '', window.location.pathname);
    return token;
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

      // ¿Venimos de vuelta de Google/Apple/Facebook?
      var token = readReturnedToken();
      var pending = sessionStorage.getItem(SS_KEY);
      if (token && pending) {
        echoEl.textContent = BRAND.domain + '/' + pending;
        show(2);
        claim(pending, null, token);
        return;
      }

      show(1);
      input.focus();
    })
    .catch(function () { show(1); });
})();
