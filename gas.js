// URL del backend en Render
const API_URL = 'https://backend-klap.onrender.com';

// Medios de pago (las claves coinciden con las del backend)
const MEDIOS = {
  transbank_mall: { nombre: 'Transbank (Mall)' },
  transbank_plus: { nombre: 'Transbank (Plus)', autoWebpay: true }, // se presiona Webpay solo
  klap:           { nombre: 'Klap' },
  pagonxt:        { nombre: 'Pagonxt' }
};

// Medio y modo vienen en la URL: gas.html?tienda=klap&modo=test
const params = new URLSearchParams(window.location.search);
const tienda = params.get('tienda');
const modo = params.get('modo') === 'prod' ? 'prod' : 'test';
const medio = Object.prototype.hasOwnProperty.call(MEDIOS, tienda) ? MEDIOS[tienda] : null;
if (!medio) window.location.replace('index.html');

const etiquetaModo = modo === 'prod' ? 'PRODUCCIÓN' : 'TEST';

const consultaForm = document.getElementById('consultaForm');
const consultaMsg = document.getElementById('consultaMsg');
const btnConsultar = document.getElementById('btnConsultar');
const inputDni = document.getElementById('dni');
const docLabel = document.getElementById('docLabel');
const medioChip = document.getElementById('medioChip');
const cambiarMedio = document.getElementById('cambiarMedio');
const accionPago = document.getElementById('accionPago');
const btnPagar = document.getElementById('btnPagar');
const pagoSection = document.getElementById('pagoSection');
const pagoMsg = document.getElementById('pagoMsg');
const modalEl = document.getElementById('modalPago');
const modal = new bootstrap.Modal(modalEl);

let cuentaActual = null;
let scriptCargado = null; // promesa de carga de la librería (se carga una sola vez)

// ---------- Configuración inicial de la página ----------
docLabel.textContent = 'N° de Cliente (RUT)';
inputDni.placeholder = '12.345.678-9';
inputDni.maxLength = 12;
inputDni.inputMode = 'text';
if (medio) {
  medioChip.textContent = `${medio.nombre} · ${etiquetaModo}`;
  btnPagar.textContent = `Pagar con ${medio.nombre}`;
}
if (modo === 'prod') medioChip.classList.add('prod');
cambiarMedio.href = `index.html?modo=${modo}`;

// ---------- Utilidades ----------
function formatoCLP(valor) {
  return valor.toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
}

