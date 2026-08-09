// flecos.mx/juan — lo que ve el CLIENTE.
//
//   portada → ¿qué te haces? → ¿cuándo? → ¿quién eres? → listo
//
// Sin cuenta y sin contraseña, y con el mínimo de preguntas: quien quiere
// cortarse el pelo no quiere llenar un formulario.
(function () {
  'use strict';

  var HANDLE = window.HANDLE;
  var API = '/api/p/' + encodeURIComponent(HANDLE);

  var $ = function (id) { return document.getElementById(id); };
  var stepsEl = $('steps');
  var errorEl = $('error');

  var negocio = null;
  var elegido = { servicio: null, fecha: null, hora: null, titulo: '', horaBonita: '' };

  // Cuántas horas se enseñan por día antes del "ver más".
  var VISIBLES = 6;

  // El celular se recuerda en este navegador: la segunda vez que reserva, ya
  // no se lo volvemos a preguntar.
  var LS_TEL = 'fyb_tel_' + HANDLE;

  function show(n) {
    var pasos = stepsEl.querySelectorAll('.step');
    for (var i = 0; i < pasos.length; i++) {
      pasos[i].hidden = (Number(pasos[i].dataset.step) !== n);
    }
    errorEl.textContent = '';
    window.scrollTo(0, 0);
  }

  function fail(msg) { errorEl.textContent = msg || 'Algo salió mal. Inténtalo otra vez.'; }

  function pesos(n) {
    return (n === null || n === undefined) ? '' : '$' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  // Crea un elemento con texto. Se usa en vez de innerHTML en todo el archivo:
  // los nombres los escribe gente y no queremos meterlos crudos en el HTML.
  function el(tag, clase, texto) {
    var e = document.createElement(tag);
    if (clase) e.className = clase;
    if (texto !== undefined && texto !== null) e.textContent = texto;
    return e;
  }

  function vaciar(nodo) { while (nodo.firstChild) nodo.removeChild(nodo.firstChild); }

  // ---------- Portada ----------

  function pintarPortada() {
    var sub = [];
    if (negocio.ciudad) sub.push(negocio.ciudad);
    $('sub').textContent = sub.join(' · ');

    var lista = $('precios');
    vaciar(lista);
    negocio.servicios.forEach(function (s) {
      var li = el('li', 'precio-row');
      li.appendChild(el('span', 'precio-nombre', s.nombre));
      li.appendChild(el('span', 'precio-valor', s.precio === null ? 'Pregunta' : pesos(s.precio)));
      lista.appendChild(li);
    });

    if (negocio.whatsapp) {
      var wa = $('ir-wa');
      wa.href = 'https://wa.me/' + negocio.whatsapp;
      wa.hidden = false;
    }

    $('horario-nota').textContent = resumenHorario(negocio.horario);
  }

  var DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

  // "lun a vie 10:00–19:00 · sáb 09:00–15:00". Junta los días seguidos que
  // tienen el mismo horario para que se lea de un vistazo.
  function resumenHorario(horario) {
    if (!horario || !horario.length) return '';
    var grupos = [];
    horario.forEach(function (h) {
      var ultimo = grupos[grupos.length - 1];
      if (ultimo && ultimo.abre === h.abre && ultimo.cierra === h.cierra && ultimo.fin === h.dia - 1) {
        ultimo.fin = h.dia;
      } else {
        grupos.push({ ini: h.dia, fin: h.dia, abre: h.abre, cierra: h.cierra });
      }
    });
    return grupos.map(function (g) {
      var dias = g.ini === g.fin
        ? DIAS_CORTOS[g.ini]
        : DIAS_CORTOS[g.ini] + ' a ' + DIAS_CORTOS[g.fin];
      return dias + ' ' + g.abre + '–' + g.cierra;
    }).join(' · ');
  }

  // ---------- 1 · ¿Qué te haces? ----------

  function pintarServicios() {
    var caja = $('servicios');
    vaciar(caja);
    negocio.servicios.forEach(function (s) {
      var b = el('button', 'servicio-btn');
      b.type = 'button';
      var izq = el('span', 'servicio-txt');
      izq.appendChild(el('span', 'servicio-nombre', s.nombre));
      izq.appendChild(el('span', 'servicio-min', s.minutos + ' min'));
      b.appendChild(izq);
      b.appendChild(el('span', 'servicio-precio', s.precio === null ? '' : pesos(s.precio)));
      b.addEventListener('click', function () { elegirServicio(s); });
      caja.appendChild(b);
    });
  }

  function elegirServicio(s) {
    elegido.servicio = s;
    $('elegido-servicio').textContent = s.nombre + (s.precio === null ? '' : ' · ' + pesos(s.precio));
    show(2);
    cargarDias();
  }

  // ---------- 2 · ¿Cuándo? ----------

  function cargarDias() {
    var caja = $('dias');
    vaciar(caja);
    caja.appendChild(el('p', 'cargando', 'Buscando horarios…'));

    fetch(API + '/dias?servicio=' + elegido.servicio.id)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        vaciar(caja);
        if (!data.dias || !data.dias.length) {
          caja.appendChild(el('p', 'empty', 'No hay horarios libres por ahora.'));
          return;
        }
        data.dias.forEach(function (d) {
          var grupo = el('div', 'dia');
          grupo.appendChild(el('p', 'dia-titulo', d.es_hoy ? 'Hoy' : d.titulo));

          var horas = el('div', 'horas');
          var boton = function (h) {
            var b = el('button', 'hora-btn', h.bonita);
            b.type = 'button';
            b.addEventListener('click', function () { elegirHora(d, h); });
            return b;
          };

          // De entrada solo unas cuantas. Un día entero son 18 horas y una
          // pared de botones no ayuda a escoger; quien no encuentre la suya
          // toca "ver todas".
          d.horas.slice(0, VISIBLES).forEach(function (h) { horas.appendChild(boton(h)); });
          grupo.appendChild(horas);

          if (d.horas.length > VISIBLES) {
            var mas = el('button', 'ver-mas', '+ ' + (d.horas.length - VISIBLES) + ' horas más');
            mas.type = 'button';
            mas.addEventListener('click', function () {
              d.horas.slice(VISIBLES).forEach(function (h) { horas.appendChild(boton(h)); });
              mas.remove();
            });
            grupo.appendChild(mas);
          }

          caja.appendChild(grupo);
        });
      })
      .catch(function () {
        vaciar(caja);
        caja.appendChild(el('p', 'empty', 'No se pudieron cargar los horarios.'));
      });
  }

  function elegirHora(dia, hora) {
    elegido.fecha = dia.fecha;
    elegido.hora = hora.hora;
    elegido.titulo = dia.es_hoy ? 'hoy' : dia.titulo;
    elegido.horaBonita = hora.bonita;

    $('elegido-cita').textContent =
      elegido.servicio.nombre + ' · ' + elegido.titulo + ' a las ' + hora.bonita;

    var guardado = localStorage.getItem(LS_TEL);
    if (guardado) $('telefono').value = guardado;

    show(3);
    ($('nombre').value ? $('telefono') : $('nombre')).focus();
  }

  // ---------- 3 · ¿Quién eres? ----------

  $('confirmar').addEventListener('click', function () {
    var nombre = $('nombre').value.trim();
    var telefono = $('telefono').value.trim();
    if (!nombre) { fail('Nos falta tu nombre.'); $('nombre').focus(); return; }
    if (telefono.replace(/\D/g, '').length < 7) {
      fail('Nos falta tu celular.'); $('telefono').focus(); return;
    }

    var boton = this;
    boton.disabled = true;
    boton.textContent = 'Guardando…';

    fetch(API + '/cita', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        servicioId: elegido.servicio.id,
        fecha: elegido.fecha,
        hora: elegido.hora,
        nombre: nombre,
        telefono: telefono
      })
    })
      .then(function (r) { return r.json().then(function (d) { return { status: r.status, data: d }; }); })
      .then(function (res) {
        boton.disabled = false;
        boton.textContent = 'Confirmar mi cita';

        // Alguien la tomó mientras llenaba sus datos: de regreso a las horas.
        if (res.status === 409) {
          show(2);
          fail('Alguien acaba de tomar esa hora. Escoge otra.');
          cargarDias();
          return;
        }
        if (res.status !== 201) { fail(mensajeError(res.data && res.data.error)); return; }

        localStorage.setItem(LS_TEL, telefono);
        $('listo-titulo').textContent = '¡Listo, ' + res.data.nombre + '!';
        $('listo-cita').textContent =
          res.data.cita.servicio + ' · ' + res.data.cita.titulo + ' a las ' + res.data.cita.hora;
        $('listo-nota').textContent = 'Te esperamos. Si no puedes venir, avísale a '
          + negocio.nombre + '.';
        show(4);
      })
      .catch(function () {
        boton.disabled = false;
        boton.textContent = 'Confirmar mi cita';
        fail('No se pudo guardar. ¿Hay internet?');
      });
  });

  function mensajeError(clave) {
    var m = {
      cerrado: 'Ese día ya no se trabaja. Escoge otro.',
      'fuera de horario': 'Esa hora quedó fuera del horario.',
      pasado: 'Esa fecha ya pasó.',
      nombre: 'Nos falta tu nombre.'
    };
    return m[clave] || 'No se pudo guardar la cita.';
  }

  // ---------- Ya soy cliente ----------

  $('ir-soy').addEventListener('click', function () {
    show(5);
    $('soy-resultado').hidden = true;
    var guardado = localStorage.getItem(LS_TEL);
    if (guardado) $('soy-telefono').value = guardado;
    $('soy-telefono').focus();
  });

  $('soy-buscar').addEventListener('click', buscarme);
  $('soy-telefono').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); buscarme(); }
  });

  function buscarme() {
    var tel = $('soy-telefono').value.trim();
    if (tel.replace(/\D/g, '').length < 7) { fail('Escribe tu celular completo.'); return; }

    fetch(API + '/soy?telefono=' + encodeURIComponent(tel))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.conocido) {
          fail('No te encontramos con ese número. Haz tu cita y te conocemos.');
          return;
        }
        localStorage.setItem(LS_TEL, tel);
        $('nombre').value = data.nombre;
        $('telefono').value = tel;

        $('soy-saludo').textContent = 'Hola, ' + data.nombre + ' 👋';

        var prox = $('soy-proxima');
        if (data.proxima) {
          prox.textContent = 'Ya tienes cita: ' + data.proxima.titulo + ' a las ' + data.proxima.hora;
          prox.hidden = false;
        } else {
          prox.hidden = true;
        }

        // "Reservar lo de siempre": el corazón de hacer fácil regresar.
        var siempre = $('soy-siempre');
        var suyo = data.habitual && buscarServicio(data.habitual);
        if (suyo) {
          $('soy-siempre-texto').textContent = 'Lo de siempre: ' + suyo.nombre;
          siempre.hidden = false;
          siempre.onclick = function () { elegirServicio(suyo); };
        } else {
          siempre.hidden = true;
        }

        $('soy-resultado').hidden = false;
        errorEl.textContent = '';
      })
      .catch(function () { fail('No se pudo comprobar. ¿Hay internet?'); });
  }

  function buscarServicio(nombre) {
    for (var i = 0; i < negocio.servicios.length; i++) {
      if (negocio.servicios[i].nombre === nombre) return negocio.servicios[i];
    }
    return null;
  }

  $('soy-otra').addEventListener('click', function () { show(1); });
  $('ir-cita').addEventListener('click', function () { show(1); });

  Array.prototype.forEach.call(document.querySelectorAll('[data-volver]'), function (b) {
    b.addEventListener('click', function () { show(Number(b.dataset.volver)); });
  });

  // ---------- Arranque ----------

  fetch(API)
    .then(function (r) { return r.json(); })
    .then(function (data) {
      negocio = data;
      pintarPortada();
      pintarServicios();
      show(0);
    })
    .catch(function () { fail('No se pudo cargar la página.'); });
})();
