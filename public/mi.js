// El área del profesional. Cuatro pestañas y nada más:
//
//   Hoy         la agenda del día                  → Citas
//   Clientes    la ficha y las notas               → Memoria
//   Recordar    a quién hay que escribirle hoy     → Regreso
//   Mi negocio  servicios y horario
//
// La ficha del cliente no es una pantalla aparte: es una hoja que sube desde
// abajo. Tocar un cliente en cualquier lista abre la misma.
(function () {
  'use strict';

  var BRAND = window.BRAND || {};
  var $ = function (id) { return document.getElementById(id); };

  var yo = null;
  var negocio = null;
  var fechaVista = null;      // qué día se está viendo en Hoy

  // ---------- utilidades ----------

  function el(tag, clase, texto) {
    var e = document.createElement(tag);
    if (clase) e.className = clase;
    if (texto !== undefined && texto !== null) e.textContent = texto;
    return e;
  }

  function vaciar(n) { while (n.firstChild) n.removeChild(n.firstChild); }

  function pesos(n) {
    return (n === null || n === undefined) ? '' : '$' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  var avisoTimer = null;
  function aviso(msg) {
    var e = $('error');
    e.textContent = msg;
    e.classList.add('visible');
    clearTimeout(avisoTimer);
    avisoTimer = setTimeout(function () { e.classList.remove('visible'); }, 3200);
  }

  // Todas las llamadas pasan por aquí: si la sesión se venció, al alta.
  function api(metodo, ruta, cuerpo) {
    var opciones = { method: metodo, headers: {} };
    if (cuerpo !== undefined) {
      opciones.headers['Content-Type'] = 'application/json';
      opciones.body = JSON.stringify(cuerpo);
    }
    return fetch('/api/mi' + ruta, opciones).then(function (r) {
      if (r.status === 401) { window.location.href = '/'; throw new Error('sin sesion'); }
      return r.json().then(function (d) {
        if (!r.ok) throw Object.assign(new Error(d.error || 'error'), { datos: d, status: r.status });
        return d;
      });
    });
  }

  // ---------- pestañas ----------

  var TITULOS = { hoy: 'Hoy', clientes: 'Clientes', regresos: 'Recordatorios', negocio: 'Mi negocio' };

  function ir(nombre) {
    Array.prototype.forEach.call(document.querySelectorAll('.vista'), function (v) {
      v.hidden = v.dataset.vista !== nombre;
    });
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (t) {
      t.classList.toggle('is-activa', t.dataset.ir === nombre);
    });
    $('mi-titulo').textContent = TITULOS[nombre];
    $('mi-main').scrollTop = 0;

    if (nombre === 'hoy') cargarAgenda(fechaVista);
    if (nombre === 'clientes') cargarClientes($('buscar').value);
    if (nombre === 'regresos') cargarRecordatorios();
    if (nombre === 'negocio') cargarNegocio();
  }

  Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (t) {
    t.addEventListener('click', function () { ir(t.dataset.ir); });
  });

  // ---------- HOY ----------

  function cargarAgenda(fecha) {
    api('GET', '/agenda' + (fecha ? '?fecha=' + fecha : ''))
      .then(function (d) {
        fechaVista = d.fecha;
        $('dia-actual').textContent = d.es_hoy ? 'Hoy' : d.titulo;
        $('mi-sub').textContent = d.es_hoy ? d.titulo : '';

        var caja = $('agenda');
        vaciar(caja);

        if (d.cerrado) {
          caja.appendChild(el('p', 'empty', 'Este día no trabajas.'));
        } else if (!d.citas.length) {
          caja.appendChild(el('p', 'empty', 'Ni una cita todavía.'));
        } else {
          d.citas.forEach(function (c) { caja.appendChild(filaCita(c, d.es_hoy)); });
        }
      })
      .catch(function () { aviso('No se pudo cargar la agenda.'); });
  }

  function filaCita(c, esHoy) {
    var fila = el('div', 'member-row editable' + (c.estado === 'cancelada' ? ' cancelada' : ''));
    fila.appendChild(el('div', 'mr-date', c.hora_bonita.replace(' ', '')));

    var info = el('div', 'mr-info');
    info.appendChild(el('div', 'mr-name', c.cliente));
    var sub = c.servicio;
    // La memoria asomando donde sirve: al ver la agenda del día, sin tener
    // que abrir la ficha.
    if (c.notas) sub += ' · ' + c.notas.split('\n')[0];
    info.appendChild(el('div', 'mr-sub', sub));
    fila.appendChild(info);

    fila.addEventListener('click', function () { abrirFicha(c.cliente_id); });
    void esHoy;
    return fila;
  }

  $('dia-ayer').addEventListener('click', function () { moverDia(-1); });
  $('dia-manana').addEventListener('click', function () { moverDia(1); });
  $('dia-actual').addEventListener('click', function () { cargarAgenda(null); });

  function moverDia(n) {
    var d = new Date(fechaVista + 'T12:00:00');
    d.setDate(d.getDate() + n);
    cargarAgenda(d.toISOString().slice(0, 10));
  }

  // ---------- CLIENTES ----------

  var buscarTimer = null;
  $('buscar').addEventListener('input', function () {
    clearTimeout(buscarTimer);
    var t = this.value;
    buscarTimer = setTimeout(function () { cargarClientes(t); }, 200);
  });

  function cargarClientes(termino) {
    api('GET', '/clientes?q=' + encodeURIComponent(termino || ''))
      .then(function (d) {
        var caja = $('lista-clientes');
        vaciar(caja);
        if (!d.clientes.length) {
          caja.appendChild(el('p', 'empty', termino
            ? 'Nadie con ese nombre.'
            : 'Todavía no tienes clientes. Aparecen solos cuando reservan.'));
          return;
        }
        d.clientes.forEach(function (c) {
          var fila = el('div', 'member-row editable');
          fila.appendChild(el('div', 'mr-date', c.visitas + (c.visitas === 1 ? ' vez' : ' vec')));
          var info = el('div', 'mr-info');
          info.appendChild(el('div', 'mr-name', c.nombre));
          info.appendChild(el('div', 'mr-sub', c.ultima ? 'Última: ' + c.ultima : 'Sin visitas'));
          fila.appendChild(info);
          fila.addEventListener('click', function () { abrirFicha(c.id); });
          caja.appendChild(fila);
        });
      })
      .catch(function () { aviso('No se pudieron cargar los clientes.'); });
  }

  // ---------- RECORDATORIOS ----------
  //
  // La pantalla no manda nada: prepara. Cada fila trae el mensaje ya escrito
  // desde el servidor y el botón lo abre en WhatsApp, en el número de siempre
  // del profesional. Al tocarlo se anota el aviso, y esa fila deja de pedir
  // atención mañana. El porqué de no mandarlo solos está en src/recordatorios.js.

  function cargarRecordatorios() {
    api('GET', '/recordatorios')
      .then(function (d) {
        pintarBadge(d.pendientes);

        // El título va siempre, aunque no haya nada: sin él, el "no tienes
        // citas" queda huérfano arriba de la pantalla y no se sabe de qué habla.
        var tituloManana = $('titulo-manana');
        tituloManana.textContent = 'Mañana · ' + d.manana_bonita;
        tituloManana.hidden = false;

        pintarCola($('lista-manana'), d.citas, 'Mañana no tienes citas.');

        $('regresos-nota').textContent =
          'Sueles verlos cada ' + d.regreso_dias + ' días. Estos ya se pasaron.';
        pintarCola($('lista-regresos'), d.regresos, 'Nadie pendiente. Todos al día.');
      })
      .catch(function () { aviso('No se pudieron cargar los recordatorios.'); });
  }

  function pintarCola(caja, lista, vacio) {
    vaciar(caja);
    if (!lista.length) {
      caja.appendChild(el('p', 'empty', vacio));
      return;
    }
    lista.forEach(function (r) { caja.appendChild(filaRecordatorio(r)); });
  }

  function filaRecordatorio(r) {
    var fila = el('div', 'member-row editable' + (r.avisado ? ' avisado' : ''));
    fila.appendChild(el('div', 'mr-date', r.tipo === 'cita' ? r.hora_bonita : r.dias + 'd'));

    var info = el('div', 'mr-info');
    info.appendChild(el('div', 'mr-name', r.nombre));
    info.appendChild(el('div', 'mr-sub', r.tipo === 'cita'
      ? r.servicio
      : 'Hace ' + r.dias + ' días' + (r.habitual ? ' · ' + r.habitual : '')));
    fila.appendChild(info);

    // Sin teléfono no hay a dónde escribir; la fila se queda como recordatorio
    // para el propio Juan, que ya sabrá cómo localizarlo.
    if (r.whatsapp) {
      var wa = el('a', 'wa-btn');
      wa.href = r.whatsapp;
      wa.target = '_blank';
      wa.rel = 'noopener';
      wa.appendChild(el('i', 'fa-brands fa-whatsapp'));
      wa.addEventListener('click', function (e) {
        e.stopPropagation();
        // Se marca al tocar, no al volver: nadie regresa a la app a confirmar
        // que sí mandó el mensaje. Si se arrepiente, la fila se queda tachada
        // y el botón sigue ahí para escribirle de todos modos.
        fila.classList.add('avisado');
        if (!r.avisado) {
          r.avisado = true;
          api('POST', '/recordatorios/marcar', {
            tipo: r.tipo,
            cita_id: r.cita_id,
            cliente_id: r.cliente_id,
          }).then(function () { pintarBadge(Math.max(0, badge() - 1)); })
            .catch(function () { aviso('No se pudo anotar el aviso.'); });
        }
      });
      fila.appendChild(wa);
    }

    fila.addEventListener('click', function () { abrirFicha(r.cliente_id); });
    return fila;
  }

  function badge() { return Number($('badge-regresos').textContent) || 0; }

  function pintarBadge(n) {
    var b = $('badge-regresos');
    b.textContent = n;
    b.hidden = !n;
  }

  // ---------- MI NEGOCIO ----------

  var CAMPOS_NEGOCIO = ['n-nombre', 'n-whatsapp', 'n-ciudad', 'n-regreso'];

  function cargarNegocio() {
    // Los campos están en el HTML desde el principio, así que se pueden
    // teclear ANTES de que llegue la respuesta — y entonces la respuesta
    // borraba lo escrito. Se apagan mientras carga.
    CAMPOS_NEGOCIO.forEach(function (id) { $(id).disabled = true; });

    api('GET', '/negocio').then(function (d) {
      negocio = d;
      $('mi-url').textContent = BRAND.domain + '/' + yo.handle;
      $('n-nombre').value = d.negocio.nombre || '';
      $('n-whatsapp').value = d.negocio.whatsapp || '';
      $('n-ciudad').value = d.negocio.ciudad || '';
      $('n-regreso').value = d.negocio.regreso_dias;
      pintarServicios(d.servicios);
      pintarHorario(d.horario);
      pintarCerrados(d.cerrados);
      CAMPOS_NEGOCIO.forEach(function (id) { $(id).disabled = false; });
    }).catch(function () {
      CAMPOS_NEGOCIO.forEach(function (id) { $(id).disabled = false; });
      aviso('No se pudo cargar tu negocio.');
    });
  }

  $('guardar-negocio').addEventListener('click', function () {
    api('PUT', '/negocio', {
      nombre: $('n-nombre').value,
      whatsapp: $('n-whatsapp').value,
      ciudad: $('n-ciudad').value,
      regreso_dias: $('n-regreso').value
    }).then(function () { aviso('Guardado.'); })
      .catch(function () { aviso('No se pudo guardar.'); });
  });

  function pintarServicios(servicios) {
    var caja = $('lista-servicios');
    vaciar(caja);
    servicios.forEach(function (s) {
      var fila = el('div', 'servicio-fila');
      var info = el('div', 'servicio-info');
      info.appendChild(el('div', 'servicio-n', s.nombre));
      info.appendChild(el('div', 'servicio-d',
        (s.precio === null ? 'Sin precio' : pesos(s.precio)) + ' · ' + s.minutos + ' min'));
      fila.appendChild(info);

      var editar = el('button', 'icono');
      editar.type = 'button';
      editar.appendChild(el('i', 'fa-light fa-pen'));
      editar.addEventListener('click', function () { formServicio(s); });
      fila.appendChild(editar);

      var borrar = el('button', 'icono');
      borrar.type = 'button';
      borrar.appendChild(el('i', 'fa-light fa-trash'));
      borrar.addEventListener('click', function () {
        if (!confirm('¿Quitar "' + s.nombre + '"? Las citas viejas lo conservan.')) return;
        api('DELETE', '/servicio/' + s.id).then(cargarNegocio);
      });
      fila.appendChild(borrar);

      caja.appendChild(fila);
    });
  }

  $('nuevo-servicio').addEventListener('click', function () { formServicio(null); });

  // Alta y edición de servicio en la misma hoja.
  function formServicio(s) {
    var cuerpo = abrirHoja(s ? 'Editar servicio' : 'Nuevo servicio');

    var nombre = campo(cuerpo, 'Nombre', 'text', s ? s.nombre : '', 'Corte');
    var precio = campo(cuerpo, 'Precio', 'number', s && s.precio !== null ? s.precio : '', '250');
    var minutos = campo(cuerpo, 'Cuánto tarda (minutos)', 'number', s ? s.minutos : 30, '30');

    var guardar = el('button', 'btn-primary', 'Guardar');
    guardar.type = 'button';
    guardar.addEventListener('click', function () {
      var datos = { nombre: nombre.value, precio: precio.value, minutos: minutos.value };
      var p = s ? api('PUT', '/servicio/' + s.id, datos) : api('POST', '/servicio', datos);
      p.then(function () { cerrarHoja(); cargarNegocio(); })
        .catch(function (e) { aviso(errorServicio(e.datos && e.datos.error)); });
    });
    cuerpo.appendChild(guardar);
  }

  function errorServicio(clave) {
    var m = {
      nombre: 'Ponle nombre al servicio.',
      minutos: 'Los minutos van entre 5 y 480.',
      precio: 'El precio tiene que ser un número.'
    };
    return m[clave] || 'No se pudo guardar.';
  }

  var NOMBRES_DIA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

  function pintarHorario(horario) {
    var caja = $('lista-horario');
    vaciar(caja);
    // Los siete días siempre visibles: se entiende de un vistazo cuáles están
    // apagados, en vez de tener que adivinar por ausencia.
    for (var dia = 0; dia < 7; dia++) {
      var puesto = null;
      for (var i = 0; i < horario.length; i++) if (horario[i].dia === dia) puesto = horario[i];

      var fila = el('div', 'dia-fila');
      fila.dataset.dia = String(dia);

      var check = document.createElement('input');
      check.type = 'checkbox';
      check.checked = Boolean(puesto);
      check.className = 'dia-check';
      fila.appendChild(check);

      fila.appendChild(el('span', 'dia-nombre', NOMBRES_DIA[dia]));

      var abre = document.createElement('input');
      abre.type = 'time';
      abre.className = 'dia-hora abre';
      abre.value = puesto ? puesto.abre : '10:00';
      fila.appendChild(abre);

      fila.appendChild(el('span', 'dia-a', 'a'));

      var cierra = document.createElement('input');
      cierra.type = 'time';
      cierra.className = 'dia-hora cierra';
      cierra.value = puesto ? puesto.cierra : '19:00';
      fila.appendChild(cierra);

      (function (f, c) {
        var pintar = function () { f.classList.toggle('apagado', !c.checked); };
        c.addEventListener('change', pintar);
        pintar();
      }(fila, check));

      caja.appendChild(fila);
    }
  }

  $('guardar-horario').addEventListener('click', function () {
    var dias = [];
    Array.prototype.forEach.call(document.querySelectorAll('.dia-fila'), function (f) {
      if (!f.querySelector('.dia-check').checked) return;
      dias.push({
        dia: Number(f.dataset.dia),
        abre: f.querySelector('.abre').value,
        cierra: f.querySelector('.cierra').value
      });
    });
    api('PUT', '/horario', { dias: dias })
      .then(function () { aviso('Horario guardado.'); })
      .catch(function () { aviso('No se pudo guardar el horario.'); });
  });

  function pintarCerrados(cerrados) {
    var caja = $('lista-cerrados');
    vaciar(caja);
    if (!cerrados.length) {
      caja.appendChild(el('p', 'vista-nota', 'Ninguno por ahora.'));
      return;
    }
    cerrados.forEach(function (c) {
      var fila = el('div', 'servicio-fila');
      var info = el('div', 'servicio-info');
      info.appendChild(el('div', 'servicio-n', c.fecha));
      if (c.motivo) info.appendChild(el('div', 'servicio-d', c.motivo));
      fila.appendChild(info);

      var quitar = el('button', 'icono');
      quitar.type = 'button';
      quitar.appendChild(el('i', 'fa-light fa-xmark'));
      quitar.addEventListener('click', function () {
        api('DELETE', '/cerrar/' + c.fecha).then(function (d) { pintarCerrados(d.cerrados); });
      });
      fila.appendChild(quitar);
      caja.appendChild(fila);
    });
  }

  $('agregar-cerrado').addEventListener('click', function () {
    var fecha = $('c-fecha').value;
    if (!fecha) { aviso('Escoge una fecha.'); return; }
    api('POST', '/cerrar', { fecha: fecha, motivo: $('c-motivo').value })
      .then(function (d) {
        pintarCerrados(d.cerrados);
        $('c-fecha').value = '';
        $('c-motivo').value = '';
      })
      .catch(function () { aviso('No se pudo marcar ese día.'); });
  });

  // ---------- compartir ----------

  $('copiar').addEventListener('click', function () {
    var url = 'https://' + BRAND.domain + '/' + yo.handle;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(function () { aviso('Liga copiada.'); });
    } else {
      aviso(url);
    }
  });

  $('compartir').addEventListener('click', function () {
    var url = 'https://' + BRAND.domain + '/' + yo.handle;
    if (navigator.share) {
      navigator.share({ title: yo.nombre, text: 'Haz tu cita aquí:', url: url }).catch(function () {});
    } else {
      window.open('https://wa.me/?text=' + encodeURIComponent('Haz tu cita aquí: ' + url), '_blank');
    }
  });

  $('salir').addEventListener('click', function () {
    api('POST', '/salir').then(function () { window.location.href = '/'; });
  });

  // ---------- LA HOJA (ficha del cliente, formularios) ----------

  function abrirHoja(titulo) {
    var cuerpo = $('hoja-cuerpo');
    vaciar(cuerpo);
    if (titulo) cuerpo.appendChild(el('p', 'hoja-titulo', titulo));
    $('hoja').hidden = false;
    document.body.classList.add('con-hoja');
    return cuerpo;
  }

  function cerrarHoja() {
    $('hoja').hidden = true;
    document.body.classList.remove('con-hoja');
  }

  $('hoja-cerrar').addEventListener('click', cerrarHoja);
  $('hoja-fondo').addEventListener('click', cerrarHoja);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !$('hoja').hidden) cerrarHoja();
  });

  function campo(cuerpo, etiqueta, tipo, valor, placeholder) {
    var l = el('label', null, etiqueta);
    var i = document.createElement('input');
    i.type = tipo;
    i.value = valor === null || valor === undefined ? '' : valor;
    if (placeholder) i.placeholder = placeholder;
    cuerpo.appendChild(l);
    cuerpo.appendChild(i);
    return i;
  }

  // LA FICHA DEL CLIENTE — la pantalla central del producto.
  function abrirFicha(clienteId) {
    api('GET', '/cliente/' + clienteId).then(function (c) {
      var cuerpo = abrirHoja(null);

      cuerpo.appendChild(el('p', 'ficha-nombre', c.nombre));
      if (c.telefono) {
        var tel = el('a', 'ficha-tel', c.telefono);
        tel.href = 'https://wa.me/' + c.telefono;
        tel.target = '_blank';
        tel.rel = 'noopener';
        cuerpo.appendChild(tel);
      }

      var datos = el('div', 'ficha-datos');
      if (c.proxima) {
        datos.appendChild(dato('fa-calendar-check', 'Próxima',
          c.proxima.fecha_bonita + ' · ' + c.proxima.hora_bonita));
      }
      if (c.habitual) datos.appendChild(dato('fa-scissors', 'Lo de siempre', c.habitual));
      if (c.dias_sin_venir !== null) {
        datos.appendChild(dato('fa-clock', 'Última visita', 'hace ' + c.dias_sin_venir + ' días'));
      }
      cuerpo.appendChild(datos);

      // --- la MEMORIA ---
      cuerpo.appendChild(el('p', 'bloque-titulo', 'Para recordar'));
      var notas = document.createElement('textarea');
      notas.rows = 4;
      notas.maxLength = 2000;
      notas.placeholder = 'Máquina 1 lados. Tijera arriba. Dejar más largo enfrente.';
      notas.value = c.notas || '';
      cuerpo.appendChild(notas);

      var guardar = el('button', 'btn-soft', 'Guardar nota');
      guardar.type = 'button';
      guardar.addEventListener('click', function () {
        api('PUT', '/cliente/' + c.id + '/notas', { notas: notas.value })
          .then(function () { aviso('Nota guardada.'); })
          .catch(function () { aviso('No se pudo guardar.'); });
      });
      cuerpo.appendChild(guardar);

      // --- historial ---
      if (c.historial.length) {
        cuerpo.appendChild(el('p', 'bloque-titulo', 'Historial'));
        var lista = el('div', 'historial');
        c.historial.forEach(function (h) {
          var fila = el('div', 'hist-fila');
          fila.appendChild(el('span', 'hist-fecha', h.fecha_bonita));
          fila.appendChild(el('span', 'hist-serv', h.servicio));
          lista.appendChild(fila);
        });
        cuerpo.appendChild(lista);
      }

      var nueva = el('button', 'btn-primary', 'Nueva cita');
      nueva.type = 'button';
      nueva.addEventListener('click', function () {
        formCita({ nombre: c.nombre, telefono: c.telefono, habitual: c.habitual });
      });
      cuerpo.appendChild(nueva);
    }).catch(function () { aviso('No se pudo abrir la ficha.'); });
  }

  function dato(icono, etiqueta, valor) {
    var d = el('div', 'ficha-dato');
    d.appendChild(el('i', 'fa-light ' + icono));
    var t = el('div', 'ficha-dato-txt');
    t.appendChild(el('span', 'ficha-etq', etiqueta));
    t.appendChild(el('span', 'ficha-val', valor));
    d.appendChild(t);
    return d;
  }

  // Apuntar una cita a mano: alguien que llegó o llamó.
  $('nueva-cita').addEventListener('click', function () { formCita(null); });

  function formCita(previo) {
    var cuerpo = abrirHoja('Apuntar una cita');
    var estado = { servicio: null, fecha: fechaVista, hora: null };

    var nombre = campo(cuerpo, 'Nombre', 'text', previo ? previo.nombre : '', 'Luis');
    var telefono = campo(cuerpo, 'Celular', 'tel', previo ? previo.telefono : '', '686 123 4567');

    cuerpo.appendChild(el('label', null, 'Servicio'));
    var sel = document.createElement('select');
    (negocio ? negocio.servicios : []).forEach(function (s) {
      var o = document.createElement('option');
      o.value = s.id;
      o.textContent = s.nombre + (s.precio === null ? '' : ' · ' + pesos(s.precio));
      if (previo && previo.habitual === s.nombre) o.selected = true;
      sel.appendChild(o);
    });
    cuerpo.appendChild(sel);

    var fecha = campo(cuerpo, 'Día', 'date', estado.fecha, '');

    cuerpo.appendChild(el('label', null, 'Hora'));
    var horas = el('div', 'horas');
    cuerpo.appendChild(horas);

    function refrescar() {
      vaciar(horas);
      horas.appendChild(el('p', 'cargando', 'Buscando…'));
      api('GET', '/huecos?fecha=' + fecha.value + '&servicio=' + sel.value).then(function (d) {
        vaciar(horas);
        if (!d.horas.length) {
          horas.appendChild(el('p', 'vista-nota', 'Sin huecos ese día.'));
          return;
        }
        d.horas.forEach(function (h) {
          var b = el('button', 'hora-btn', h);
          b.type = 'button';
          b.addEventListener('click', function () {
            estado.hora = h;
            Array.prototype.forEach.call(horas.children, function (x) { x.classList.remove('elegida'); });
            b.classList.add('elegida');
          });
          horas.appendChild(b);
        });
      });
    }

    sel.addEventListener('change', refrescar);
    fecha.addEventListener('change', refrescar);
    refrescar();

    var guardar = el('button', 'btn-primary', 'Apuntar');
    guardar.type = 'button';
    guardar.addEventListener('click', function () {
      if (!estado.hora) { aviso('Escoge una hora.'); return; }
      api('POST', '/agenda', {
        servicioId: sel.value,
        fecha: fecha.value,
        hora: estado.hora,
        nombre: nombre.value,
        telefono: telefono.value
      }).then(function () {
        cerrarHoja();
        cargarAgenda(fecha.value);
        ir('hoy');
      }).catch(function (e) {
        aviso(e.status === 409 ? 'Esa hora acaba de ocuparse.' : 'No se pudo apuntar la cita.');
      });
    });
    cuerpo.appendChild(guardar);
  }

  // ---------- arranque ----------

  api('GET', '/yo').then(function (d) {
    yo = d;
    $('mi-sub').textContent = d.url;
    return api('GET', '/negocio');
  }).then(function (d) {
    negocio = d;
    ir('hoy');
    // La pastilla se calcula al entrar, sin esperar a que abran la pestaña:
    // es lo único de la app que pide algo en vez de solo enseñarlo.
    api('GET', '/recordatorios').then(function (r) { pintarBadge(r.pendientes); });
  }).catch(function () { /* api() ya mandó al alta si no había sesión */ });
})();