// Formato RUT chileno: xx.xxx.xxx-x (el último carácter es el dígito verificador, puede ser K)
function formatearRut(valor) {
  const limpio = valor.replace(/[^0-9kK]/g, '').toUpperCase().slice(0, 9);
  if (limpio.length <= 1) return limpio;
  const cuerpo = limpio.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${cuerpo}-${limpio.slice(-1)}`;
}

inputDni.addEventListener('input', () => {
  inputDni.value = formatearRut(inputDni.value);
});

function mostrarFormulario() {
  pagoSection.style.position = '';
  pagoSection.style.left = '';
  pagoSection.style.top = '';
  pagoSection.style.width = '';
  pagoSection.style.visibility = '';
}

// Saca el formulario de la pantalla sin quitarlo del layout ni del DOM,
// para que PayZen lo dibuje normalmente y se pueda presionar su botón
function ocultarFormulario() {
  pagoSection.style.position = 'absolute';
  pagoSection.style.left = '-9999px';
  pagoSection.style.top = '0';
  pagoSection.style.width = '420px';
  pagoSection.style.visibility = 'hidden';
}

function quitarFormularioKR() {
  try {
    if (window.KR && window.KR.removeForms) Promise.resolve(window.KR.removeForms()).catch(() => {});
  } catch (e) { /* nada que quitar */ }
}

function resetPopup() {
  accionPago.classList.remove('d-none');
  btnPagar.disabled = false;
  pagoSection.classList.add('d-none');
  pagoSection.innerHTML = '';
  mostrarFormulario();
  pagoMsg.textContent = '';
  pagoMsg.className = 'form-text text-danger mt-2';
  quitarFormularioKR();
}

// Al cerrar el popup se vuelve al paso inicial
modalEl.addEventListener('hidden.bs.modal', resetPopup);

// ---------- 1) Consultar deuda y abrir el popup ----------
consultaForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const dni = formatearRut(inputDni.value.trim());
  consultaMsg.textContent = 'Consultando…';
  consultaMsg.className = 'form-text mt-2';
  btnConsultar.disabled = true;

  try {
    const r = await fetch(`${API_URL}/api/consulta-deuda`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dni, tienda, modo })
    });
    const data = await r.json();

    if (!r.ok) {
      consultaMsg.textContent = data.error;
      consultaMsg.className = 'form-text mt-2 text-danger';
      return;
    }

    cuentaActual = data;
    consultaMsg.textContent = '';
    document.getElementById('rNombre').textContent = data.nombre;
    document.getElementById('rDocumento').textContent = data.numeroCliente;
    document.getElementById('rDireccion').textContent = data.direccion;
    document.getElementById('rPeriodo').textContent = data.periodo;
    document.getElementById('rVencimiento').textContent = data.vencimiento;
    document.getElementById('rMedio').textContent = `${data.medioPago} · ${etiquetaModo}`;
    document.getElementById('rMonto').textContent = formatoCLP(data.monto);
    resetPopup();
    modal.show();
  } catch (err) {
    consultaMsg.textContent = 'Error de conexión con el servidor.';
    consultaMsg.className = 'form-text mt-2 text-danger';
  } finally {
    btnConsultar.disabled = false;
  }
});

// ---------- 2) Pagar: crear el pago y mostrar el formulario ----------
btnPagar.addEventListener('click', async () => {
  if (!cuentaActual) return;

  btnPagar.disabled = true;
  pagoMsg.textContent = 'Generando pago…';
  pagoMsg.className = 'form-text text-muted mt-2';

  try {
    const [cfgRes, pagoRes] = await Promise.all([
      fetch(`${API_URL}/api/config?tienda=${encodeURIComponent(tienda)}&modo=${encodeURIComponent(modo)}`),
      fetch(`${API_URL}/api/crear-pago`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dni: cuentaActual.numeroCliente, tienda, modo })
      })
    ]);
    const cfg = await cfgRes.json();
    const pago = await pagoRes.json();

    if (!cfgRes.ok || !pagoRes.ok) {
      throw new Error((pago && pago.error) || (cfg && cfg.error) || 'No se pudo iniciar el pago.');
    }

    // Se oculta el botón y aparece el formulario
    accionPago.classList.add('d-none');
    pagoMsg.textContent = '';
    await montarFormularioPago(cfg, pago.formToken);
  } catch (err) {
    pagoMsg.textContent = err.message || 'Error al conectar con el servidor de pago.';
    pagoMsg.className = 'form-text text-danger mt-2';
    pagoSection.classList.add('d-none');
    pagoSection.innerHTML = '';
    quitarFormularioKR();
    mostrarFormulario();
    accionPago.classList.remove('d-none');
    btnPagar.disabled = false;
  }
});

function cargarScript(src, atributos = {}) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    Object.entries(atributos).forEach(([k, v]) => s.setAttribute(k, v));
    s.onload = resolve;
    s.onerror = () => reject(new Error('No se pudo cargar ' + src));
    document.head.appendChild(s);
  });
}

// La librería y el tema se cargan una sola vez; la clave pública se indica
// después con KR.setFormConfig
function cargarKrypton(cfg) {
  if (scriptCargado) return scriptCargado;

  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = cfg.themeCss;
  document.head.appendChild(css);

  scriptCargado = cargarScript(cfg.jsUrl, { 'kr-public-key': cfg.publicKey })
    .then(() => cargarScript(cfg.themeJs));

  scriptCargado.catch(() => { scriptCargado = null; });
  return scriptCargado;
}

// Busca el elemento clicable que corresponde a Webpay/Transbank.
// Solo considera elementos que mencionen Webpay en sus atributos, clases, texto o imágenes;
// nunca el botón de tarjeta. Si hay varios anidados, toma el más interno.
const RE_WEBPAY = /webpay|transbank/i;

function buscarBotonWebpay(contenedor) {
  const candidatos = Array.from(
    contenedor.querySelectorAll('button, a, [role="button"], [kr-payment-method], .kr-payment-button, .kr-smart-button')
  ).filter((el) => !el.disabled && el.getAttribute('aria-disabled') !== 'true');

  const coinciden = candidatos.filter((el) => RE_WEBPAY.test(el.outerHTML));
  if (!coinciden.length) return null;

  // el que tiene menos HTML es el más específico (no un contenedor que agrupa varios medios)
  coinciden.sort((a, b) => a.outerHTML.length - b.outerHTML.length);
  return coinciden[0];
}

// Espera a que aparezca el botón de Webpay y lo presiona una sola vez.
// Devuelve true si lo presionó, false si no apareció a tiempo.
function autoPresionarWebpay(contenedor, timeoutMs = 10000) {
  return new Promise((resolve) => {
    const inicio = Date.now();

    const revisar = () => {
      const boton = buscarBotonWebpay(contenedor);
      if (boton) {
        console.log('[Webpay] Botón encontrado, presionando:', boton);
        boton.click();
        return resolve(true);
      }
      if (Date.now() - inicio >= timeoutMs) {
        console.warn('[Webpay] No se encontró el botón. HTML del formulario:\n', contenedor.innerHTML);
        return resolve(false);
      }
      setTimeout(revisar, 250);
    };

    revisar();
  });
}

async function montarFormularioPago(cfg, formToken) {
  // PayZen hace POST al backend (un sitio estático no puede recibirlo)
  const retorno = `${API_URL}/retorno-pago`;
  const autoPagar = Boolean(medio && medio.autoWebpay);

  pagoSection.innerHTML = '<div id="krForm" class="kr-smart-form" kr-card-form-expanded></div>';
  pagoSection.classList.remove('d-none');

  if (autoPagar) {
    ocultarFormulario();
    pagoMsg.textContent = 'Redirigiendo a Webpay…';
    pagoMsg.className = 'form-text text-muted mt-2';
  } else {
    mostrarFormulario();
  }

  await cargarKrypton(cfg);

  // setFormConfig ya renderiza el formulario; no llamar a KR.renderElements
  await window.KR.setFormConfig({
    'kr-public-key': cfg.publicKey,
    'kr-post-url-success': retorno,
    'kr-post-url-refused': retorno,
    'kr-language': 'es-ES',
    formToken
  });

  if (autoPagar) {
    const ok = await autoPresionarWebpay(pagoSection);
    if (!ok) {
      // No se encontró el botón: se muestra el formulario para pagar manualmente
      mostrarFormulario();
      pagoMsg.textContent = 'Presiona la opción de Webpay para continuar con el pago.';
      pagoMsg.className = 'form-text text-muted mt-2';
    }
  }
}