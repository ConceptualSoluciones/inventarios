/* SANTO — página: ingreso con PIN personal */
(function () {
  'use strict';
  const {
    h, ocupado, libre, aviso, Hoja, render
  } = Santo;

  // ---------- ingreso: PIN personal (el nombre lo dice el servidor) ----------

  function mostrarIngreso() {
    Hoja.cerrar();
    const pantalla = document.getElementById('ingreso');
    const pin = h('input', {
      class: 'campo', id: 'ing-pin', type: 'password', inputmode: 'numeric', pattern: '[0-9]*',
      autocomplete: 'current-password', maxlength: 6, enterkeyhint: 'go'
    });
    const error = h('p', { class: 'ingreso-error', role: 'alert'
  });
    const btn = h('button', { type: 'submit', class: 'btn btn-primario' }, 'Entrar');

    async function entrar(e) {
      e.preventDefault();
      const clave = pin.value.trim();
      if (!/^\d{6}$/.test(clave)) { error.textContent = 'Tu PIN tiene 6 números.'; pin.focus(); return; }
      error.textContent = '';
      Api.sesion.olvidarPin();
      ocupado(btn, 'Entrando…');
      try {
        const quien = await Api.ingresar(clave);
        pantalla.hidden = true;
        document.getElementById('app').inert = false;
        render();
        aviso(`Hola, ${quien.nombre}`);
      } catch (err) {
        if (err && err.codigo === 'pin') {
          Api.sesion.olvidarPin();
          error.textContent = 'PIN incorrecto. Si lo olvidaste, pídele a un admin uno nuevo.';
          pin.select();
        } else if (err && err.codigo === 'bloqueado') {
          Api.sesion.olvidarPin();
          error.textContent = err.message;
        } else {
          error.textContent = (err && err.codigo !== 'red' && err.message) || 'No se pudo conectar. Revisa tu conexión y vuelve a intentar.';
        }
      } finally {
        libre(btn);
      }
    }

    pantalla.replaceChildren(h('div', { class: 'ingreso-caja' },
      h('p', { class: 'logo' }, 'santo'),
      h('h1', { class: 'titulo' }, 'Hola'),
      h('p', { class: 'texto-suave' }, 'Escribe tu PIN personal de 6 números. Este celular queda reconocido por 30 días.'),
      Api.modoDemo() && h('p', { class: 'nota' }, 'Modo demo: 111111 entra como admin y 222222 como cocina.'),
      h('form', { class: 'ingreso-form', novalidate: true, onsubmit: entrar },
        h('div', { class: 'campo-grupo' }, h('label', { class: 'etiqueta-campo', for: 'ing-pin' }, 'Tu PIN'), pin),
        error,
        btn)));
    pantalla.hidden = false;
    document.getElementById('app').inert = true;
    pin.focus();
  }

  Santo.ganchos.mostrarIngreso = mostrarIngreso;
})();
