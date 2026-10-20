// URL del backend en Render
const API_URL = 'https://backend-klap.onrender.com';

// Medios en los que se presiona Webpay automáticamente al cargar el formulario
const AUTO_WEBPAY = ['transbank_plus'];

const cargando = document.getElementById('cargando');
const errorCuenta = document.getElementById('errorCuenta');
const contenido = document.getElementById('contenido');
const generando = document.getElementById('generando');
const generandoTxt = document.getElementById('generandoTxt');
const pagoSection = document.getElementById('pagoSection');
const pagoMsg = document.getElementById('pagoMsg');
const reintentar = document.getElementById('reintentar');
const volver = document.getElementById('volver');

const params = new URLSearchParams(window.location.search);
const dni = params.get('dni');
const tienda = params.get('tienda');
const modo = params.get('modo') === 'prod' ? 'prod' : 'test';
const etiquetaModo = modo === 'prod' ? 'PRODUCCIÓN' : 'TEST';
const autoPagar = AUTO_WEBPAY.includes(tienda);

let cuentaActual = null;
let scriptCargado = null; // la librería se carga una sola vez

// El enlace "volver" regresa a la página de Pago fácil del mismo medio
if (tienda) volver.href = `gas.html?tienda=${encodeURIComponent(tienda)}&modo=${modo}`;

function formatoCLP(valor) {
  return valor.toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
}

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

// ---------- 1) Cargar el detalle de la cuenta ----------
(async function init() {
  if (!dni || !tienda) { window.location.replace('index.html'); return; }

  try {
    const r = await fetch(`${API_URL}/api/consulta-deuda`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dni, tienda, modo })
    });
    const data = await r.json();

    cargando.classList.add('d-none');
    if (!r.ok) {
      errorCuenta.textContent = data.error || 'No se pudo cargar la cuenta.';
      errorCuenta.classList.remove('d-none');
      return;
    }

    cuentaActual = data;
    document.getElementById('rNombre').textContent = data.nombre;
    document.getElementById('rRut').textContent = data.numeroCliente;
    document.getElementById('rDireccion').textContent = data.direccion;
    document.getElementById('rPeriodo').textContent = data.periodo;
    document.getElementById('rVencimiento').textContent = data.vencimiento;
    document.getElementById('rMonto').textContent = formatoCLP(data.monto);
    const medio = document.getElementById('rMedio');
    medio.textContent = `${data.medioPago} · ${etiquetaModo}`;
    medio.classList.remove('d-none');
    contenido.classList.remove('d-none');

    iniciarPago();
  } catch (err) {
    cargando.classList.add('d-none');
    errorCuenta.textContent = 'Error de conexión con el servidor.';
    errorCuenta.classList.remove('d-none');
  }
})();

// ---------- 2) Crear el pago y mostrar el formulario ----------
async function iniciarPago() {
  reintentar.classList.add('d-none');
  pagoMsg.textContent = '';
  pagoMsg.className = 'form-text text-danger text-center mt-2';
  generandoTxt.textContent = 'Preparando el pago…';
  generando.classList.remove('d-none');
  pagoSection.classList.add('d-none');
  mostrarFormulario();

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

    const redirigiendo = await montarFormularioPago(cfg, pago.formToken);
    // Si se presionó Webpay, la página se va a Webpay: se deja el mensaje "Redirigiendo…"
    if (!redirigiendo) generando.classList.add('d-none');
  } catch (err) {
    generando.classList.add('d-none');
    pagoSection.classList.add('d-none');
    pagoSection.innerHTML = '';
    quitarFormularioKR();
    mostrarFormulario();
    pagoMsg.textContent = err.message || 'Error al conectar con el servidor de pago.';
    pagoMsg.className = 'form-text text-danger text-center mt-2';
    reintentar.classList.remove('d-none');
  }
}

document.getElementById('btnReintentar').addEventListener('click', () => {
  pagoSection.innerHTML = '';
  quitarFormularioKR();
  iniciarPago();
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

// Devuelve true si se presionó el botón de Webpay automáticamente
async function montarFormularioPago(cfg, formToken) {
  // PayZen hace POST al backend (un sitio estático no puede recibirlo)
  const retorno = `${API_URL}/retorno-pago`;

  pagoSection.innerHTML = '<div id="krForm" class="kr-smart-form" kr-card-form-expanded></div>';
  pagoSection.classList.remove('d-none');

  if (autoPagar) {
    ocultarFormulario();
    generandoTxt.textContent = 'Redirigiendo a Webpay…';
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

  if (!autoPagar) return false;

  const ok = await autoPresionarWebpay(pagoSection);
  if (ok) return true;

  // No se encontró el botón: se muestra el formulario para pagar manualmente
  mostrarFormulario();
  pagoMsg.textContent = 'Presiona la opción de Webpay para continuar con el pago.';
  pagoMsg.className = 'form-text text-muted text-center mt-2';
  return false;
}